/** Cria o OK criptograficamente vinculado ao manifesto. Nao envia mensagens. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createProspectingApproval } from "../src/lib/prospectingApproval.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIR = path.join(ROOT, "logs", "prospecting-batches");
const arg = (name, fallback = "") => {
  const prefix = `--${name}=`;
  const value = process.argv.find((item) => item.startsWith(prefix));
  return value ? value.slice(prefix.length) : fallback;
};
const date = arg("date");
const requestedSlot = arg("slot");
if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Informe --date=AAAA-MM-DD.");
if (!["morning", "afternoon", "all"].includes(requestedSlot)) {
  throw new Error("Informe --slot=morning, --slot=afternoon ou --slot=all.");
}

const slots = requestedSlot === "all" ? ["morning", "afternoon"] : [requestedSlot];
for (const slot of slots) {
  const manifestFile = path.join(DIR, `${date}-${slot}.manifest.json`);
  if (!fs.existsSync(manifestFile)) throw new Error(`Manifesto nao encontrado: ${manifestFile}`);
  const manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8"));
  const approval = createProspectingApproval(manifest);
  const approvalFile = path.join(DIR, `${date}-${slot}.approval.json`);
  fs.writeFileSync(approvalFile, JSON.stringify(approval, null, 2) + "\n", { flag: "wx" });
  console.log(`OK registrado para ${date}/${slot}.`);
}
console.log("A aprovacao nao dispara nada; o agendador consumira cada OK uma unica vez.");
