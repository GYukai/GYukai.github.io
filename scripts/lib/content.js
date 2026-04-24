import fs from "node:fs/promises";
import path from "node:path";

export function parseFrontmatter(source) {
  const normalized = source.replace(/\r\n/g, "\n");
  if (!normalized.startsWith("---\n")) {
    return { data: {}, body: normalized };
  }

  const end = normalized.indexOf("\n---\n", 4);
  if (end === -1) {
    return { data: {}, body: normalized };
  }

  const raw = normalized.slice(4, end);
  const body = normalized.slice(end + 5);
  return { data: parseYamlish(raw), body };
}

export function stringifyFrontmatter(data, body) {
  const lines = Object.entries(data)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}: ${formatYamlValue(value)}`);
  return `---\n${lines.join("\n")}\n---\n\n${body.trim()}\n`;
}

export function parseYamlish(raw) {
  const data = {};
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!match) continue;
    data[match[1]] = parseYamlValue(match[2]);
  }
  return data;
}

function parseYamlValue(raw) {
  const value = raw.trim();
  if (value === "") return "";
  if (value === "true") return true;
  if (value === "false") return false;
  if (value === "null") return null;

  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    try {
      return JSON.parse(value.replace(/^'|'$/g, '"'));
    } catch {
      return value.slice(1, -1);
    }
  }

  if (value.startsWith("[") && value.endsWith("]")) {
    try {
      return JSON.parse(value.replaceAll("'", '"'));
    } catch {
      const inside = value.slice(1, -1).trim();
      if (!inside) return [];
      return inside
        .split(",")
        .map((item) => item.trim().replace(/^['"]|['"]$/g, ""))
        .filter(Boolean);
    }
  }

  return value;
}

function formatYamlValue(value) {
  if (Array.isArray(value)) {
    return `[${value.map((item) => JSON.stringify(String(item))).join(", ")}]`;
  }
  if (typeof value === "boolean") return String(value);
  if (value === null) return "null";
  return JSON.stringify(String(value));
}

export function detectLang(text) {
  return /[\u3400-\u9fff]/.test(text) ? "zh" : "en";
}

export function slugify(input) {
  return String(input)
    .normalize("NFKD")
    .toLowerCase()
    .trim()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9\u3400-\u9fff]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export async function listMarkdownFiles(dir) {
  const files = [];

  async function walk(current) {
    let entries = [];
    try {
      entries = await fs.readdir(current, { withFileTypes: true });
    } catch (error) {
      if (error.code === "ENOENT") return;
      throw error;
    }

    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile() && entry.name.endsWith(".md")) {
        files.push(fullPath);
      }
    }
  }

  await walk(dir);
  return files.sort();
}

export async function readPosts(contentRoot) {
  const postsDir = path.join(contentRoot, "posts");
  const files = await listMarkdownFiles(postsDir);
  const posts = [];

  for (const filePath of files) {
    const source = await fs.readFile(filePath, "utf8");
    const parsed = parseFrontmatter(source);
    posts.push(normalizePost(filePath, parsed, contentRoot));
  }

  return posts;
}

export function normalizePost(filePath, parsed, contentRoot) {
  const relPath = path.relative(contentRoot, filePath).split(path.sep).join("/");
  const stem = path.basename(filePath, ".md");
  const undatedStem = stem.replace(/^\d{4}-\d{2}-\d{2}-/, "");
  const meta = parsed.data;
  const title = String(meta.title || undatedStem);
  const lang = String(meta.lang || detectLang(`${title}\n${parsed.body}`));
  const date = String(meta.date || stem.match(/\d{4}-\d{2}-\d{2}/)?.[0] || "");
  const slug = String(meta.slug || slugify(undatedStem) || undatedStem);
  const tags = Array.isArray(meta.tags)
    ? meta.tags.map(String)
    : meta.tags
      ? [String(meta.tags)]
      : [];
  const visibility = String(
    meta.visibility || (meta.category === "personal" ? "personal" : "academic")
  );
  const translationKey = String(
    meta.translationKey || meta.translationOf || slug.replace(/-(zh|en|cn)$/i, "")
  );

  return {
    filePath,
    relPath,
    stem,
    meta,
    title,
    date,
    lang,
    slug,
    tags,
    visibility,
    translationKey,
    translationOf: meta.translationOf ? String(meta.translationOf) : "",
    translatedBy: meta.translatedBy ? String(meta.translatedBy) : "",
    translationModel: meta.translationModel ? String(meta.translationModel) : "",
    summary: meta.summary ? String(meta.summary) : "",
    draft: Boolean(meta.draft),
    body: parsed.body.trim()
  };
}
