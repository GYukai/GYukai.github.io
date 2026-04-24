import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readPosts } from "./lib/content.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const contentRoot = path.join(root, "content");
const outDir = path.join(root, "_site");
const assetsDir = path.join(root, "assets");

const profile = JSON.parse(
  await fs.readFile(path.join(contentRoot, "profile.json"), "utf8")
);

const siteUrl = String(profile.site?.url || "https://gyukai.github.io").replace(/\/$/, "");
const defaultLang = String(profile.site?.defaultLang || "zh");

await fs.rm(outDir, { recursive: true, force: true });
await fs.mkdir(outDir, { recursive: true });
await copyDir(assetsDir, path.join(outDir, "assets"));
await writeFile(".nojekyll", "\n");

const posts = (await readPosts(contentRoot))
  .filter((post) => !post.draft)
  .sort((a, b) => b.date.localeCompare(a.date) || a.title.localeCompare(b.title));

const groupedPosts = groupPosts(posts);
const academicGroups = groupedPosts
  .map((group) => ({
    key: group.key,
    posts: group.posts.filter((post) => post.visibility === "academic")
  }))
  .filter((group) => group.posts.length > 0);

await writeFile("index.html", renderHome(academicGroups));
await writeFile("posts/index.html", renderAcademicIndex(academicGroups));
await writeFile("blog/index.html", renderFullBlog(groupedPosts));

for (const group of groupedPosts) {
  for (const post of group.posts) {
    const section = post.visibility === "academic" ? "posts" : "blog";
    await writeFile(`${section}/${post.slug}/index.html`, renderPost(post, group));
  }
}

await writeFile("feed.xml", renderFeed(academicGroups));
await writeFile("sitemap.xml", renderSitemap(academicGroups));
await writeFile("robots.txt", renderRobots());
await writeFile(
  "posts.json",
  JSON.stringify(academicGroups.flatMap((group) => group.posts).map(publicPostData), null, 2)
);

console.log(`Built ${posts.length} posts into ${path.relative(root, outDir)}/`);

function groupPosts(postList) {
  const groups = new Map();
  for (const post of postList) {
    if (!groups.has(post.translationKey)) {
      groups.set(post.translationKey, { key: post.translationKey, posts: [] });
    }
    groups.get(post.translationKey).posts.push(post);
  }

  return Array.from(groups.values())
    .map((group) => ({
      ...group,
      posts: group.posts.sort((a, b) => langRank(a.lang) - langRank(b.lang))
    }))
    .sort((a, b) => latestDate(b).localeCompare(latestDate(a)));
}

function langRank(lang) {
  if (lang === defaultLang) return 0;
  if (lang === "en") return 1;
  return 2;
}

function latestDate(group) {
  return group.posts.reduce((latest, post) => (post.date > latest ? post.date : latest), "");
}

function pickPost(group, lang = defaultLang) {
  return (
    group.posts.find((post) => post.lang === lang) ||
    group.posts.find((post) => post.lang === "en") ||
    group.posts[0]
  );
}

function publicPostData(post) {
  return {
    title: post.title,
    date: post.date,
    lang: post.lang,
    slug: post.slug,
    visibility: post.visibility,
    translationKey: post.translationKey,
    tags: post.tags,
    url: postPath(post)
  };
}

