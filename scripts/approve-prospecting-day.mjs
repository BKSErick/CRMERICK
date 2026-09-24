/** Cria o OK criptograficamente vinculado ao manifesto. Nao envia mensagens. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createProspectingApproval, pilotAuditIssues } from "../src/lib/prospectingApproval.ts";

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
  const manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8").trimStart());
  // P8 (Story 065): manifesto de piloto so e aprovado com a auditoria dos leads completa.
  if (manifest.version === 2) {
    const auditFile = path.join(DIR, `${date}-pilot.audit.json`);
    const audit = fs.existsSync(auditFile) ? JSON.parse(fs.readFileSync(auditFile, "utf8").trimStart()) : null;
    const problemas = pilotAuditIssues(manifest, audit);
    if (problemas.length) {
      console.error(`Piloto ${date}/${slot} NAO aprovado: ${problemas.length} pendencia(s).`);
      problemas.slice(0, 20).forEach((problema) => console.error(`   ${problema}`));
      process.exit(1);
    }
  }
  const approval = createProspectingApproval(manifest);
  const approvalFile = path.join(DIR, `${date}-${slot}.approval.json`);
  fs.writeFileSync(approvalFile, JSON.stringify(approval, null, 2) + "\n", { flag: "wx" });
  console.log(`OK registrado para ${date}/${slot}.`);
}
console.log("A aprovacao nao dispara nada; o agendador consumira cada OK uma unica vez.");
