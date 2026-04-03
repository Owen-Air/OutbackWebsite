import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const publicDir = path.join(repoRoot, "public");

const rootEntries = [
  "_headers",
  "404.html",
  "contact.html",
  "contact.js",
  "events.html",
  "find-us.html",
  "history.html",
  "index.html",
  "main.js",
  "menu.html",
  "robots.txt",
  "sitemap.xml",
  "spaces.html",
  "style.css",
  "team.html",
  "thankyou.html"
];

if (existsSync(publicDir)) {
  rmSync(publicDir, { recursive: true, force: true });
}

mkdirSync(publicDir, { recursive: true });

for (const entry of rootEntries) {
  cpSync(path.join(repoRoot, entry), path.join(publicDir, entry), { recursive: true });
}

const imagesSource = path.join(repoRoot, "images");
if (existsSync(imagesSource)) {
  cpSync(imagesSource, path.join(publicDir, "images"), { recursive: true });
}

const copied = readdirSync(publicDir);
console.log(`Prepared public assets in ${publicDir} with ${copied.length} top-level entries.`);