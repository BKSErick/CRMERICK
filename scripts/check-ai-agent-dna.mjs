import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { AI_AGENT_PERSONAS } from "../src/server/aiAgentPersonas.generated.mjs";

const root = process.cwd();
const manifestPath = path.join(root, "content", "ai-agents", "manifest.json");
if (!fs.existsSync(manifestPath) || AI_AGENT_PERSONAS.length !== 7) throw new Error("Snapshots obrigatorios de IA ausentes.");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
if (manifest.count !== 7 || manifest.items.length !== 7) throw new Error("Manifesto de IA incompleto.");
const catalog = JSON.parse(fs.readFileSync(path.join(root, "content", "agentes.json"), "utf8"));
if (catalog.count !== 7 || catalog.items.some((item) => !manifest.items.some((manifestItem) => manifestItem.id === item.id && manifestItem.sourceHash === item.sourceHash))) {
  throw new Error("Catalogo publico de IA esta divergente do manifesto.");
}
for (const persona of AI_AGENT_PERSONAS) {
  const publicItem = manifest.items.find((item) => item.id === persona.id);
  if (!publicItem || publicItem.sourceHash !== persona.sourceHash || publicItem.version !== persona.version) {
    throw new Error(`Drift interno no snapshot ${persona.id}.`);
  }
  if (!/^[a-f0-9]{64}$/.test(persona.sourceHash)) throw new Error(`Hash invalido em ${persona.id}.`);
}

const aiosRoot = process.env.AIOS_SOURCE_ROOT || path.resolve(root, "..", "aios-core");
if (fs.existsSync(aiosRoot)) {
  for (const persona of AI_AGENT_PERSONAS.filter((item) => item.sourceRoot === "aios")) {
    const sourcePath = path.resolve(aiosRoot, persona.sourcePath);
    const currentHash = createHash("sha256").update(fs.readFileSync(sourcePath, "utf8")).digest("hex");
    if (currentHash !== persona.sourceHash) throw new Error(`DNA com drift: ${persona.id}. Rode npm run ai:dna:sync.`);
  }
}
console.log("DNA dos 7 especialistas consistente.");
