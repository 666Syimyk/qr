// Test-only SPA asset server. No API or persistent repository implementation.
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { dirname, extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../.integration/mock-web");
const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ttf": "font/ttf",
  ".ico": "image/x-icon",
};
createServer(async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Robots-Tag", "noindex, nofollow");
  try {
    const pathname = decodeURIComponent(
      new URL(req.url, "http://127.0.0.1").pathname,
    );
    const requested = resolve(root, "." + pathname);
    if (!requested.startsWith(root + sep) && requested !== root) {
      res.writeHead(404);
      res.end();
      return;
    }
    if (pathname.startsWith("/api/")) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          error: {
            code: "NOT_FOUND",
            message: "No backend is running in the frontend test server.",
          },
        }),
      );
      return;
    }
    let target = requested;
    try {
      if (!(await stat(target)).isFile()) target = resolve(root, "index.html");
    } catch {
      if (extname(pathname)) throw new Error("Missing asset");
      target = resolve(root, "index.html");
    }
    res.setHeader(
      "Content-Type",
      mime[extname(target)] ?? "application/octet-stream",
    );
    res.end(await readFile(target));
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
}).listen(4274, "127.0.0.1", () =>
  console.log("Frontend test preview at http://127.0.0.1:4274 (no backend)"),
);
