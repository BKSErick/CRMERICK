/**
 * import-icp-monlevade.mjs
 * Base de ICP industrial de Joao Monlevade (pesquisa de 15/09/2026) -> CRM ERICK.
 *
 * Quarta fonte de lead, ao lado do Serper (pull-city-serper.mjs), do Garimpo
 * (import-garimpo-leads.mjs) e da ACIMON (import-acimon-leads.mjs). A diferenca: a base
 * ja chegou CURADA (tier A concorrente direto / B ecossistema / C industria compradora,
 * telefone publico, WhatsApp publicado, e-mail publico, CNPJ). Por isso alem do que o
 * leadIngest grava, este script preenche o que os outros importadores nao tocam:
 *   contacts.email        <- email_publico   (fila do Brevo le contacts.email)
 *   deals.setor           <- industria|construcao (build-queue-institucional filtra por setor)
 *   deals.is_icp/icp_source e deals.description <- tier e evidencias, para medir por tier
 *   deals.origin/origin_detail <- "icp_jotta_monlevade" + papel (concorrente_jotta,
 *                                 ecossistema_industrial, industria_compradora)
 *
 * O CSV usa ";" e vem com BOM. Por padrao so entram linhas com status_operacional
 * novo_canal_publico — quem ja esta no CRM (em cadencia, perdido, revisar) fica de fora
 * aqui e continua sendo tratado pelo historico do card, como o relatorio manda.
 *
 * source = "icp_jotta_monlevade" para medir separado do Maps e da ACIMON.
 * Toda a regra de entrada (dedupe, enriquecimento, score, ids) continua em
 * scripts/lib/leadIngest.js.
 *
 * USO:
 *   node scripts/import-icp-monlevade.mjs                                  # dry-run, base completa
 *   node scripts/import-icp-monlevade.mjs --arquivo=data/x.lote-amanha.csv # so o lote
 *   node scripts/import-icp-monlevade.mjs --tier=A,B                       # filtra tier
 *   node scripts/import-icp-monlevade.mjs --status=novo_canal_publico      # filtra status
 *   node scripts/import-icp-monlevade.mjs --go                             # grava
 *   node scripts/import-icp-monlevade.mjs --go --sem-enrich
 *   node scripts/import-icp-monlevade.mjs --enriquecer-crm [--go]          # e-mail/setor pra quem JA esta no CRM
 */

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ingest = require(path.join(RAIZ, "scripts/lib/leadIngest.js"));
const { isExcluded } = require(path.join(RAIZ, "src/lib/leadScoring.js"));

function carregarEnv(arquivo) {
  if (!fs.existsSync(arquivo)) return false;
  for (const linha of fs.readFileSync(arquivo, "utf8").split(/\r?\n/)) {
    const m = linha.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return true;
}
carregarEnv(path.join(RAIZ, ".env"));

const arg = (n, d) => {
  const a = process.argv.find((x) => x.startsWith(`--${n}=`));
  return a ? a.split("=").slice(1).join("=") : d;
};
const GO = process.argv.includes("--go");
const SEM_ENRICH = process.argv.includes("--sem-enrich");
// --enriquecer-crm: em vez de importar, leva o e-mail publico da pesquisa para quem JA
// esta no CRM (crm_id preenchido). E o que faz esses leads entrarem na fila do Brevo:
// "quem ja recebeu WhatsApp e nunca respondeu" so entra se contacts.email e deals.setor
// existirem. Nao sobrescreve e-mail que o card ja tem.
const ENRIQUECER_CRM = process.argv.includes("--enriquecer-crm");
const ARQUIVO = path.resolve(RAIZ, arg("arquivo", path.join("data", "icp-jotta-monlevade-2026-09-15.csv")));
const TIERS = arg("tier", "A,B,C").split(",").map((t) => t.trim().toUpperCase()).filter(Boolean);
// novo_pesquisar_contato (24 empresas sem telefone nem e-mail) fica de fora por padrao:
// entraria como card sem canal nenhum. Passe --status=novo_pesquisar_contato depois de
// enriquecer pela Receita (tem CNPJ), quando houver telefone para o card.
const STATUS = arg("status", "novo_canal_publico").split(",").map((s) => s.trim()).filter(Boolean);
const SOURCE = "icp_jotta_monlevade";
const ICP_SOURCE = "icp_jotta_monlevade_2026-09-15";

const CRM_URL = process.env.SUPABASE_URL;
const CRM_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!CRM_URL || !CRM_KEY) {
  console.error("Faltam SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY no .env do CRM.");
  process.exit(1);
}
const crm = ingest.crmClient(CRM_URL, CRM_KEY);

