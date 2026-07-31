/**
 * uazapi-check-numbers.mjs
 * Descobre quais telefones da base REALMENTE tem WhatsApp e grava o resultado.
 *
 * Motivo: 528 dos 727 prospects tem numero fixo, e fixo com WhatsApp Business e
 * comum em industria pequena. Descartar fixo no filtro jogava fora 73% da base.
 * A Uazapi responde se o numero existe no WhatsApp e devolve o JID correto (que
 * as vezes tem o 9 a mais ou a menos que o cadastrado).
 *
 * USO:
 *   node scripts/uazapi-check-numbers.mjs                # dry-run: so conta e mostra
 *   node scripts/uazapi-check-numbers.mjs --go           # grava em contacts.whatsapp_jid
 *   node scripts/uazapi-check-numbers.mjs --go --limit=200
 *   node scripts/uazapi-check-numbers.mjs --go --so-fixo # so os que hoje sao fixo
 *
 * Grava em contacts:
 *   whatsapp_jid    JID confirmado (ex: 553133334444@s.whatsapp.net) ou null
 *   whatsapp_check  data da verificacao
 * Nada e apagado: numero sem WhatsApp so fica marcado, o registro continua.
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
const SO_FIXO = process.argv.includes("--so-fixo");
const LIMITE = Number(arg("limit", 1000));
const LOTE = Number(arg("lote", 20)); // numeros por requisicao

const BASE = process.env.UAZAPI_BASE_URL;
const TOKEN = process.env.UAZAPI_INSTANCE_TOKEN;
const SUPA = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supa = (rota, init = {}) =>
  fetch(`${SUPA}/rest/v1/${rota}`, {
    ...init,
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json", ...(init.headers || {}) },
  });

// A rota de verificacao mudou de nome entre versoes da Uazapi. Tenta as conhecidas
// e memoriza a que responder, em vez de assumir uma e quebrar em silencio.
const CANDIDATAS = ["/chat/check", "/chat/exists", "/number/exists", "/contact/check"];
let rotaBoa = null;

async function verificar(numeros) {
  const tentar = rotaBoa ? [rotaBoa] : CANDIDATAS;
  for (const rota of tentar) {
    try {
      const r = await fetch(`${BASE}${rota}`, {
        method: "POST",
        headers: { token: TOKEN, "Content-Type": "application/json" },
        body: JSON.stringify({ numbers: numeros }),
      });
      if (r.status === 404 || r.status === 405) continue;
      const j = await r.json().catch(() => null);
      if (!r.ok || !j) continue;
      rotaBoa = rota;
      const lista = Array.isArray(j) ? j : j.data || j.result || j.numbers || [];
      return lista.map((x) => ({
        entrada: String(x.query ?? x.number ?? x.input ?? ""),
        existe: Boolean(x.exists ?? x.isInWhatsapp ?? x.isWhatsapp ?? x.valid),
        jid: x.jid ?? x.wa_id ?? x.chatid ?? null,
      }));
    } catch {
      // tenta a proxima rota
    }
  }
  return null;
}

const variantes = (dig) => {
  const d = dig.replace(/^55/, "");
  const ddd = d.slice(0, 2);
  const resto = d.slice(2);
  const set = new Set([`55${d}`]);
  if (resto.length === 8) set.add(`55${ddd}9${resto}`); // fixo/antigo -> com o 9
  if (resto.length === 9 && resto[0] === "9") set.add(`55${ddd}${resto.slice(1)}`);
  return [...set];
};

(async () => {
  const status = await (await fetch(`${BASE}/instance/status`, { headers: { token: TOKEN } })).json().catch(() => ({}));
  if (status?.instance?.status !== "connected") {
    console.error(`Instancia nao conectada (${status?.instance?.status ?? "sem resposta"}). Reconecte antes.`);
    process.exit(1);
  }

  const [deals, contatos] = await Promise.all([
    (await supa("deals?stage=eq.prospect&select=id", { headers: { Range: "0-9999" } })).json(),
    (await supa("contacts?select=id,phone,whatsapp_jid", { headers: { Range: "0-9999" } })).json(),
  ]);
  const prospects = new Set(deals.map((d) => d.id));
  const alvo = contatos
    .filter((c) => prospects.has(c.id) && !c.whatsapp_jid)
    .map((c) => ({ id: c.id, dig: String(c.phone || "").replace(/\D/g, "") }))
    .filter((c) => c.dig.length >= 10)
    .filter((c) => !SO_FIXO || c.dig.replace(/^55/, "").length === 10)
    .slice(0, LIMITE);

  console.log(`A verificar: ${alvo.length} contatos | modo: ${GO ? "GRAVA" : "dry-run"}`);

  let comWpp = 0;
  let sem = 0;
  for (let i = 0; i < alvo.length; i += LOTE) {
    const fatia = alvo.slice(i, i + LOTE);
    const mapa = new Map();
    for (const c of fatia) for (const v of variantes(c.dig)) mapa.set(v, c.id);

    const res = await verificar([...mapa.keys()]);
    if (!res) {
      console.error("Nenhuma rota de verificacao respondeu. Rotas tentadas:", CANDIDATAS.join(", "));
      process.exit(1);
    }

    const achados = new Map();
    for (const r of res) {
      if (!r.existe) continue;
      const id = mapa.get(r.entrada.replace(/\D/g, ""));
      if (id && !achados.has(id)) achados.set(id, r.jid || `${r.entrada.replace(/\D/g, "")}@s.whatsapp.net`);
    }

    for (const c of fatia) {
      const jid = achados.get(c.id) || null;
      if (jid) comWpp++;
      else sem++;
      if (GO) {
        await supa(`contacts?id=eq.${c.id}`, {
          method: "PATCH",
          headers: { Prefer: "return=minimal" },
          body: JSON.stringify({ whatsapp_jid: jid, whatsapp_check: new Date().toISOString() }),
        });
      }
    }
    console.log(`  ${Math.min(i + LOTE, alvo.length)}/${alvo.length} | com WhatsApp: ${comWpp} | sem: ${sem}`);
    await new Promise((r) => setTimeout(r, 1500)); // respiro entre lotes
  }

  console.log(`\nRota usada: ${rotaBoa}`);
  console.log(`COM WhatsApp: ${comWpp} | SEM: ${sem}`);
  if (!GO) console.log("Dry-run: nada gravado. Rode com --go para salvar.");
})();