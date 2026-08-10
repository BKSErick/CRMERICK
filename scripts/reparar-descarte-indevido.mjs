/**
 * reparar-descarte-indevido.mjs
 * Devolve para a fila os leads que descartar-sem-whatsapp.mjs marcou por engano.
 *
 * O QUE ACONTECEU (10/08/2026): a primeira versao do descarte carregava contacts
 * com Range: 0-19999 numa unica requisicao. PostgREST corta no max-rows do
 * servidor (1000) e NAO retorna erro. Todo contato acima do corte sumia do Map,
 * o lookup devolvia undefined e o lead era classificado "sem_telefone" -- mesmo
 * tendo whatsapp_jid confirmado. 162 leads bons de Sete Lagoas cairam assim.
 *
 * Este script so mexe em quem tem blocker gravado por aquele script
 * (sem_telefone | sem_whatsapp). Deal perdido por motivo real nao e tocado.
 *
 * USO:
 *   node scripts/reparar-descarte-indevido.mjs         # dry-run
 *   node scripts/reparar-descarte-indevido.mjs --go    # devolve para prospect
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
for (const linha of fs.readFileSync(path.join(RAIZ, ".env"), "utf8").split(/\r?\n/)) {
  const m = linha.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

const GO = process.argv.includes("--go");
const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

async function supa(rota, init = {}) {
  const r = await fetch(`${URL}/rest/v1/${rota}`, {
    ...init,
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  if (!r.ok) throw new Error(`${rota} -> ${r.status} ${await r.text()}`);
  return r.status === 204 ? null : r.json();
}

async function buscarTudo(rota, passo = 1000) {
  const todos = [];
  for (let inicio = 0; ; inicio += passo) {
    const pagina = await supa(rota, {
      headers: { Range: `${inicio}-${inicio + passo - 1}`, "Range-Unit": "items" },
    });
    if (!Array.isArray(pagina) || pagina.length === 0) break;
    todos.push(...pagina);
    if (pagina.length < passo) break;
  }
  return todos;
}

const digitos = (v) => String(v ?? "").replace(/\D/g, "");

const contatos = await buscarTudo("contacts?select=id,phone,whatsapp,whatsapp_jid,whatsapp_site,whatsapp_check");
const marcados = await buscarTudo(
  "deals?blocker=in.(sem_telefone,sem_whatsapp)&select=id,company,stage,blocker",
);
const porId = new Map(contatos.map((c) => [c.id, c]));

console.log(`Contatos carregados: ${contatos.length}`);
console.log(`Deals marcados pelo descarte: ${marcados.length}\n`);

const devolver = [];
const manter = [];
for (const d of marcados) {
  const c = porId.get(d.id);
  if (!c) {
    // Continua sem contato mesmo com paginacao correta: nao da para afirmar nada.
    manter.push({ ...d, motivo: "sem contato no banco" });
    continue;
  }
  if (c.whatsapp_jid || c.whatsapp_site) {
    devolver.push({ ...d, motivo: c.whatsapp_jid ? "tem whatsapp_jid" : "tem whatsapp_site" });
    continue;
  }
  const tel = digitos(c.phone) || digitos(c.whatsapp);
  if (tel && !c.whatsapp_check) {
    devolver.push({ ...d, motivo: "tem telefone e nunca foi checado" });
    continue;
  }
  manter.push({ ...d, motivo: tel ? "checado e sem whatsapp" : "sem telefone de verdade" });
}

console.log(`DEVOLVER para prospect: ${devolver.length}`);
for (const d of devolver.slice(0, 12)) {
  console.log(`  #${d.id} ${String(d.company).slice(0, 42).padEnd(42)} ${d.motivo}`);
}
if (devolver.length > 12) console.log(`  ... e mais ${devolver.length - 12}`);

console.log(`\nMANTER descartado: ${manter.length}`);
const porMotivo = manter.reduce((a, m) => ({ ...a, [m.motivo]: (a[m.motivo] ?? 0) + 1 }), {});
for (const [motivo, n] of Object.entries(porMotivo)) console.log(`  ${motivo}: ${n}`);

if (!GO) {
  console.log("\nDry-run: nada gravado. Rode com --go para reparar.");
  process.exit(0);
}

let ok = 0;
for (const d of devolver) {
  await supa(`deals?id=eq.${d.id}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ stage: "prospect", blocker: null }),
  });
  ok++;
  if (ok % 50 === 0) console.log(`  ${ok}/${devolver.length}`);
}
console.log(`\nDevolvidos para a fila: ${ok}`);
