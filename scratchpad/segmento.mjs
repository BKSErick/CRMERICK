import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const rel = JSON.parse(fs.readFileSync("logs/audit-2026-08-14.json", "utf8"));
const ids = rel.operacional.semSegmentoCanonico.map((d) => d.id);
const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const rows = [];
for (let i = 0; i < ids.length; i += 200) {
  const { data } = await s
    .from("deals")
    .select("id,company,stage,segment,segment_norm,copy_text,phone,whatsapp,contact_id")
    .in("id", ids.slice(i, i + 200));
  rows.push(...(data ?? []));
}

const porStage = {};
let comNorm = 0;
let prospectAcionavel = 0;
const amostraNorm = [];
for (const r of rows) {
  porStage[r.stage] = (porStage[r.stage] ?? 0) + 1;
  if (r.segment_norm) {
    comNorm += 1;
    if (amostraNorm.length < 12) amostraNorm.push(`#${r.id} ${r.company} | segment="${r.segment ?? ""}" segment_norm="${r.segment_norm}"`);
  }
  if (r.stage === "prospect" && String(r.copy_text ?? "").trim() && (r.phone || r.whatsapp || r.contact_id)) prospectAcionavel += 1;
}

console.log("Sem segmento canonico:", rows.length);
console.log("Por stage:", JSON.stringify(porStage));
console.log("Com segment_norm preenchido (normalize-segments ja classificou):", comNorm);
console.log("Prospects com copy e telefone (volume de fila perdido):", prospectAcionavel);
console.log("\nAmostra com segment_norm:");
for (const linha of amostraNorm) console.log("  " + linha);

const { data: normDist } = await s.from("deals").select("segment_norm").not("segment_norm", "is", null);
const dist = {};
for (const r of normDist ?? []) dist[r.segment_norm] = (dist[r.segment_norm] ?? 0) + 1;
console.log("\nDistribuicao segment_norm na base inteira:", JSON.stringify(dist));
