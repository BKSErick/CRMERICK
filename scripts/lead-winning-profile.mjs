/**
 * lead-winning-profile.mjs
 * Le o que JA aconteceu no CRM e descobre que tipo de lead responde de verdade.
 * O resultado vira data/winning-profile.json, que o scoring usa para priorizar
 * leads parecidos com os que estao dando certo (lookalike).
 *
 * USO:
 *   node scripts/lead-winning-profile.mjs            # so mostra o retrato
 *   node scripts/lead-winning-profile.mjs --go       # grava data/winning-profile.json
 *   node scripts/lead-winning-profile.mjs --min=8    # amostra minima por celula
 *
 * DIMENSOES (as unicas que o CRM realmente guarda hoje):
 *   segment    usinagem | caldeiraria | manutencao | automacao | climatizacao
 *   ddd        regiao, tirado do telefone (31 = Vale do Aco/BH, 47 = SC...)
 *   tem_site   se o lead tinha site na hora da abordagem
 *   variante   abertura A ("Oi, tudo bem?") ou B ("Fala!") do teste em curso
 *
 * ESTATISTICA: com 150 disparos uma celula pode ter 2 leads. Taxa crua ali mente
 * (1 resposta em 2 = 50%). Por isso cada taxa e puxada para a media geral por um
 * peso de suavizacao (PESO_PRIOR): celula pequena fica perto da media, celula
 * grande manda no proprio numero. Sem isso o scoring vira superticao.
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
const MIN_AMOSTRA = Number(arg("min", 5));
const PESO_PRIOR = Number(arg("prior", 12)); // equivale a "12 disparos de media geral"

const SUPA = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SAIDA = path.join(RAIZ, "data", "winning-profile.json");

const supa = (rota) =>
  fetch(`${SUPA}/rest/v1/${rota}`, {
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, Range: "0-9999" },
  }).then((r) => r.json());

// Mesma regra do disparo: autoresponder nao e resposta humana.
const AUTORESPONDER = /agradece|obrigado (por|pelo)|seja bem-vind|responderemos|assistente virtual|em breve|hor[aá]rio de atendimento/i;

// Interesse real: respondeu como gente OU o card avancou de estagio.
const ESTAGIO_QUENTE = new Set(["qualified", "negotiation", "won"]);

// A regra de segmento canonico VIVE em lib/analise-comum.mjs, compartilhada com
// normalize-segments.mjs e analise-conversas.mjs. Estava duplicada aqui; manter as
// duas copias faria os relatorios discordarem sobre quantos leads sao "usinagem".
import { segmentoCanonico, taxaSuavizada as suavizar } from "./lib/analise-comum.mjs";

function dddDe(...telefones) {
  for (const t of telefones) {
    const d = String(t || "").replace(/\D/g, "").replace(/^55/, "");
    if (d.length >= 10) return d.slice(0, 2);
  }
  return null;
}

function varianteDaCopy(copy) {
  if (!copy) return null;
  if (/^\s*Fala!/i.test(copy)) return "B";
  if (/^\s*Oi, tudo bem\?/i.test(copy)) return "A";
  return null;
}

// Taxa suavizada: puxa a celula para a media geral conforme ela e pequena.
// Implementacao compartilhada em lib/analise-comum.mjs; aqui so fixa o peso que
// este relatorio usa (configuravel por --prior).
const taxaSuavizada = (acertos, total, mediaGeral) =>
  suavizar(acertos, total, mediaGeral, PESO_PRIOR);

function tabela(linhas, chave) {
  const mapa = new Map();
  for (const l of linhas) {
    const k = chave(l);
    if (k == null) continue;
    const c = mapa.get(k) || { total: 0, quentes: 0 };
    c.total++;
    if (l.quente) c.quentes++;
    mapa.set(k, c);
  }
  return mapa;
}

(async () => {
  const [deals, contatos, acts] = await Promise.all([
    supa("deals?select=id,company,segment,stage,copy_text,site_url,analysis_url"),
    supa("contacts?select=id,phone,whatsapp_site,whatsapp_jid,city,uf,rating,reviews_count"),
    supa("activities?type=in.(whatsapp_sent,whatsapp_sent_sync,whatsapp_received)&select=deal_id,type,description"),
  ]);

  const C = Object.fromEntries(contatos.map((c) => [c.id, c]));
  const hist = {};
  for (const a of acts) {
    if (!a.deal_id) continue;
    const h = (hist[a.deal_id] = hist[a.deal_id] || { saidas: 0, humanas: 0 });
    if (a.type === "whatsapp_received") {
      if (!AUTORESPONDER.test(a.description || "")) h.humanas++;
    } else h.saidas++;
  }

  // So entra quem FOI abordado. Quem nunca recebeu mensagem nao ensina nada.
  const linhas = deals
    .filter((d) => hist[d.id]?.saidas > 0)
    .map((d) => {
      const c = C[d.id] || {};
      return {
        id: d.id,
        segment: segmentoCanonico(d.segment, d.company),
        segment_bruto: d.segment || null,
        ddd: dddDe(c.whatsapp_jid, c.whatsapp_site, c.phone, d.phone),
        // city so existe para lead importado depois de 31/07/2026. Ate a base virar,
        // essa dimensao fica quase vazia e o corte por amostra minima a ignora sozinho.
        city: c.city || null,
        // Faixa de reputacao: responde mais quem tem muita avaliacao ou quem tem pouca?
        reputacao: c.reviews_count == null ? null : c.reviews_count >= 50 ? "50+" : c.reviews_count >= 10 ? "10a49" : "0a9",
        tem_site: Boolean(d.site_url || d.analysis_url),
        variante: varianteDaCopy(d.copy_text),
        quente: hist[d.id].humanas > 0 || ESTAGIO_QUENTE.has(d.stage),
      };
    });

  const total = linhas.length;
  const quentes = linhas.filter((l) => l.quente).length;
  const mediaGeral = total ? quentes / total : 0;

  console.log(`Abordados: ${total} | responderam/avancaram: ${quentes} | taxa geral: ${(mediaGeral * 100).toFixed(1)}%`);
  console.log(`Suavizacao: prior de ${PESO_PRIOR} disparos | amostra minima para relatar: ${MIN_AMOSTRA}\n`);

  const dimensoes = {
    segment: tabela(linhas, (l) => l.segment),
    ddd: tabela(linhas, (l) => l.ddd),
    city: tabela(linhas, (l) => l.city),
    reputacao: tabela(linhas, (l) => l.reputacao),
    tem_site: tabela(linhas, (l) => (l.tem_site ? "com_site" : "sem_site")),
    variante: tabela(linhas, (l) => l.variante),
  };

  const perfil = {
    geradoEm: new Date().toISOString(),
    amostra: total,
    quentes,
    taxaGeral: mediaGeral,
    priorPeso: PESO_PRIOR,
    minAmostra: MIN_AMOSTRA, // o scoring ignora celula abaixo disso
    dimensoes: {},
  };

  const semSegmento = linhas.filter((l) => !l.segment && l.segment_bruto).length;
  if (semSegmento) {
    console.log(`Aviso: ${semSegmento} deals com segmento em texto livre que nao casou com nenhuma chave.\n`);
  }

  for (const [nome, mapa] of Object.entries(dimensoes)) {
    console.log(`## ${nome}`);
    const itens = [...mapa.entries()]
      .map(([valor, c]) => {
        const taxa = taxaSuavizada(c.quentes, c.total, mediaGeral);
        return { valor, ...c, taxa, lift: mediaGeral ? taxa / mediaGeral : 1 };
      })
      .sort((a, b) => b.lift - a.lift);

    perfil.dimensoes[nome] = Object.fromEntries(
      itens.map((i) => [i.valor, { total: i.total, quentes: i.quentes, taxa: Number(i.taxa.toFixed(4)), lift: Number(i.lift.toFixed(3)) }]),
    );

    for (const i of itens) {
      const flag = i.total < MIN_AMOSTRA ? "  (amostra baixa)" : "";
      const cru = i.total ? ((i.quentes / i.total) * 100).toFixed(0) : "0";
      console.log(
        `  ${String(i.valor).padEnd(14)} n=${String(i.total).padStart(3)} quentes=${String(i.quentes).padStart(2)}` +
          ` | cru ${String(cru).padStart(3)}% | ajustado ${(i.taxa * 100).toFixed(1)}% | lift ${i.lift.toFixed(2)}x${flag}`,
      );
    }
    console.log("");
  }

  // O que o Garimpo deve buscar a seguir: as celulas com lift acima de 1 e amostra que se sustenta.
  const bonsSegmentos = Object.entries(perfil.dimensoes.segment || {})
    .filter(([, v]) => v.lift > 1 && v.total >= MIN_AMOSTRA)
    .map(([k]) => k);
  const bonsDdds = Object.entries(perfil.dimensoes.ddd || {})
    .filter(([, v]) => v.lift > 1 && v.total >= MIN_AMOSTRA)
    .map(([k]) => k);
  perfil.buscarMais = { segmentos: bonsSegmentos, ddds: bonsDdds };

  console.log("## Proxima garimpagem (lift > 1 com amostra suficiente)");
  console.log(`  segmentos: ${bonsSegmentos.join(", ") || "nenhum ainda se destacou"}`);
  console.log(`  regioes (DDD): ${bonsDdds.join(", ") || "nenhuma ainda se destacou"}`);

  if (GO) {
    fs.mkdirSync(path.dirname(SAIDA), { recursive: true });
    fs.writeFileSync(SAIDA, JSON.stringify(perfil, null, 2));
    console.log(`\nGravado em ${path.relative(RAIZ, SAIDA)}`);
  } else {
    console.log("\nDry-run: nada gravado. Rode com --go para salvar o perfil.");
  }
})();