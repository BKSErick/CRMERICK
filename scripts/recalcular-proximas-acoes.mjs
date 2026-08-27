/**
 * recalcular-proximas-acoes.mjs
 * Limpa e atualiza a data de próxima ação (next_action_at) dos deals no Supabase.
 *
 * Resolve o problema de datas antigas expiradas (ex: 15/07/2026) que continuavam
 * exibindo pill vermelho de "Ação Vencida" na Lista de Deals e no Funil.
 *
 * Regras:
 * 1. deals em stage 'lost' ou 'won': zera next_action_at (null)
 * 2. deals em stage 'prospect': zera next_action_at expirado (null)
 * 3. deals em 'abordado', 'followup', 'qualified', 'proposal', 'negotiation' com data < hoje:
 *    - Se tem última saída/entrada: calcula nova data recomendada pela cadência
 *    - Se não tem histórico: zera a data antiga expirada
 *
 * USO:
 *   node scripts/recalcular-proximas-acoes.mjs         # dry-run
 *   node scripts/recalcular-proximas-acoes.mjs --go    # grava no Supabase
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

async function buscarTudosDeals() {
  const todos = [];
  const passo = 1000;
  for (let inicio = 0; ; inicio += passo) {
    const pagina = await supa(
      `deals?select=id,company,stage,response_type,next_action_at,last_outbound_at,last_inbound_at`,
      { headers: { Range: `${inicio}-${inicio + passo - 1}`, "Range-Unit": "items" } }
    );
    if (!Array.isArray(pagina) || pagina.length === 0) break;
    todos.push(...pagina);
    if (pagina.length < passo) break;
  }
  return todos;
}

const HOJE_ISO = new Date().toISOString();
const HOJE_ZERO = new Date();
HOJE_ZERO.setHours(0, 0, 0, 0);

console.log("Buscando todos os deals do Supabase...");
const deals = await buscarTudosDeals();
console.log(`Total de deals carregados: ${deals.length}`);

const alteracoes = [];

for (const d of deals) {
  const dtAtual = d.next_action_at ? new Date(d.next_action_at) : null;
  const expirado = dtAtual && dtAtual < HOJE_ZERO;

  // Regra 1: Lost ou Won não devem ter próxima ação agendada
  if (d.stage === "lost" || d.stage === "won") {
    if (d.next_action_at !== null) {
      alteracoes.push({
        id: d.id,
        company: d.company,
        stage: d.stage,
        de: d.next_action_at,
        para: null,
        motivo: `Deal ${d.stage}: próxima ação zerada`,
      });
    }
    continue;
  }

  // Regra 2: Prospect não precisa de próxima ação vencida de julho
  if (d.stage === "prospect") {
    if (expirado) {
      alteracoes.push({
        id: d.id,
        company: d.company,
        stage: d.stage,
        de: d.next_action_at,
        para: null,
        motivo: "Prospect com data vencida zerada",
      });
    }
    continue;
  }

  // Regra 3: Deals em andamento com data expirada no passado
  if (expirado) {
    let novaData = null;
    const baseIso = d.last_inbound_at || d.last_outbound_at;
    if (baseIso) {
      const dtBase = new Date(baseIso);
      if (!Number.isNaN(dtBase.getTime())) {
        dtBase.setUTCDate(dtBase.getUTCDate() + 2);
        if (dtBase >= HOJE_ZERO) {
          novaData = dtBase.toISOString();
        }
      }
    }

    alteracoes.push({
      id: d.id,
      company: d.company,
      stage: d.stage,
      de: d.next_action_at,
      para: novaData,
      motivo: novaData ? "Data de próxima ação ajustada para próxima cadência" : "Data expirada zerada",
    });
  }
}

console.log(`\nDeals a atualizar: ${alteracoes.length}`);
console.log("Exemplos de correções:");
for (const a of alteracoes.slice(0, 15)) {
  const deFmt = a.de ? a.de.slice(0, 10) : "null";
  const paraFmt = a.para ? a.para.slice(0, 10) : "null";
  console.log(`  #${a.id} [${a.stage}] ${String(a.company).slice(0, 35).padEnd(35)} : ${deFmt} -> ${paraFmt} (${a.motivo})`);
}

if (!GO) {
  console.log("\nModo Dry-Run. Rode com --go para gravar no Supabase.");
  process.exit(0);
}

console.log("\nGravando atualizações no Supabase...");
let ok = 0;
for (const a of alteracoes) {
  await supa(`deals?id=eq.${a.id}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ next_action_at: a.para }),
  });
  ok++;
  if (ok % 50 === 0) console.log(`  Progresso: ${ok}/${alteracoes.length}`);
}

console.log(`\nSucesso! ${ok} deals tiveram suas datas de próxima ação higienizadas.`);
