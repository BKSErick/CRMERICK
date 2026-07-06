const fs = require("fs");
const path = require("path");

const source = path.join(__dirname, "..", "modules", "pipeline.html");
const targetDir = path.join(__dirname, "..", "src", "styles");
const target = path.join(targetDir, "legacy-pipeline.css");

const html = fs.readFileSync(source, "utf8");
const styleBlocks = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)]
  .map((match) => match[1].trim())
  .filter(Boolean);

if (styleBlocks.length === 0) {
  throw new Error("No <style> blocks found in modules/pipeline.html");
}

fs.mkdirSync(targetDir, { recursive: true });
fs.writeFileSync(
  target,
  [
    "/*",
    " * Extracted from modules/pipeline.html.",
    " * This is the legacy Pipeline design-system layer used as visual source of truth.",
    " * Regenerate with: node scripts/extract-legacy-pipeline-css.js",
    " */",
    "",
    styleBlocks.join("\n\n/* ---- next legacy style block ---- */\n\n"),
    "",
  ].join("\n"),
  "utf8",
);

console.log(`[design-system] wrote ${path.relative(process.cwd(), target)} (${styleBlocks.length} style block(s))`);
