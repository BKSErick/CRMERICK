/**
 * scrape-site-whatsapp.mjs
 * Varre o site de cada lead atras do WhatsApp que o scraper original nao pegou.
 *
 * O numero na base veio do Google Maps e muitas vezes e o fixo do escritorio. Mas o
 * site quase sempre tem botao de WhatsApp com o numero que a empresa realmente atende.
 * Esse numero vale mais que o do Maps: e o canal que eles escolheram divulgar.
 *
 * USO:
 *   node scripts/scrape-site-whatsapp.mjs                 # dry-run
 *   node scripts/scrape-site-whatsapp.mjs --go            # grava contacts.whatsapp_site
 *   node scripts/scrape-site-whatsapp.mjs --go --limit=50
 *   node scripts/scrape-site-whatsapp.mjs --go --so-sem-celular   # so quem nao tem celular
 *
 * Nao sobrescreve o phone original. Grava em whatsapp_site + site_url.
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
const SO_SEM_CELULAR = process.argv.includes("--so-sem-celular");
const LIMITE = Number(arg("limit", 100));
const CONCORRENCIA = Number(arg("par", 5));

const SUPA = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PAGINAS = path.join(RAIZ, "huberick-temp");

const supa = (rota, init = {}) =>
  fetch(`${SUPA}/rest/v1/${rota}`, {
    ...init,
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json", ...(init.headers || {}) },
  });

// A URL do site esta na pagina de auditoria ja gerada ("Site avaliado: ...").
function siteDaAuditoria(analysisUrl) {
  if (!analysisUrl) return null;
  const arquivo = path.join(PAGINAS, analysisUrl.split("/").pop());
  if (!fs.existsSync(arquivo)) return null;
  const html = fs.readFileSync(arquivo, "utf8");
  const m = html.match(/Site avaliado:\s*(https?:\/\/[^\s<"'`,]+)/i);
  return m ? m[1].replace(/[.,]$/, "") : null;
}

// wa.me e api.whatsapp sao prova de que o numero atende no WhatsApp. Links do Google
// vem percent-encoded (%2Fsend%3Fphone%3D), por isso decodifica antes de casar.
function extrairWhatsapp(html) {
  const texto = (() => {
    try {
      return decodeURIComponent(html);
    } catch {
      return html;
    }
  })();
  const achados = new Set();
  for (const re of [/wa\.me\/(\d{10,15})/gi, /whatsapp[^"'<>\s]{0,40}?phone=(\d{10,15})/gi, /api\.whatsapp\.com\/send\?phone=(\d{10,15})/gi]) {
    for (const m of texto.matchAll(re)) achados.add(m[1]);
  }
  return [...achados]
    .map((n) => (n.startsWith("55") ? n : `55${n}`))
    .filter((n) => n.length >= 12 && n.length <= 13);
}

async function comTimeout(url, ms = 12000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctrl.signal, redirect: "follow", headers: { "User-Agent": "Mozilla/5.0" } });
    return await r.text();
  } finally {
    clearTimeout(t);
  }
}

(async () => {
  const [deals, contatos] = await Promise.all([
    (await supa("deals?stage=eq.prospect&select=id,company,analysis_url", { headers: { Range: "0-9999" } })).json(),
    (await supa("contacts?select=id,phone,whatsapp_site", { headers: { Range: "0-9999" } })).json(),
  ]);
  const C = Object.fromEntries(contatos.map((c) => [c.id, c]));

  const alvo = deals
    .filter((d) => {
      const c = C[d.id];
      if (!c || c.whatsapp_site) return false;
      if (!SO_SEM_CELULAR) return true;
      const dig = String(c.phone || "").replace(/\D/g, "");
      return !(dig.length === 11 && dig[2] === "9");
    })
    .map((d) => ({ ...d, site: siteDaAuditoria(d.analysis_url) }))
    .filter((d) => d.site)
    .slice(0, LIMITE);

  console.log(`Sites a varrer: ${alvo.length} | modo: ${GO ? "GRAVA" : "dry-run"}\n`);

  let achou = 0;
  let vazio = 0;
  let erro = 0;
  for (let i = 0; i < alvo.length; i += CONCORRENCIA) {
    const fatia = alvo.slice(i, i + CONCORRENCIA);
    await Promise.all(
      fatia.map(async (d) => {
        try {
          const html = await comTimeout(d.site);
          const numeros = extrairWhatsapp(html);
          if (!numeros.length) {
            vazio++;
            return;
          }
          achou++;
          const escolhido = numeros[0];
          const atual = String(C[d.id]?.phone || "").replace(/\D/g, "");
          const novo = escolhido.replace(/^55/, "") !== atual.replace(/^55/, "");
          console.log(`  #${d.id} ${String(d.company).slice(0, 34)} -> ${escolhido}${novo ? "  (DIFERENTE do cadastrado)" : ""}`);
          if (GO) {
            await supa(`contacts?id=eq.${d.id}`, {
              method: "PATCH",
              headers: { Prefer: "return=minimal" },
              body: JSON.stringify({ whatsapp_site: escolhido, site_url: d.site }),
            });
          }
        } catch {
          erro++;
        }
      }),
    );
  }

  console.log(`\nCom WhatsApp no site: ${achou} | sem: ${vazio} | site fora do ar/erro: ${erro}`);
  if (!GO) console.log("Dry-run: nada gravado. Rode com --go para salvar.");
})();