function renderHome(groups) {
  const person = profile.person || {};
  const research = profile.research || [];
  const links = profile.links || [];
  const latest = groups.slice(0, 6);

  const body = `${siteHeader()}
<main>
  <h1>${escapeHtml(person.name || "Yukai Gu")} <span class="muted">${escapeHtml(person.nameZh || "")}</span></h1>
  <div class="two-lang lead">
    <section aria-label="Chinese introduction">
      ${(profile.intro?.zh || []).map((text) => `<p>${escapeHtml(text)}</p>`).join("\n")}
    </section>
    <section aria-label="English introduction">
      ${(profile.intro?.en || []).map((text) => `<p>${escapeHtml(text)}</p>`).join("\n")}
    </section>
  </div>

  <h2>Research</h2>
  <table>
    <thead>
      <tr><th>Period</th><th>Thread</th><th>Notes</th></tr>
    </thead>
    <tbody>
      ${research
        .map(
          (item) => `<tr>
        <td>${escapeHtml(item.period || "")}</td>
        <td><strong>${escapeHtml(item.title || "")}</strong><br><span class="muted">${escapeHtml(item.org || "")}</span></td>
        <td>${escapeHtml(item.description || "")}${renderTags(item.tags || [])}</td>
      </tr>`
        )
        .join("\n")}
    </tbody>
  </table>

  <h2>Academic Notes</h2>
  ${renderEntryList(latest, { showVisibility: false })}
  <p><a href="/posts/">All academic notes</a></p>

  <h2>Small Rules</h2>
  <ol>
    <li>Write pages that survive without a client-side application.</li>
    <li>Keep equations close to the prose, for example $V^\\pi(s)=\\mathbb{E}_\\pi[G_t\\mid S_t=s]$.</li>
    <li>Separate academic notes from personal commentary by metadata, not by memory.</li>
    <li>Prefer durable links, dates, and source Markdown over clever presentation.</li>
  </ol>

  <h2>Links</h2>
  <ul>
    ${links.map((link) => `<li><a href="${escapeAttr(link.url)}">${escapeHtml(link.label)}</a></li>`).join("\n")}
  </ul>
</main>
${siteFooter()}`;

  return layout({
    title: profile.site?.title || "Yukai Gu",
    description: profile.site?.description || "",
    body,
    pathName: "/",
    lang: "zh"
  });
}

function renderAcademicIndex(groups) {
  const body = `${siteHeader()}
<main>
  <h1>Academic Notes</h1>
  <p class="lead">论文阅读、研究笔记、实验札记和可公开讨论的技术判断。</p>
  ${renderEntryList(groups, { showVisibility: false })}
</main>
${siteFooter()}`;

  return layout({
    title: `Academic Notes - ${profile.site?.title || "Yukai Gu"}`,
    description: "Academic notes and research writing.",
    body,
    pathName: "/posts/",
    lang: "zh"
  });
}

function renderFullBlog(groups) {
  const body = `${siteHeader()}
<main>
  <h1>Complete Blog List</h1>
  <p class="lead">这里是完整索引，包含学术文章、读书评论、文章评论和更私人化的判断。它不进入学术 RSS 与 sitemap。</p>
  ${renderEntryList(groups, { showVisibility: true })}
</main>
${siteFooter()}`;

  return layout({
    title: `Complete Blog - ${profile.site?.title || "Yukai Gu"}`,
    description: "Complete blog list, including personal commentary.",
    body,
    pathName: "/blog/",
    lang: "zh",
    noindex: true
  });
}

function renderPost(post, group) {
  const isAcademic = post.visibility === "academic";
  const bodyHtml = markdownToHtml(post.body);
  const languageLinks = renderLanguageLinks(group, post);
  const badge =
    post.translatedBy && post.translatedBy.toLowerCase().includes("llm")
      ? `<span class="badge">powered by llm</span>`
      : "";
  const note =
    post.translatedBy && post.translatedBy.toLowerCase().includes("llm")
      ? `<p class="post-note">This translation was generated by an LLM and may receive later human edits.</p>`
      : "";

  const body = `${siteHeader()}
<main>
  <article class="post">
    <header class="post-header">
      <h1>${escapeHtml(post.title)}</h1>
      <p class="meta">${formatDate(post.date, post.lang)} · ${escapeHtml(languageName(post.lang))} · ${escapeHtml(post.visibility)} ${badge}</p>
      ${post.tags.length ? `<p>${renderTags(post.tags)}</p>` : ""}
      ${languageLinks ? `<p class="language-links">${languageLinks}</p>` : ""}
      ${post.summary ? `<p class="lead">${escapeHtml(post.summary)}</p>` : ""}
      ${note}
    </header>
    ${bodyHtml}
  </article>
</main>
${siteFooter()}`;

  return layout({
    title: `${post.title} - ${profile.site?.title || "Yukai Gu"}`,
    description: post.summary || excerptFromMarkdown(post.body),
    body,
    pathName: postPath(post),
    lang: post.lang,
    noindex: !isAcademic,
    alternates: group.posts.map((other) => ({
      lang: other.lang,
      href: absoluteUrl(postPath(other))
    }))
  });
}

