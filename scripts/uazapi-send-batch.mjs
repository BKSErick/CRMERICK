/**
 * uazapi-send-batch.mjs
 * Dispara um lote pequeno de mensagens de prospeccao pelo WhatsApp (Uazapi)
 * usando a copy que ja esta gravada em deals.copy_text.
 *
 * DEFAULT E DRY-RUN: sem --go ele so mostra quem receberia e o texto.
 *
 * USO:
 *   node scripts/uazapi-send-batch.mjs                 # dry-run, 7 leads
 *   node scripts/uazapi-send-batch.mjs --limit=7 --go  # dispara de verdade
 *   node scripts/uazapi-send-batch.mjs --ids=491,900   # escolhe os leads na mao
 *   node scripts/uazapi-send-batch.mjs --go --force-hora  # ignora a janela de horario
 *
 * REGRAS ANTI-BLOQUEIO (decididas com o Erick em 31/07/2026):
 * - intervalo sorteado entre 90 e 240s, nunca fixo (cadencia fixa e digital de robo)
 * - pausa maior entre sub-blocos, em vez de 7 mensagens seguidas
 * - so em horario comercial de dia util
 * - para na hora se duas mensagens seguidas falharem (primeiro sinal de bloqueio)
 * - texto ja e personalizado por lead na origem (copy_text)
 *
 * O webhook da Uazapi ignora o que sai pela API (excludeMessages: wasSentByApi),
 * entao este script grava a atividade whatsapp_sent no CRM. E essa atividade que
 * move o card de prospect para abordado.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
for (const linha of fs.readFileSync(path.join(RAIZ, ".env"), "utf8").split(/\r?\n/)) {
  const m = linha.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

const arg = (nome, padrao) => {
  const a = process.argv.find((x) => x.startsWith(`--${nome}=`));
  return a ? a.split("=")[1] : padrao;
};
const GO = process.argv.includes("--go");
const FORCE_HORA = process.argv.includes("--force-hora");
const LIMITE = Number(arg("limit", 7));
const IDS = arg("ids", "").split(",").map(Number).filter(Boolean);
const MIN_S = Number(arg("min", 90));
const MAX_S = Number(arg("max", 240));
const PAUSA_BLOCO_S = Number(arg("pausa", 420));
const TAM_BLOCO = Number(arg("bloco", 3));

const BASE = process.env.UAZAPI_BASE_URL;
const TOKEN = process.env.UAZAPI_INSTANCE_TOKEN;
const SUPA = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const CRM = process.env.CRM_BASE_URL || "https://crmerick.vercel.app";

if (!BASE || !TOKEN || !SUPA || !KEY) {
  console.error("Faltam variaveis: UAZAPI_BASE_URL, UAZAPI_INSTANCE_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const sorteio = (min, max) => Math.floor(min + Math.random() * (max - min));
const hhmm = (d = new Date()) => d.toTimeString().slice(0, 5);

function janelaOk() {
  const agora = new Date();
  const dia = agora.getDay();
  if (dia === 0 || dia === 6) return { ok: false, motivo: "fim de semana" };
  const min = agora.getHours() * 60 + agora.getMinutes();
  const manha = min >= 9 * 60 && min <= 11 * 60 + 30;
  const tarde = min >= 14 * 60 && min <= 17 * 60;
  if (!manha && !tarde) return { ok: false, motivo: `fora da janela (9h-11h30 / 14h-17h), agora sao ${hhmm(agora)}` };
  return { ok: true };
}

const supa = async (rota, init = {}) =>
  fetch(`${SUPA}/rest/v1/${rota}`, {
    ...init,
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json", ...(init.headers || {}) },
  });

async function carregarFila() {
  const filtro = IDS.length ? `id=in.(${IDS.join(",")})` : "stage=eq.prospect";
  const deals = await (await supa(`deals?${filtro}&select=id,company,stage,copy_text`, { headers: { Range: "0-9999" } })).json();
  const contatos = await (await supa("contacts?select=id,phone", { headers: { Range: "0-9999" } })).json();
  const fone = Object.fromEntries(contatos.map((c) => [c.id, c.phone]));

  return deals
    .filter((d) => d.copy_text)
    .map((d) => {
      const dig = String(fone[d.id] || "").replace(/\D/g, "");
      return { ...d, fone: dig.length === 11 && dig[2] === "9" ? `55${dig}` : null };
    })
    .filter((d) => d.fone)
    .filter((d) => IDS.length === 0 || IDS.includes(d.id));
}

async function jaDisparado(dealId) {
  const r = await supa(`activities?deal_id=eq.${dealId}&type=in.(whatsapp_sent,whatsapp_sent_sync)&select=id&limit=1`);
  const j = await r.json();
  return Array.isArray(j) && j.length > 0;
}

async function enviar(fone, texto) {
  const r = await fetch(`${BASE}/send/text`, {
    method: "POST",
    headers: { token: TOKEN, "Content-Type": "application/json" },
    body: JSON.stringify({ number: fone, text: texto, linkPreview: false }),
  });
  const corpo = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, corpo };
}

async function registrar(dealId, empresa) {
  const r = await fetch(`${CRM}/api/activities`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ dealId, type: "whatsapp_sent", description: `Disparo automatico para ${empresa}` }),
  });
  return r.ok;
}

(async () => {
  const status = await (await fetch(`${BASE}/instance/status`, { headers: { token: TOKEN } })).json().catch(() => ({}));
  const conectada = status?.instance?.status === "connected";
  console.log(`Instancia: ${status?.instance?.status ?? "desconhecida"} (${status?.instance?.owner ?? "-"})`);
  if (GO && !conectada) {
    console.error("Instancia nao esta conectada. Abortado.");
    process.exit(1);
  }

  const janela = janelaOk();
  if (GO && !janela.ok && !FORCE_HORA) {
    console.error(`Fora da janela de disparo: ${janela.motivo}. Use --force-hora para ignorar.`);
    process.exit(1);
  }

  const fila = await carregarFila();
  const lote = [];
  for (const lead of fila) {
    if (lote.length >= LIMITE) break;
    if (await jaDisparado(lead.id)) continue;
    lote.push(lead);
  }

  console.log(`\nFila elegivel: ${fila.length} | lote: ${lote.length} | modo: ${GO ? "ENVIO REAL" : "dry-run"}\n`);
  lote.forEach((l, i) => {
    console.log(`[${i + 1}] #${l.id} ${l.company} -> ${l.fone}`);
    if (!GO) console.log(l.copy_text.split("\n").map((x) => "    " + x).join("\n") + "\n");
  });

  if (!GO) {
    console.log("\nDry-run. Nada foi enviado. Rode de novo com --go para disparar.");
    return;
  }

  let falhasSeguidas = 0;
  let enviados = 0;
  for (let i = 0; i < lote.length; i++) {
    const lead = lote[i];
    const r = await enviar(lead.fone, lead.copy_text);
    if (r.ok) {
      falhasSeguidas = 0;
      enviados++;
      const logou = await registrar(lead.id, lead.company);
      console.log(`${hhmm()} OK   #${lead.id} ${lead.company}${logou ? "" : " (atividade NAO registrada)"}`);
    } else {
      falhasSeguidas++;
      console.log(`${hhmm()} FALHA #${lead.id} ${lead.company} -> ${r.status} ${JSON.stringify(r.corpo).slice(0, 120)}`);
      if (falhasSeguidas >= 2) {
        console.error("\nDuas falhas seguidas. Parando agora: e o primeiro sinal de bloqueio.");
        break;
      }
    }

    if (i < lote.length - 1) {
      const fimDoBloco = (i + 1) % TAM_BLOCO === 0;
      const espera = fimDoBloco ? PAUSA_BLOCO_S : sorteio(MIN_S, MAX_S);
      console.log(`     aguardando ${espera}s${fimDoBloco ? " (pausa entre blocos)" : ""}...`);
      await dormir(espera * 1000);
    }
  }

  console.log(`\nEnviados: ${enviados}/${lote.length}.`);
})();