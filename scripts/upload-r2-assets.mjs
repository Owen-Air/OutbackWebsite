import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const imagesRoot = path.join(repoRoot, "images");
const bucket = process.env.R2_BUCKET || "outbackwebsitestorage";

function walk(dir) {
  const entries = [];
  for (const name of readdirSync(dir)) {
    const fullPath = path.join(dir, name);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      entries.push(...walk(fullPath));
    } else {
      entries.push(fullPath);
    }
  }
  return entries;
}

const files = walk(imagesRoot);


for (const filePath of files) {
  const key = path.relative(imagesRoot, filePath).replace(/\\/g, "/");
  // Use PowerShell npx.ps1 path for this environment
  const npxPath = 'C:/Program Files/nodejs/npx.ps1';
  const command = `& \"${npxPath}\" wrangler r2 object put \"${bucket}/${key}\" --file \"${filePath}\" --remote -y`;
  const result = spawnSync(
    'powershell.exe',
    ['-NoProfile', '-Command', command],
    { stdio: 'inherit', shell: false, env: process.env }
  );

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

console.log(`UPLOAD_DONE:${files.length}`);