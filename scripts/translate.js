import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  readPosts,
  slugify,
  stringifyFrontmatter
} from "./lib/content.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const contentRoot = path.join(root, "content");

const apiKey = process.env.OPENAI_API_KEY || process.env.LLM_API_KEY || "";
const model = process.env.LLM_MODEL || "gpt-5-mini";
const endpoint = process.env.OPENAI_RESPONSES_URL || "https://api.openai.com/v1/responses";

if (!apiKey) {
  console.log("No OPENAI_API_KEY or LLM_API_KEY found; skipping translation.");
  process.exit(0);
}

const posts = (await readPosts(contentRoot)).filter((post) => !post.draft);
const groups = new Map();
for (const post of posts) {
  if (!groups.has(post.translationKey)) groups.set(post.translationKey, []);
  groups.get(post.translationKey).push(post);
}

let created = 0;
for (const post of posts) {
  if (post.meta.autoTranslate === false) continue;
  if (post.translatedBy && post.translatedBy.toLowerCase().includes("llm")) continue;
  if (!["zh", "en"].includes(post.lang)) continue;

  const targetLang = post.lang === "zh" ? "en" : "zh";
  const siblings = groups.get(post.translationKey) || [];
  if (siblings.some((sibling) => sibling.lang === targetLang)) continue;

  const translated = await translatePost(post, targetLang);
  const targetSlug = makeTargetSlug(post, targetLang);
  const targetFile = path.join(
    contentRoot,
    "posts",
    `${post.date || new Date().toISOString().slice(0, 10)}-${targetSlug}.${targetLang}.md`
  );

  const frontmatter = {
    title: translated.title,
    date: post.date,
    lang: targetLang,
    slug: targetSlug,
    translationKey: post.translationKey,
    translationOf: post.slug,
    visibility: post.visibility,
    tags: translated.tags?.length ? translated.tags : post.tags,
    summary: translated.summary || "",
    translatedBy: "llm",
    translationModel: model,
    source: post.relPath
  };

  await fs.writeFile(targetFile, stringifyFrontmatter(frontmatter, translated.body), "utf8");
  console.log(`Created ${path.relative(root, targetFile)}`);
  created += 1;
}

console.log(created ? `Created ${created} translation(s).` : "No missing translations.");

function makeTargetSlug(post, targetLang) {
  const base = slugify(post.translationKey || post.slug).replace(/-(zh|en|cn)$/i, "");
  return `${base}-${targetLang}`;
}

async function translatePost(post, targetLang) {
  const targetName = targetLang === "zh" ? "Simplified Chinese" : "English";
  const sourceName = post.lang === "zh" ? "Simplified Chinese" : "English";

  const input = {
    targetLang,
    targetName,
    sourceName,
    frontmatter: {
      title: post.title,
      summary: post.summary,
      tags: post.tags,
      visibility: post.visibility
    },
    markdown: post.body
  };

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      instructions:
        "You translate Markdown blog posts for an academic personal website. Preserve Markdown structure, code fences, links, citations, tables, and LaTeX math exactly. Translate prose naturally. Do not add commentary. Return only valid JSON.",
      input:
        "Translate this post. Return JSON with keys title, summary, tags, body. Tags must be an array of short strings. Body must be Markdown without frontmatter.\n\n" +
        JSON.stringify(input, null, 2),
      max_output_tokens: 12000
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Translation request failed: ${response.status} ${text}`);
  }

  const data = await response.json();
  const text = extractText(data);
  const parsed = parseJsonText(text);
  if (!parsed.title || !parsed.body) {
    throw new Error(`Translation response missing title/body: ${text.slice(0, 500)}`);
  }

  return {
    title: String(parsed.title).trim(),
    summary: parsed.summary ? String(parsed.summary).trim() : "",
    tags: Array.isArray(parsed.tags) ? parsed.tags.map(String) : [],
    body: String(parsed.body).trim()
  };
}

function extractText(data) {
  if (typeof data.output_text === "string") return data.output_text;
  if (Array.isArray(data.output)) {
    return data.output
      .flatMap((item) => item.content || [])
      .filter((content) => content.type === "output_text" || content.text)
      .map((content) => content.text || "")
      .join("\n");
  }
  return "";
}

function parseJsonText(text) {
  const trimmed = text.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "");
  return JSON.parse(trimmed);
}
