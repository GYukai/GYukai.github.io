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
await fs.copyFile(path.join(assetsDir, "favicon.svg"), path.join(outDir, "favicon.svg"));
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

await writeFile("index.html", renderHome(academicGroups, "en"));
await writeFile("zh/index.html", renderHome(academicGroups, "zh"));
await writeFile("posts/index.html", renderAcademicIndex(academicGroups, "zh"));
await writeFile("en/posts/index.html", renderAcademicIndex(academicGroups, "en"));
await writeFile("blog/index.html", renderFullBlog(groupedPosts, "zh"));
await writeFile("en/blog/index.html", renderFullBlog(groupedPosts, "en"));

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

function homeContent(lang) {
  const configured = profile.home?.[lang] || {};
  const fallbackIntro = profile.intro?.[lang] || [];

  return {
    description: configured.description || "",
    intro: configured.intro || fallbackIntro
  };
}

function homeLabels(lang) {
  if (lang === "zh") {
    return {
      introduction: "中文介绍",
      blogs: "博客"
    };
  }

  return {
    introduction: "English introduction",
    blogs: "Blogs"
  };
}

function renderParagraphs(paragraphs) {
  const items = Array.isArray(paragraphs) ? paragraphs.filter(Boolean) : [];
  if (!items.length) {
    return '<p class="placeholder">[待填写]</p>';
  }

  return items
    .map((text) => `<p${isPlaceholder(text) ? ' class="placeholder"' : ""}>${renderInline(text)}</p>`)
    .join("\n");
}

function isPlaceholder(text) {
  const value = String(text).trim();
  return value.includes("待填写") || /^\[[^\]]+\]$/.test(value);
}

function homeAlternates() {
  return [
    { lang: "en", href: absoluteUrl("/") },
    { lang: "zh", href: absoluteUrl("/zh/") },
    { lang: "x-default", href: absoluteUrl("/") }
  ];
}

function renderHome(groups, lang) {
  const person = profile.person || {};
  const home = homeContent(lang);
  const labels = homeLabels(lang);
  const latest = groups.slice(0, 6);
  const homePath = lang === "zh" ? "/zh/" : "/";
  const photoUrl =
    person.photo ||
    "https://scholar.googleusercontent.com/citations?view_op=medium_photo&user=Ml8K5b8AAAAJ&citpid=4";
  const photoCaption =
    person.photoCaption?.[lang] ||
    person.photoCaption?.en ||
    person.name ||
    "Gu Yukai";
  const description =
    home.description && !isPlaceholder(home.description)
      ? home.description
      : profile.site?.description || "";
  const heading =
    lang === "zh"
      ? person.nameZh || person.name || "Gu Yukai"
      : person.name || "Gu Yukai";

  const body = `${siteHeader(lang, lang === "zh" ? "/" : "/zh/")}
<main>
  <section class="home-hero" aria-label="${escapeAttr(labels.introduction)}">
    <div class="home-copy">
      <h1>${escapeHtml(heading)}</h1>
      <div class="lead">
        ${renderParagraphs(home.intro)}
      </div>
    </div>
    <figure class="profile-photo">
      <img src="${escapeAttr(photoUrl)}" width="192" height="192" alt="${escapeAttr(person.name || "Gu Yukai")}">
      <figcaption>${renderLineBreaks(photoCaption)}</figcaption>
    </figure>
  </section>

  <h2>${escapeHtml(labels.blogs)}</h2>
  ${renderEntryList(latest, { showVisibility: false, lang })}
</main>
${siteFooter(lang)}`;

  return layout({
    title: lang === "zh" ? `${person.nameZh || person.name || "Gu Yukai"} - 中文主页` : profile.site?.title || "Gu Yukai",
    description,
    body,
    pathName: homePath,
    lang,
    alternates: homeAlternates()
  });
}

function renderAcademicIndex(groups, lang) {
  const labels = homeLabels(lang);
  const body =
    lang === "zh"
      ? `${siteHeader("zh", "/en/posts/")}
<main>
  <h1>研究博客</h1>
  <p class="lead">论文阅读、研究笔记、实验札记和可公开讨论的技术判断。</p>
  ${renderEntryList(groups, { showVisibility: false, lang: "zh" })}
</main>
${siteFooter("zh")}`
      : `${siteHeader("en", "/posts/")}
<main>
  <h1>Research Blogs</h1>
  <p class="lead">Research notes, paper reading, experiment notes, and public technical judgments.</p>
  ${renderEntryList(groups, { showVisibility: false, lang: "en" })}
</main>
${siteFooter("en")}`;

  return layout({
    title: `${lang === "zh" ? "研究博客" : "Research Blogs"} - ${profile.site?.title || "Gu Yukai"}`,
    description: "Academic notes and research writing.",
    body,
    pathName: lang === "zh" ? "/posts/" : "/en/posts/",
    lang,
    alternates: [
      { lang: "zh", href: absoluteUrl("/posts/") },
      { lang: "en", href: absoluteUrl("/en/posts/") }
    ]
  });
}