// --- CSV (";" com aspas, BOM opcional) -----------------------------------------
function lerCsv(texto, sep = ";") {
  const linhas = [];
  let campo = "";
  let linha = [];
  let aspas = false;
  const t = texto.replace(/^﻿/, "");
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (aspas) {
      if (ch === '"' && t[i + 1] === '"') { campo += '"'; i++; }
      else if (ch === '"') aspas = false;
      else campo += ch;
    } else if (ch === '"') aspas = true;
    else if (ch === sep) { linha.push(campo); campo = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && t[i + 1] === "\n") i++;
      linha.push(campo); campo = "";
      if (linha.some((c) => c.trim())) linhas.push(linha);
      linha = [];
    } else campo += ch;
  }
  if (campo || linha.length) { linha.push(campo); if (linha.some((c) => c.trim())) linhas.push(linha); }
  const cab = linhas.shift().map((c) => c.trim());
  return linhas.map((l) => Object.fromEntries(cab.map((c, i) => [c, (l[i] ?? "").trim()])));
}

// --- Traducao da linha curada para o lead do leadIngest -------------------------
// Rotulos genericos que a pesquisa usou quando o CNAE nao dizia nada. Nao descrevem a
// empresa e enganariam o segmentoCanonico ("usinagem" ganha de "manutencao" na ordem
// das regex): HAE Hidraulica viraria usinagem. Saem antes da deteccao.
const RUIDO = /manuten[cç][aã]o\/usinagem industrial|ecossistema industrial/gi;

function categoriaDe(r) {
  const base = [r.cnae_descricao, r.evidencias].filter(Boolean).join(" ").replace(RUIDO, " ").replace(/\s+/g, " ").trim();
  if (ingest.segmentoCanonico(r.empresa, base)) return base;
  // Tier A e, por definicao da pesquisa, o perfil operacional da Jotta: manutencao.
  if (r.tier.startsWith("A_")) return `${base} manutenção industrial`.trim();
  return base;
}

// origin_detail e o que o resto do pipeline le para saber o papel do lead nessa base.
// "concorrente_jotta" muda o case citado: uazapi-followup-batch.mjs (M2) e a carta
// pronta do Comando citam so a Metalthec para esses (decisao do Erick, 15/09/2026).
const ORIGIN_DETAIL_POR_TIER = {
  A: "concorrente_jotta",
  B: "ecossistema_industrial",
  C: "industria_compradora",
};

// setor alimenta a fila de e-mail (build-queue-institucional --setor=industria,construcao).
const CONSTRUCAO = /construtora|concret|pr[eé]-?mold|telha|materia(l|is) (de|para) constru|ferragens|centralfer/i;
const setorDe = (r) => (CONSTRUCAO.test(`${r.empresa} ${r.cnae_descricao} ${r.evidencias}`) ? "construcao" : "industria");

// Caixa que nao e do comercial. Entra, mas o dry-run avisa para o Erick decidir; veto
// definitivo vai para a blocklist do e-mail, nao para ca.
const CAIXA_SUSPEITA = /^(contabilidade|contab|fiscal|nfe|nf-e|rh|dp|financeiro|cobranca|juridico)@/i;
// E-mail que a pesquisa achou no cadastro e e do CONTADOR, nao da empresa (dominio de
// escritorio contabil, caixa fiscal/cadastro). Mandar copy fria pra ele nao chega no
// dono e so gasta reputacao do dominio. Fica fora do --enriquecer-crm.
const CAIXA_CONTADOR = /contab|precisa|fiscal@|cadastro|nfe@|nf-e@|^rh@|^dp@/i;

const emailValido = (v) => (/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(v) && !/\.html?$/i.test(v) ? v.toLowerCase() : null);

function formatarFone(digitos) {
  const d = String(digitos || "").replace(/\D/g, "");
  if (d.length === 13) return `+${d.slice(0, 2)} ${d.slice(2, 4)} ${d.slice(4, 9)}-${d.slice(9)}`;
  if (d.length === 12) return `+${d.slice(0, 2)} ${d.slice(2, 4)} ${d.slice(4, 8)}-${d.slice(8)}`;
  return d ? `+${d}` : null;
}

