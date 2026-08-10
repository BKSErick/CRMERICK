/**
 * descartar-sem-whatsapp.mjs
 * Tira da fila os leads que NAO tem como ser abordados por WhatsApp.
 *
 * Por que marcar e nao apagar: o dedupe de leadIngest.js (montarIndiceDedupe)
 * se apoia nas linhas existentes -- indexa maps_cid, nome, telefone e dominio
 * do que ja esta no banco. Deletar o registro faz o mesmo lead voltar na
 * proxima varredura da cidade, e o custo do /chat/check e pago de novo. A linha
 * morta E a memoria que impede o re-import.
 *
 * Criterio (so descarta o que ja foi verificado, nunca chuta):
 *   sem_whatsapp  -> tem telefone, passou pelo /chat/check e NAO tem WhatsApp
 *   sem_telefone  -> nao tem telefone nenhum no cadastro
 * Lead nunca checado NAO entra: rode uazapi-check-numbers.mjs --go antes.
 *
 * USO:
 *   node scripts/descartar-sem-whatsapp.mjs           # dry-run
 *   node scripts/descartar-sem-whatsapp.mjs --go      # grava
 *   node scripts/descartar-sem-whatsapp.mjs --go --limit=100
 *
 * Grava em deals: stage='lost', blocker='sem_whatsapp'|'sem_telefone'.
 * Reversivel: e so voltar stage pra 'prospect'.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
for (const linha of fs.readFileSync(path.join(RAIZ, ".env"), "utf8").split(/\r?\n/)) {
  const m = linha.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

const arg = (n, d) => {
  const a = process.argv.find((x) => x.startsWith(`--${n}=`));
  return a ? a.split("=")[1] : d;
};
const GO = process.argv.includes("--go");
const LIMITE = Number(arg("limit", 5000));

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
if (!URL || !KEY) {
  console.error("Faltam SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY no .env");
  process.exit(1);
}

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

/**
 * PostgREST corta a resposta no max-rows do servidor e NAO da erro: pedir
 * Range: 0-19999 nao adianta, volta 1000 e pronto. Sem paginar, todo registro
 * acima do corte some do Map de lookup e o script conclui "sem telefone" para
 * lead que tem WhatsApp confirmado. Foi assim que 162 leads bons de Sete Lagoas
 * foram descartados por engano em 10/08/2026.
 */
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
const deals = await buscarTudo("deals?select=id,company,stage,is_prospect,segment_norm");
const porId = new Map(contatos.map((c) => [c.id, c]));

// Guarda contra o mesmo bug voltar: se algum deal nao acha contato, o lookup
// esta incompleto e qualquer descarte seria chute. Aborta em vez de estragar.
const orfaos = deals.filter((d) => d.stage === "prospect" && !porId.has(d.id)).length;
if (orfaos > 0 && orfaos > deals.length * 0.05) {
  console.error(`ABORTADO: ${orfaos} deals sem contato correspondente (de ${deals.length}).`);
  console.error(`Contatos carregados: ${contatos.length}. Lookup incompleto -- verifique a paginacao.`);
  process.exit(1);
}

const alvos = [];
for (const d of deals) {
  if (d.is_prospect === false) continue;
  if (d.stage !== "prospect") continue; // nao mexe em quem ja esta em conversa
  const c = porId.get(d.id);
  if (c?.whatsapp_jid || c?.whatsapp_site) continue; // tem canal, fica

  const tel = digitos(c?.phone) || digitos(c?.whatsapp);
  if (!tel) {
    alvos.push({ id: d.id, company: d.company, motivo: "sem_telefone" });
    continue;
  }
  // Sem verificacao nao ha descarte: pode ser lead bom que ninguem checou.
  if (!c?.whatsapp_check) continue;
  alvos.push({ id: d.id, company: d.company, motivo: "sem_whatsapp" });
}

const lote = alvos.slice(0, LIMITE);
const porMotivo = lote.reduce((acc, a) => ({ ...acc, [a.motivo]: (acc[a.motivo] ?? 0) + 1 }), {});

console.log(`Candidatos ao descarte: ${alvos.length} | neste lote: ${lote.length}`);
for (const [motivo, n] of Object.entries(porMotivo)) console.log(`  ${motivo}: ${n}`);
console.log("");
for (const a of lote.slice(0, 12)) {
  console.log(`  #${a.id} ${String(a.company).slice(0, 44).padEnd(44)} ${a.motivo}`);
}
if (lote.length > 12) console.log(`  ... e mais ${lote.length - 12}`);

const naoChecados = deals.filter((d) => {
  if (d.is_prospect === false || d.stage !== "prospect") return false;
  const c = porId.get(d.id);
  if (c?.whatsapp_jid || c?.whatsapp_site || c?.whatsapp_check) return false;
  return Boolean(digitos(c?.phone) || digitos(c?.whatsapp));
}).length;
if (naoChecados > 0) {
  console.log(`\n${naoChecados} lead(s) com telefone AINDA NAO CHECADO ficaram de fora.`);
  console.log("Rode: node scripts/uazapi-check-numbers.mjs --go");
}

if (!GO) {
  console.log("\nDry-run: nada gravado. Rode com --go para aplicar.");
  process.exit(0);
}

let ok = 0;
for (const a of lote) {
  await supa(`deals?id=eq.${a.id}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ stage: "lost", blocker: a.motivo }),
  });
  ok++;
  if (ok % 50 === 0) console.log(`  ${ok}/${lote.length}`);
}
console.log(`\nDescartados: ${ok}. Reversivel: basta voltar stage para 'prospect'.`);