function renderFullBlog(groups, lang) {
  const body =
    lang === "zh"
      ? `${siteHeader("zh", "/en/blog/")}
<main>
  <h1>Blogs</h1>
  <p class="lead">这里是完整索引，包含学术文章、读书评论、文章评论和更私人化的判断。它不进入学术 RSS 与 sitemap。</p>
  ${renderEntryList(groups, { showVisibility: true, lang: "zh" })}
</main>
${siteFooter("zh")}`
      : `${siteHeader("en", "/blog/")}
<main>
  <h1>Blogs</h1>
  <p class="lead">The complete index, including research posts, reading notes, article comments, and more personal judgments. It is kept out of the research RSS and sitemap.</p>
  ${renderEntryList(groups, { showVisibility: true, lang: "en" })}
</main>
${siteFooter("en")}`;

  return layout({
    title: `Blogs - ${profile.site?.title || "Gu Yukai"}`,
    description: "Complete blog list, including personal commentary.",
    body,
    pathName: lang === "zh" ? "/blog/" : "/en/blog/",
    lang,
    noindex: true,
    alternates: [
      { lang: "zh", href: absoluteUrl("/blog/") },
      { lang: "en", href: absoluteUrl("/en/blog/") }
    ]
  });
}

function renderPost(post, group) {
  const isAcademic = post.visibility === "academic";
  const bodyHtml = markdownToHtml(post.body);
  const languageLinks = renderLanguageLinks(group, post, post.lang);
  const alternatePost = group.posts.find((other) => other.lang === otherLang(post.lang));
  const switchHref = alternatePost
    ? postPath(alternatePost)
    : post.lang === "zh"
      ? "/en/blog/"
      : "/blog/";
  const badge =
    post.translatedBy && post.translatedBy.toLowerCase().includes("llm")
      ? `<span class="badge">powered by llm</span>`
      : "";
  const note =
    post.translatedBy && post.translatedBy.toLowerCase().includes("llm")
      ? `<p class="post-note">This translation was generated by an LLM and may receive later human edits.</p>`
      : "";

  const body = `${siteHeader(post.lang, switchHref)}
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
${siteFooter(post.lang)}`;

  return layout({
    title: `${post.title} - ${profile.site?.title || "Gu Yukai"}`,
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
    const uiLang = options.lang || defaultLang;
    const post = pickPost(group, uiLang);
    const visibility = options.showVisibility
      ? ` · <span class="muted">${escapeHtml(post.visibility)}</span>`
      : "";
    const summary = post.summary || excerptFromMarkdown(post.body);
    return `<li>
  <time datetime="${escapeAttr(post.date)}">${formatDate(post.date, post.lang)}</time>${visibility}<br>
  <a class="entry-title" href="${escapeAttr(postPath(post))}">${escapeHtml(post.title)}</a>
  ${summary ? `<p>${escapeHtml(summary)}</p>` : ""}
</li>`;
  })
  .join("\n")}