function paraLead(r) {
  const wa = r.whatsapp_confirmado.replace(/\D/g, "") || null;
  const email = emailValido(r.email_publico);
  const nota = Number(String(r.avaliacao_google).replace(",", "."));
  return {
    name: r.empresa,
    website: r.site || null,
    // O numero confirmado manda: e ele que vira contacts.whatsapp (onde o webhook casa a
    // resposta). O publico fica so quando nao ha WhatsApp confirmado.
    phone: wa ? formatarFone(wa) : r.telefone_publico || null,
    site_whatsapp: wa,
    address: r.endereco || null,
    rating: Number.isFinite(nota) && nota > 0 ? nota : null,
    reviews_count: Number(r.avaliacoes_count || 0),
    maps_cid: null,
    lat: null,
    lng: null,
    cnpj: r.cnpj || null,
    cnae_principal: r.cnae_principal || null,
    cnae_descricao: r.cnae_descricao || null,
    categoria: categoriaDe(r),
    city: r.cidade || "João Monlevade",
    uf: r.uf || "MG",
    source: SOURCE,
    // Campos so deste importador, gravados no PATCH depois do gravar():
    icp: {
      tier: r.tier,
      originDetail: ORIGIN_DETAIL_POR_TIER[r.tier.charAt(0).toUpperCase()] || null,
      prioridade: Number(r.prioridade || 0),
      confianca: r.confianca,
      email,
      setor: setorDe(r),
      descricao: `ICP Jotta/Monlevade — tier ${r.tier} | prioridade ${r.prioridade} (${r.confianca}) | ${r.evidencias || r.cnae_descricao || "sem evidência"}`.slice(0, 500),
      notas: [r.fonte_url && `fonte: ${r.fonte_url}`, r.maps_url && `maps: ${r.maps_url}`].filter(Boolean).join("\n") || null,
    },
  };
}

// --- Quem ja esta no CRM: leva e-mail e setor para o card ------------------------
// Pedido do Erick (15/09/2026): "os que ja receberam WhatsApp dessa lista, vamos usar
// pra mandar e-mail". A regra de canal do Brevo ja faz isso sozinha (quem recebeu
// WhatsApp e nunca respondeu), desde que o card tenha contacts.email e deals.setor.
// Vale para TODA linha com crm_id, com ou sem e-mail: o papel (origin_detail) precisa
// chegar tambem em quem esta em cadencia sem e-mail, senao o M2 desses ainda cita a Jotta.
const vazio = (v) => !v || /^[\s—–-]*$/.test(String(v)); // o import antigo gravava "—" como placeholder

