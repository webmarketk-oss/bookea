import { cpSync, existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const distDir = join(process.cwd(), "dist");

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const stats = statSync(fullPath);

    if (stats.isDirectory()) {
      walk(fullPath);
      continue;
    }

    if (!entry.endsWith(".html") || entry === "index.html" || entry === "404.html") {
      continue;
    }

    const relativePath = relative(distDir, fullPath);
    const routeDir = join(distDir, relativePath.replace(/\.html$/, ""));

    if (existsSync(routeDir)) {
      mkdirSync(routeDir, { recursive: true });
      cpSync(fullPath, join(routeDir, "index.html"));
    }
  }
}

walk(distDir);
