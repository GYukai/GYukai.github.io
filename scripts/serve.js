import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const siteDir = path.join(root, "_site");
const port = Number(process.env.PORT || 4173);

const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml"
};

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url || "/", `http://127.0.0.1:${port}`);
    const safePath = decodeURIComponent(url.pathname).replace(/^\/+/, "");
    let filePath = path.join(siteDir, safePath);

    if (!filePath.startsWith(siteDir)) {
      response.writeHead(403);
      response.end("Forbidden");
      return;
    }

    const stat = await fs.stat(filePath).catch(() => null);
    if (stat?.isDirectory()) filePath = path.join(filePath, "index.html");
    if (!stat && !path.extname(filePath)) filePath = path.join(filePath, "index.html");

    const body = await fs.readFile(filePath);
    response.writeHead(200, {
      "Content-Type": types[path.extname(filePath)] || "application/octet-stream"
    });
    response.end(body);
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Serving http://127.0.0.1:${port}/`);
});