async function enriquecerCrm(linhas) {
  const alvo = linhas.filter((r) => r.crm_id);
  const ids = [...new Set(alvo.map((r) => Number(r.crm_id)))];
  console.log(`Linhas ja no CRM: ${alvo.length} | com e-mail publico: ${alvo.filter((r) => emailValido(r.email_publico)).length}`);
  if (!ids.length) return;

  const [deals, contatos] = await Promise.all([
    ingest.buscarTudo(crm, `deals?id=in.(${ids.join(",")})&select=id,company,stage,setor,contact_id,origin_detail`),
    ingest.buscarTudo(crm, `contacts?select=id,email`),
  ]);
  const dealPorId = new Map(deals.map((d) => [d.id, d]));
  const contatoPorId = new Map(contatos.map((c) => [c.id, c]));

  const plano = [];
  for (const r of alvo) {
    const id = Number(r.crm_id);
    const d = dealPorId.get(id);
    const email = emailValido(r.email_publico);
    if (!d) { plano.push({ id, empresa: r.empresa, acao: "deal nao encontrado", email }); continue; }
    const c = contatoPorId.get(d.contact_id ?? id) || contatoPorId.get(id);
    const contador = Boolean(email) && CAIXA_CONTADOR.test(email);
    const patchContato = email && c && vazio(c.email) && !contador ? { email } : null;
    const patchDeal = {};
    if (vazio(d.setor)) patchDeal.setor = setorDe(r);
    if (vazio(d.origin_detail) && r.tier) patchDeal.origin_detail = ORIGIN_DETAIL_POR_TIER[r.tier.charAt(0).toUpperCase()] || null;
    const acao = !email
      ? "sem e-mail publico"
      : contador
        ? "e-mail de contador, nao grava"
        : !c
          ? "contato nao encontrado"
          : !vazio(c.email)
            ? `ja tinha ${c.email}`
            : "grava e-mail";
    plano.push({ id, empresa: r.empresa, stage: d.stage, acao, email, contatoId: c?.id, patchContato, patchDeal: Object.keys(patchDeal).length ? patchDeal : null });
  }

  for (const p of plano) {
    const extras = [p.patchDeal?.setor && `setor=${p.patchDeal.setor}`, p.patchDeal?.origin_detail && `papel=${p.patchDeal.origin_detail}`].filter(Boolean).join(" ");
    console.log(`  #${String(p.id).padEnd(5)} ${String(p.empresa).slice(0, 34).padEnd(34)} ${String(p.stage || "-").padEnd(11)} ${p.acao.padEnd(30)} ${p.email || ""} ${extras}`);
  }
  const gravaveis = plano.filter((p) => p.patchContato || p.patchDeal);
  console.log(`\nE-mails novos no card: ${plano.filter((p) => p.patchContato).length} | setor/papel a preencher: ${plano.filter((p) => p.patchDeal).length}`);
  console.log("Quem entra na fila do Brevo depois disso e decisao do build-queue-institucional (lost fica fora, quem respondeu fica protegido).");

  if (!GO) {
    console.log("\nDry-run: nada gravado. Rode com --enriquecer-crm --go para gravar.");
    return;
  }
  let ok = 0;
  for (const p of gravaveis) {
    let fine = true;
    if (p.patchContato) {
      const rc = await crm(`contacts?id=eq.${p.contatoId}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify(p.patchContato) });
      if (!rc.ok) { fine = false; console.log(`  FALHA contato #${p.contatoId}: ${rc.status}`); }
    }
    if (p.patchDeal) {
      const rd = await crm(`deals?id=eq.${p.id}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify(p.patchDeal) });
      if (!rd.ok) { fine = false; console.log(`  FALHA deal #${p.id}: ${rd.status}`); }
    }
    if (fine) ok++;
  }
  console.log(`\nGravados: ${ok}/${gravaveis.length}`);
  console.log("Proximo passo: cd scripts/email && node build-queue-institucional.mjs --setor=industria,construcao   (regra de canal padrao)");
}

(async () => {
  if (!fs.existsSync(ARQUIVO)) {
    console.error(`Arquivo nao encontrado: ${ARQUIVO}`);
    process.exit(1);
  }
  const linhas = lerCsv(fs.readFileSync(ARQUIVO, "utf8"));
  const porStatus = {};
  for (const r of linhas) porStatus[r.status_operacional] = (porStatus[r.status_operacional] || 0) + 1;
  console.log(`Arquivo: ${path.relative(RAIZ, ARQUIVO)} | ${linhas.length} linhas`);
  console.log(`Status no arquivo: ${JSON.stringify(porStatus)}`);
  if (ENRIQUECER_CRM) {
    await enriquecerCrm(linhas);
    return;
  }
  console.log(`Filtro: status ${STATUS.join(",")} | tier ${TIERS.join(",")}\n`);

  const selecionados = linhas
    .filter((r) => r.empresa)
    .filter((r) => STATUS.includes(r.status_operacional))
    .filter((r) => TIERS.includes(r.tier.charAt(0).toUpperCase()))
    .map(paraLead);
  const excluidos = selecionados.filter((l) => isExcluded(l));
  const candidatos = selecionados.filter((l) => !isExcluded(l));

  console.log(`Candidatos validos: ${candidatos.length}`);
  if (excluidos.length) {
    console.log(`Barrados pelo filtro de exclusao do CRM (leadScoring.isExcluded): ${excluidos.length}`);
    for (const l of excluidos) console.log(`  ${l.name} (${l.cnae_descricao || "-"})`);
  }

  const indice = await ingest.montarIndiceDedupe(crm);
  const { novos, motivos } = ingest.filtrarNovos(candidatos, indice);
  console.log(
    `Novos: ${novos.length} | descartados: nome ${motivos.nome}, telefone ${motivos.fone},` +
      ` dominio ${motivos.dominio}, cnpj ${motivos.cid}, cliente ${motivos.cliente}, lista-negra ${motivos.proibido}\n`,
  );
  if (!novos.length) return;

  if (!SEM_ENRICH) {
    const r = await ingest.enriquecer(novos);
    console.log(`Sites visitados: ${r.visitados} | com WhatsApp publicado: ${r.comWhatsapp}\n`);
  }

  const { itens, temPerfil } = ingest.pontuar(novos);
  const comCanal = itens.filter((i) => i.diag.phone_e164).length;
  const comSeg = itens.filter((i) => ingest.segmentoCanonico(i.lead.name, i.lead.categoria)).length;
  const comEmail = itens.filter((i) => i.lead.icp.email).length;
  const comWa = itens.filter((i) => i.lead.site_whatsapp).length;
  console.log(
    `Com canal utilizavel: ${comCanal}/${itens.length} | segmento canonico (fila WhatsApp): ${comSeg}/${itens.length}` +
      ` | WhatsApp confirmado: ${comWa} | e-mail: ${comEmail}\n`,
  );

  const porTier = {};
  for (const { lead } of itens) {
    const t = lead.icp.tier;
    porTier[t] ??= { total: 0, seg: 0, wa: 0, email: 0 };
    porTier[t].total++;
    if (ingest.segmentoCanonico(lead.name, lead.categoria)) porTier[t].seg++;
    if (lead.site_whatsapp) porTier[t].wa++;
    if (lead.icp.email) porTier[t].email++;
  }
  console.log("Por tier (total / com segmento / WhatsApp confirmado / e-mail):");
  for (const [t, v] of Object.entries(porTier)) console.log(`  ${t.padEnd(26)} ${v.total} / ${v.seg} / ${v.wa} / ${v.email}`);

  console.log(`\nFila${temPerfil ? " (lookalike ligado)" : ""}:`);
  for (const { lead, diag } of itens) {
    const seg = ingest.segmentoCanonico(lead.name, lead.categoria) || "-";
    const canal = lead.site_whatsapp ? "wa-confirmado" : diag.channel;
    console.log(
      `  ${String(diag.priority_score).padStart(3)} ${lead.icp.tier.charAt(0)} ${String(lead.name).slice(0, 34).padEnd(34)}` +
        ` ${canal.padEnd(19)} ${seg.padEnd(11)} ${lead.icp.setor.padEnd(10)} ${lead.icp.email || ""}`,
    );
  }

  const suspeitos = itens.filter((i) => i.lead.icp.email && CAIXA_SUSPEITA.test(i.lead.icp.email));
  if (suspeitos.length) {
    console.log("\nE-mail de caixa que talvez nao seja comercial (entra, mas revisar antes do Brevo):");
    for (const { lead } of suspeitos) console.log(`  ${lead.name}: ${lead.icp.email}`);
  }

  if (!GO) {
    console.log("\nDry-run: nada gravado no CRM. Rode com --go para importar.");
    return;
  }

  const gravadosIds = [];
  const { gravados, falhas } = await ingest.gravar(crm, itens, indice.proximoId, (id, lead) => gravadosIds.push({ id, lead }));
  console.log(`\nImportados: ${gravados}/${itens.length}`);
  for (const f of falhas.slice(0, 8)) console.log(`  FALHA ${f}`);

  // O que o leadIngest nao grava: e-mail, setor e a marca de ICP por tier.
  let patchOk = 0;
  const patchFalhas = [];
  for (const { id, lead } of gravadosIds) {
    const { icp } = lead;
    const rc = await crm(`contacts?id=eq.${id}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ email: icp.email, notes: icp.notas }),
    });
    const rd = await crm(`deals?id=eq.${id}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        setor: icp.setor,
        is_icp: true,
        icp_source: ICP_SOURCE,
        origin: SOURCE,
        origin_detail: icp.originDetail,
        description: icp.descricao,
      }),
    });
    if (rc.ok && rd.ok) patchOk++;
    else patchFalhas.push(`#${id} ${lead.name}: contacts ${rc.status} / deals ${rd.status}`);
  }
  console.log(`E-mail/setor/tier gravados: ${patchOk}/${gravadosIds.length}`);
  for (const f of patchFalhas.slice(0, 8)) console.log(`  FALHA ${f}`);
  if (gravadosIds.length) {
    const ids = gravadosIds.map((g) => g.id);
    console.log(`Ids: ${ids[0]}..${ids[ids.length - 1]}`);
  }

  console.log("\nProximo passo: node scripts/uazapi-check-numbers.mjs --go   (confirma quem atende no WhatsApp)");
  console.log('Depois:        node scripts/generate-copies-db.mjs --cidade="Joao Monlevade" --go');
  console.log("E-mail:        cd scripts/email && node build-queue-institucional.mjs --setor=industria,construcao --primeiro-toque");
  console.log("Lembrete:      rodar a varredura de duplicados e o fix de contatos depois da importacao.");
})();