function renderEntryList(groups, options) {
  if (!groups.length) {
    return "<p>No posts yet.</p>";
  }

  return `<ol class="entry-list">
${groups
  .map((group) => {
    const post = pickPost(group);
    const links = renderLanguageLinks(group, post);
    const visibility = options.showVisibility
      ? ` · <span class="muted">${escapeHtml(post.visibility)}</span>`
      : "";
    const summary = post.summary || excerptFromMarkdown(post.body);
    return `<li>
  <time datetime="${escapeAttr(post.date)}">${formatDate(post.date, post.lang)}</time>${visibility}<br>
  <a class="entry-title" href="${escapeAttr(postPath(post))}">${escapeHtml(post.title)}</a>
  ${links ? `<div class="language-links">${links}</div>` : ""}
  ${summary ? `<p>${escapeHtml(summary)}</p>` : ""}
</li>`;
  })
  .join("\n")}
</ol>`;
}

function renderLanguageLinks(group, currentPost) {
  const links = group.posts
    .filter((post) => post.slug !== currentPost.slug)
    .map(
      (post) =>
        `<a hreflang="${escapeAttr(post.lang)}" href="${escapeAttr(postPath(post))}">${escapeHtml(languageName(post.lang))}</a>`
    );
  return links.length ? `Also in ${links.join(" / ")}` : "";
}

function renderTags(tags) {
  if (!tags.length) return "";
  return ` <ul class="tag-list">${tags.map((tag) => `<li>${escapeHtml(tag)}</li>`).join("")}</ul>`;
}

function siteHeader() {
  const person = profile.person || {};
  return `<header class="site-header">
  <a class="brand" href="/">
    <img src="/assets/gy-mark.svg" width="52" height="52" alt="">
    <span><strong>${escapeHtml(person.name || "Yukai Gu")}</strong><small>${escapeHtml(person.location || "")}</small></span>
  </a>
  <nav class="site-nav" aria-label="Primary">
    <a href="/">Home</a>
    <a href="/posts/">Academic notes</a>
    <a href="/feed.xml">RSS</a>
    <a href="https://github.com/${escapeAttr(person.github || "GYukai")}">GitHub</a>
  </nav>
</header>`;
}

function siteFooter() {
  return `<footer class="site-footer">
  <p>Academic writing is surfaced first. The complete list is kept at <a href="/blog/">/blog/</a>.</p>
</footer>`;
}

function layout({ title, description, body, pathName, lang, noindex = false, alternates = [] }) {
  const htmlLang = lang === "zh" ? "zh-CN" : "en";
  const canonical = absoluteUrl(pathName);
  return `<!doctype html>
<html lang="${htmlLang}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeAttr(description)}">
  ${noindex ? '<meta name="robots" content="noindex,nofollow">' : ""}
  <link rel="canonical" href="${escapeAttr(canonical)}">
  <link rel="stylesheet" href="/assets/site.css">
  <link rel="alternate" type="application/rss+xml" title="Academic feed" href="/feed.xml">
  ${alternates
    .map(
      (alternate) =>
        `<link rel="alternate" hreflang="${escapeAttr(alternate.lang)}" href="${escapeAttr(alternate.href)}">`
    )
    .join("\n  ")}
  <script>
    window.MathJax = {
      tex: {
        inlineMath: [["$", "$"], ["\\\\(", "\\\\)"]],
        displayMath: [["$$", "$$"], ["\\\\[", "\\\\]"]]
      },
      svg: { fontCache: "global" }
    };
  </script>
  <script defer src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-svg.js"></script>
</head>
<body>
${body}
</body>
</html>
`;
}