</ol>`;
}

function renderLanguageLinks(group, currentPost, uiLang = currentPost.lang) {
  const links = group.posts
    .filter((post) => post.slug !== currentPost.slug)
    .map(
      (post) =>
        `<a hreflang="${escapeAttr(post.lang)}" href="${escapeAttr(languageSwitchHref(postPath(post), post.lang))}">${escapeHtml(languageName(post.lang))}</a>`
    );
  const prefix = uiLang === "zh" ? "另有" : "Also in";
  return links.length ? `${prefix} ${links.join(" / ")}` : "";
}

function renderTags(tags) {
  if (!tags.length) return "";
  return ` <ul class="tag-list">${tags.map((tag) => `<li>${escapeHtml(tag)}</li>`).join("")}</ul>`;
}

function renderLineBreaks(text) {
  return escapeHtml(text).replace(/\n/g, "<br>");
}

function otherLang(lang) {
  return lang === "zh" ? "en" : "zh";
}

function languageSwitchHref(href, targetLang) {
  const joiner = href.includes("?") ? "&" : "?";
  return `${href}${joiner}lang=${targetLang}`;
}

function renderLanguageSwitch(currentLang, href) {
  const targetLang = otherLang(currentLang);
  return `<a href="${escapeAttr(languageSwitchHref(href, targetLang))}" hreflang="${escapeAttr(targetLang)}">${escapeHtml(languageName(targetLang))}</a>`;
}

function renderMailIcon() {
  return `<svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18">
      <path d="M4 6h16v12H4z" fill="none" stroke="currentColor" stroke-width="1.8"/>
      <path d="m4 7 8 6 8-6" fill="none" stroke="currentColor" stroke-width="1.8"/>
    </svg>`;
}

function renderScholarIcon() {
  return `<svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18">
      <path d="M3 9.5 12 5l9 4.5-9 4.5z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
      <path d="M7 12.2v4.2c2.8 1.9 7.2 1.9 10 0v-4.2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
    </svg>`;
}

function renderHeaderLanguageLink(lang, href) {
  const targetLang = otherLang(lang);
  const label = lang === "zh" ? "English Version" : "中文版";
  return `<a class="language-version" href="${escapeAttr(languageSwitchHref(href, targetLang))}" hreflang="${escapeAttr(targetLang)}">${escapeHtml(label)}</a>`;
}

function siteHeader(lang = "en", switchHref = lang === "zh" ? "/" : "/zh/") {
  const person = profile.person || {};
  const labels = homeLabels(lang);
  const homeHref = lang === "zh" ? "/zh/" : "/";
  const email = person.email || "yukai.gu@outlook.com";
  const scholar = person.scholar || "https://scholar.google.com/citations?user=Ml8K5b8AAAAJ&hl=en&oi=ao";
  return `<header class="site-header">
  <a class="brand" href="${homeHref}">
    <span><strong>${escapeHtml(person.name || "Gu Yukai")}</strong><small>${escapeHtml(person.location || "")}</small></span>
  </a>
  <nav class="site-nav" aria-label="Primary">
    <a href="/blog/">${escapeHtml(labels.blogs)}</a>
    <a href="/feed.xml">RSS</a>
    <a class="mail-link" href="mailto:${escapeAttr(email)}">${renderMailIcon()}<span>${escapeHtml(email)}</span></a>
    <a class="scholar-link" href="${escapeAttr(scholar)}" aria-label="Google Scholar: Gu Yukai">${renderScholarIcon()}<span>Gu Yukai</span></a>
    <span class="nav-divider" aria-hidden="true">|</span>
    ${renderHeaderLanguageLink(lang, switchHref)}
  </nav>
</header>`;
}

function siteFooter(lang = "en") {
  return `<footer class="site-footer">
  <p>&copy; ${new Date().getUTCFullYear()} Gu Yukai</p>
</footer>`;
}

function languageRedirectScript(currentLang, alternates) {
  const targets = {};
  for (const alternate of alternates) {
    if (alternate.lang !== "zh" && alternate.lang !== "en") continue;
    targets[alternate.lang] = pathFromUrl(alternate.href);
  }

  if (!targets.zh || !targets.en) return "";

  return `<script>
    (function () {
      var params = new URLSearchParams(window.location.search);
      var explicit = params.get("lang");
      if (explicit === "zh" || explicit === "en") return;

      var first = "";
      if (navigator.languages && navigator.languages.length) {
        first = navigator.languages[0] || "";
      } else {
        first = navigator.language || "";
      }

      var preferred = first.toLowerCase().indexOf("zh") === 0 ? "zh" : "en";
      var current = ${JSON.stringify(currentLang)};
      var targets = ${JSON.stringify(targets)};
      var targetPath = targets[preferred];
      if (!targetPath || preferred === current || targetPath === window.location.pathname) return;

      var next = new URL(targetPath, window.location.origin);
      next.search = window.location.search;
      next.hash = window.location.hash;
      window.location.replace(next.pathname + next.search + next.hash);
    }());
  </script>`;
}

function pathFromUrl(href) {
  try {
    return new URL(href).pathname;
  } catch {
    return href;
  }
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
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  <link rel="stylesheet" href="/assets/site.css">
  <link rel="alternate" type="application/rss+xml" title="Research feed" href="/feed.xml">
  ${alternates
    .map(
      (alternate) =>
        `<link rel="alternate" hreflang="${escapeAttr(alternate.lang)}" href="${escapeAttr(alternate.href)}">`
    )
    .join("\n  ")}
  ${languageRedirectScript(lang, alternates)}
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
    <title>${escapeXml(profile.site?.title || "Gu Yukai")} - Research Feed</title>
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
  const paths = ["/", "/zh/", "/posts/", "/en/posts/", ...academicPosts.map(postPath)];
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
Disallow: /en/blog/
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
