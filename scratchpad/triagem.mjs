import { createClient } from "@supabase/supabase-js";

const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const FILA = ["prospect", "abordado", "followup"];

const { data: deals } = await s
  .from("deals")
  .select("id,company,name,stage,response_type,last_inbound_at,is_prospect")
  .in("stage", FILA);

const msgs = [];
for (let f = 0; ; f += 1000) {
  const r = await s
    .from("messages")
    .select("deal_id,direction,content,occurred_at,created_at")
    .eq("direction", "received")
    .order("id")
    .range(f, f + 999);
  msgs.push(...(r.data ?? []));
  if ((r.data ?? []).length < 1000) break;
}

const ult = new Map();
for (const m of msgs) {
  const k = Number(m.deal_id);
  const t = String(m.occurred_at || m.created_at);
  const a = ult.get(k);
  if (!a || t > a.t) ult.set(k, { t, c: String(m.content || "").replace(/\s+/g, " ").slice(0, 100) });
}

const alvo = deals.filter((d) => d.is_prospect !== false && ult.has(Number(d.id)));
const por = {};
for (const d of alvo) (por[d.response_type || "null"] ??= []).push(d);

console.log("POR RESPONSE_TYPE:", JSON.stringify(Object.fromEntries(Object.entries(por).map(([k, v]) => [k, v.length]))));

for (const tipo of ["humana", "encaminhamento", "sem_resposta", "null", "bot"]) {
  const lista = (por[tipo] ?? []).sort((a, b) => ult.get(Number(b.id)).t.localeCompare(ult.get(Number(a.id)).t));
  if (!lista.length) continue;
  console.log(`\n### ${tipo.toUpperCase()} (${lista.length})`);
  for (const d of lista.slice(0, 30)) {
    const u = ult.get(Number(d.id));
    console.log(`#${d.id} [${d.stage}] ${d.company || d.name} | ${u.t.slice(0, 16)} | ${u.c}`);
  }
  if (lista.length > 30) console.log(`... e mais ${lista.length - 30}`);
}