function renderFeed(groups) {
  const entries = groups.slice(0, 20).map((group) => pickPost(group));
  return `<?xml version="1.0" encoding="UTF-8" ?>
<rss version="2.0">
  <channel>
    <title>${escapeXml(profile.site?.title || "Yukai Gu")} - Academic Notes</title>
    <link>${escapeXml(siteUrl)}</link>
    <description>${escapeXml(profile.site?.description || "")}</description>
    ${entries
      .map((post) => {
        const url = absoluteUrl(postPath(post));
        return `<item>
      <title>${escapeXml(post.title)}</title>
      <link>${escapeXml(url)}</link>
      <guid>${escapeXml(url)}</guid>
      <pubDate>${new Date(`${post.date}T00:00:00Z`).toUTCString()}</pubDate>
      <description>${escapeXml(post.summary || excerptFromMarkdown(post.body))}</description>
    </item>`;
      })
      .join("\n    ")}
  </channel>
</rss>
`;
}

function renderSitemap(groups) {
  const academicPosts = groups.flatMap((group) => group.posts);
  const paths = ["/", "/posts/", ...academicPosts.map(postPath)];
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${paths
  .map(
    (pathName) => `  <url>
    <loc>${escapeXml(absoluteUrl(pathName))}</loc>
  </url>`
  )
  .join("\n")}
</urlset>
`;
}

function renderRobots() {
  return `User-agent: *
Disallow: /blog/
Allow: /
Sitemap: ${siteUrl}/sitemap.xml
`;
}

function postPath(post) {
  const section = post.visibility === "academic" ? "posts" : "blog";
  return `/${section}/${post.slug}/`;
}

function absoluteUrl(pathName) {
  return `${siteUrl}${pathName.startsWith("/") ? pathName : `/${pathName}`}`;
}

function formatDate(date, lang) {
  if (!date) return "";
  if (lang === "zh") return date;
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    timeZone: "UTC"
  });
}

function languageName(lang) {
  if (lang === "zh") return "中文";
  if (lang === "en") return "English";
  return lang;
}

function markdownToHtml(markdown) {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const html = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    const trimmed = line.trim();

    if (!trimmed) {
      index += 1;
      continue;
    }

    const fence = trimmed.match(/^```([A-Za-z0-9_-]+)?\s*$/);
    if (fence) {
      const lang = fence[1] || "";
      const code = [];
      index += 1;
      while (index < lines.length && !lines[index].trim().startsWith("```")) {
        code.push(lines[index]);
        index += 1;
      }
      index += 1;
      html.push(`<pre><code${lang ? ` class="language-${escapeAttr(lang)}"` : ""}>${escapeHtml(code.join("\n"))}</code></pre>`);
      continue;
    }

    if (trimmed === "$$") {
      const math = ["$$"];
      index += 1;
      while (index < lines.length) {
        math.push(lines[index]);
        if (lines[index].trim() === "$$") {
          index += 1;
          break;
        }
        index += 1;
      }
      html.push(`<div class="math">${escapeHtml(math.join("\n"))}</div>`);
      continue;
    }

    const heading = trimmed.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      const level = heading[1].length;
      html.push(`<h${level}>${renderInline(heading[2])}</h${level}>`);
      index += 1;
      continue;
    }

    if (/^(-{3,}|\*{3,})$/.test(trimmed)) {
      html.push("<hr>");
      index += 1;
      continue;
    }

    if (trimmed.startsWith(">")) {
      const quote = [];
      while (index < lines.length && lines[index].trim().startsWith(">")) {
        quote.push(lines[index].trim().replace(/^>\s?/, ""));
        index += 1;
      }
      html.push(`<blockquote>${markdownToHtml(quote.join("\n"))}</blockquote>`);
      continue;
    }

    if (isTableStart(lines, index)) {
      const tableLines = [];
      while (index < lines.length && lines[index].includes("|")) {
        tableLines.push(lines[index]);
        index += 1;
      }
      html.push(renderTable(tableLines));
      continue;
    }

    if (/^[-*+]\s+/.test(trimmed)) {
      const items = [];
      while (index < lines.length && /^[-*+]\s+/.test(lines[index].trim())) {
        items.push(lines[index].trim().replace(/^[-*+]\s+/, ""));
        index += 1;
      }
      html.push(`<ul>${items.map((item) => `<li>${renderInline(item)}</li>`).join("")}</ul>`);
      continue;
    }

    if (/^\d+\.\s+/.test(trimmed)) {
      const items = [];
      while (index < lines.length && /^\d+\.\s+/.test(lines[index].trim())) {
        items.push(lines[index].trim().replace(/^\d+\.\s+/, ""));
        index += 1;
      }
      html.push(`<ol>${items.map((item) => `<li>${renderInline(item)}</li>`).join("")}</ol>`);
      continue;
    }

    const paragraph = [trimmed];
    index += 1;
    while (index < lines.length && lines[index].trim() && !isBlockStart(lines, index)) {
      paragraph.push(lines[index].trim());
      index += 1;
    }
    html.push(`<p>${renderInline(paragraph.join(" "))}</p>`);
  }

  return html.join("\n");
}

function isBlockStart(lines, index) {
  const trimmed = lines[index].trim();
  return (
    /^```/.test(trimmed) ||
    trimmed === "$$" ||
    /^(#{1,6})\s+/.test(trimmed) ||
    trimmed.startsWith(">") ||
    /^[-*+]\s+/.test(trimmed) ||
    /^\d+\.\s+/.test(trimmed) ||
    /^(-{3,}|\*{3,})$/.test(trimmed) ||
    isTableStart(lines, index)
  );
}

function isTableStart(lines, index) {
  return (
    index + 1 < lines.length &&
    lines[index].includes("|") &&
    /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(lines[index + 1])
  );
}

function renderTable(tableLines) {
  const rows = tableLines.map((line) =>
    line
      .trim()
      .replace(/^\||\|$/g, "")
      .split("|")
      .map((cell) => cell.trim())
  );
  const header = rows[0] || [];
  const bodyRows = rows.slice(2);
  return `<table>
  <thead><tr>${header.map((cell) => `<th>${renderInline(cell)}</th>`).join("")}</tr></thead>
  <tbody>
    ${bodyRows
      .map((row) => `<tr>${row.map((cell) => `<td>${renderInline(cell)}</td>`).join("")}</tr>`)
      .join("\n    ")}
  </tbody>
</table>`;
}

function renderInline(input) {
  const segments = String(input).split(/(`[^`]*`)/g);
  return segments
    .map((segment) => {
      if (segment.startsWith("`") && segment.endsWith("`")) {
        return `<code>${escapeHtml(segment.slice(1, -1))}</code>`;
      }

      let text = escapeHtml(segment);
      text = text.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, '<img src="$2" alt="$1">');
      text = text.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2">$1</a>');
      text = text.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
      text = text.replace(/~~([^~]+)~~/g, "<s>$1</s>");
      return text;
    })
    .join("");
}

function excerptFromMarkdown(markdown) {
  const firstParagraph = markdown
    .split(/\n\s*\n/)
    .find((part) => part.trim() && !part.trim().startsWith("#"));
  if (!firstParagraph) return "";
  return firstParagraph
    .replace(/```[\s\S]*?```/g, "")
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[#>*_`~$]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 220);
}

async function copyDir(from, to) {
  let entries = [];
  try {
    entries = await fs.readdir(from, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") return;
    throw error;
  }

  await fs.mkdir(to, { recursive: true });
  for (const entry of entries) {
    const source = path.join(from, entry.name);
    const target = path.join(to, entry.name);
    if (entry.isDirectory()) {
      await copyDir(source, target);
    } else if (entry.isFile()) {
      await fs.copyFile(source, target);
    }
  }
}

async function writeFile(relativePath, contents) {
  const target = path.join(outDir, relativePath);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, contents, "utf8");
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/"/g, "&quot;");
}

function escapeXml(value) {
  return escapeAttr(value).replace(/'/g, "&apos;");
}
