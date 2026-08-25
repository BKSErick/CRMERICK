/**
 * Varredura de consistencia do CRM. SOMENTE LEITURA — nao grava nada.
 *
 * Substitui os scripts de scratchpad perdidos (varredura-duplicados.mjs / fix-contatos.mjs).
 * Replica a regra de match do webhook (`phoneMatchVariants`) para achar, antes que o lead responda:
 *   - contato-sombra e correspondencia ambigua (resposta cai no card errado ou nao e gravada)
 *   - contato com telefone so formatado (webhook nao casa: nem mensagem, nem activity, nem card)
 *   - deal sem contact_id ligado
 * E, do lado operacional:
 *   - lead que respondeu mas continua em stage de fila (segue recebendo follow-up automatico)
 *   - deal abordado que nunca saiu de prospect
 *   - deal sem segmento canonico (invisivel para a fila de disparo)
 *   - deal sem telefone / sem copy
 *
 * Uso: node --env-file-if-exists=.env scripts/audit-crm-consistencia.mjs [--json-out=arquivo.json]
 */
import fs from "node:fs";
import path from "node:path";

import { createClient } from "@supabase/supabase-js";

const SEGMENTOS_CANONICOS = new Set([
  "usinagem",
  "caldeiraria",
  "manutencao",
  "automacao",
  "climatizacao",
]);

const STAGES_DE_FILA = new Set(["prospect", "abordado", "followup"]);

// Nao sao prospeccao fria: clientes, o proprio Erick, ex-socio.
const EXCLUIR_DEALS = new Set([970]);

function flagValue(name, fallback = "") {
  const item = process.argv.find((value) => value.startsWith(`--${name}=`));
  return item ? item.split("=").slice(1).join("=") : fallback;
}

function getSupabase() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY sao obrigatorios.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

// PostgREST corta em 1000 linhas sem dar erro: sempre paginar.
async function selectAll(supabase, table, columns) {
  const rows = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const result = await supabase
      .from(table)
      .select(columns)
      .order("id", { ascending: true })
      .range(from, from + pageSize - 1);
    if (result.error) throw new Error(`${table}: ${result.error.message}`);
    const page = result.data ?? [];
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}

/** Copia fiel de src/lib/whatsappPhone.ts — o webhook casa por estes valores. */
function normalizeWhatsappPhone(value) {
  const hasExplicitCountryCode = value?.trim().startsWith("+") ?? false;
  let digits = value?.replace(/\D/g, "") ?? "";
  if (!digits) return "";
  if (digits.startsWith("0") && (digits.length === 11 || digits.length === 12)) digits = digits.slice(1);
  if (!hasExplicitCountryCode && !digits.startsWith("55") && (digits.length === 10 || digits.length === 11)) {
    digits = `55${digits}`;
  }
  return digits;
}

function phoneMatchVariants(value) {
  const canonical = normalizeWhatsappPhone(value);
  if (!canonical) return [];
  if (!canonical.startsWith("55")) return [canonical];
  const national = canonical.slice(2);
  const ddd = national.slice(0, 2);
  const subscriber = national.slice(2);
  const variants = [canonical];
  if (subscriber.length === 8 && /^[6-9]/.test(subscriber)) {
    variants.push(`55${ddd}9${subscriber}`);
  } else if (subscriber.length === 9 && subscriber.startsWith("9") && /^[6-9]/.test(subscriber.slice(1))) {
    variants.push(`55${ddd}${subscriber.slice(1)}`);
  }
  return [...new Set(variants)];
}

/** Chave de agrupamento: numero sem o 9 extra, para o sombra cair no mesmo balde do lead. */
function chaveTelefone(value) {
  const variants = phoneMatchVariants(value);
  if (!variants.length) return "";
  return variants.sort((a, b) => a.length - b.length)[0];
}

function temDigitosCasaveis(value) {
  // O fallback por sufixo do webhook exige uma sequencia de 8+ digitos NO VALOR GRAVADO.
  return /\d{8,}/.test(String(value ?? ""));
}

const ehSombra = (contact) => /^whatsapp\s+\d{3,4}$/i.test(String(contact?.name ?? "").trim());

async function main() {
  const supabase = getSupabase();

  const [contacts, deals, messages, activities] = await Promise.all([
    selectAll(supabase, "contacts", "id, name, company, phone, whatsapp, email"),
    selectAll(supabase, "deals", "id, name, company, stage, segment, phone, whatsapp, contact_id, copy_text, is_prospect, value, updated_at"),
    selectAll(supabase, "messages", "id, deal_id, direction, created_at"),
    selectAll(supabase, "activities", "id, deal_id, type, created_at"),
  ]);

  const dealById = new Map(deals.map((deal) => [Number(deal.id), deal]));
  const contactById = new Map(contacts.map((contact) => [Number(contact.id), contact]));

  const relatorio = {
    geradoEm: new Date().toISOString(),
    totais: { contacts: contacts.length, deals: deals.length, messages: messages.length, activities: activities.length },
    telefone: {},
    operacional: {},
  };

  // ---------- Bloco 1: telefone / match do webhook ----------

  const porChave = new Map();
  for (const contact of contacts) {
    for (const campo of ["phone", "whatsapp"]) {
      const chave = chaveTelefone(contact[campo]);
      if (!chave) continue;
      if (!porChave.has(chave)) porChave.set(chave, new Set());
      porChave.get(chave).add(Number(contact.id));
    }
  }

  const ambiguos = [];
  for (const [chave, ids] of porChave) {
    if (ids.size < 2) continue;
    const lista = [...ids].map((id) => contactById.get(id)).filter(Boolean);
    ambiguos.push({
      telefone: chave,
      contatos: lista.map((c) => ({ id: Number(c.id), nome: c.name, empresa: c.company, phone: c.phone, whatsapp: c.whatsapp, sombra: ehSombra(c) })),
      temSombra: lista.some(ehSombra),
    });
  }
  relatorio.telefone.ambiguos = ambiguos;

  const semWhatsappCasavel = contacts.filter((contact) => {
    const whatsappOk = temDigitosCasaveis(contact.whatsapp);
    const phoneOk = temDigitosCasaveis(contact.phone);
    const temNumero = Boolean(chaveTelefone(contact.whatsapp) || chaveTelefone(contact.phone));
    return temNumero && !whatsappOk && !phoneOk;
  });
  relatorio.telefone.semValorCasavel = semWhatsappCasavel.map((c) => ({
    id: Number(c.id),
    nome: c.name,
    empresa: c.company,
    phone: c.phone,
    whatsapp: c.whatsapp,
    canonico: chaveTelefone(c.phone) || chaveTelefone(c.whatsapp),
  }));

  const contatosSombraOrfaos = contacts.filter(
    (contact) => ehSombra(contact) && ![...porChave.values()].some((ids) => ids.has(Number(contact.id)) && ids.size > 1),
  );
  relatorio.telefone.sombrasOrfas = contatosSombraOrfaos.map((c) => ({ id: Number(c.id), nome: c.name, phone: c.phone, whatsapp: c.whatsapp }));

  // Deal sem contact_id, mas com telefone que casa com um contato existente.
  const contatoPorChave = new Map();
  for (const [chave, ids] of porChave) {
    if (ids.size === 1) contatoPorChave.set(chave, [...ids][0]);
  }
  const dealsSemContato = [];
  const dealsSemTelefone = [];
  for (const deal of deals) {
    if (EXCLUIR_DEALS.has(Number(deal.id))) continue;
    const chave = chaveTelefone(deal.whatsapp) || chaveTelefone(deal.phone);
    const contatoLigado = deal.contact_id ? contactById.get(Number(deal.contact_id)) : null;
    const chaveContato = contatoLigado ? chaveTelefone(contatoLigado.whatsapp) || chaveTelefone(contatoLigado.phone) : "";
    if (!chave && !chaveContato) {
      dealsSemTelefone.push({ id: Number(deal.id), empresa: deal.company ?? deal.name, stage: deal.stage });
      continue;
    }
    if (!deal.contact_id) {
      const candidato = contatoPorChave.get(chave) ?? contatoPorChave.get(chaveContato);
      dealsSemContato.push({
        id: Number(deal.id),
        empresa: deal.company ?? deal.name,
        stage: deal.stage,
        telefone: chave,
        contatoCandidato: candidato ?? null,
      });
    }
  }
  relatorio.telefone.dealsSemContactId = dealsSemContato;
  relatorio.operacional.dealsSemTelefone = dealsSemTelefone;

  const dealsOrfaos = deals.filter((deal) => /^whatsapp\s+\d{3,4}$/i.test(String(deal.company ?? deal.name ?? "").trim()));
  relatorio.telefone.dealsOrfaos = dealsOrfaos.map((d) => ({ id: Number(d.id), empresa: d.company ?? d.name, stage: d.stage }));

  // ---------- Bloco 2: estagio / abas ----------

  const recebidasPorDeal = new Map();
  const enviadasPorDeal = new Map();
  for (const message of messages) {
    const dealId = Number(message.deal_id);
    if (!Number.isInteger(dealId)) continue;
    const alvo = message.direction === "received" ? recebidasPorDeal : enviadasPorDeal;
    const atual = alvo.get(dealId) ?? { total: 0, ultima: null };
    atual.total += 1;
    if (!atual.ultima || String(message.created_at) > atual.ultima) atual.ultima = String(message.created_at);
    alvo.set(dealId, atual);
  }

  const disparosPorDeal = new Map();
  for (const activity of activities) {
    if (!/^whatsapp_sent/.test(String(activity.type ?? ""))) continue;
    const dealId = Number(activity.deal_id);
    if (!Number.isInteger(dealId)) continue;
    const atual = disparosPorDeal.get(dealId) ?? { total: 0, ultima: null };
    atual.total += 1;
    if (!atual.ultima || String(activity.created_at) > atual.ultima) atual.ultima = String(activity.created_at);
    disparosPorDeal.set(dealId, atual);
  }

  const responderamNaFila = [];
  const abordadosAindaProspect = [];
  for (const [dealId, recebidas] of recebidasPorDeal) {
    const deal = dealById.get(dealId);
    if (!deal || EXCLUIR_DEALS.has(dealId)) continue;
    if (deal.is_prospect === false) continue;
    if (!STAGES_DE_FILA.has(String(deal.stage))) continue;
    responderamNaFila.push({
      id: dealId,
      empresa: deal.company ?? deal.name,
      stage: deal.stage,
      respostas: recebidas.total,
      ultimaResposta: recebidas.ultima,
      disparos: disparosPorDeal.get(dealId)?.total ?? 0,
    });
  }
  responderamNaFila.sort((a, b) => String(b.ultimaResposta).localeCompare(String(a.ultimaResposta)));
  relatorio.operacional.responderamMasSeguemNaFila = responderamNaFila;

  for (const [dealId, disparos] of disparosPorDeal) {
    const deal = dealById.get(dealId);
    if (!deal || EXCLUIR_DEALS.has(dealId)) continue;
    if (deal.is_prospect === false) continue;
    if (String(deal.stage) !== "prospect") continue;
    abordadosAindaProspect.push({
      id: dealId,
      empresa: deal.company ?? deal.name,
      disparos: disparos.total,
      ultimoDisparo: disparos.ultima,
      esperado: disparos.total >= 2 ? "followup" : "abordado",
    });
  }
  abordadosAindaProspect.sort((a, b) => String(b.ultimoDisparo).localeCompare(String(a.ultimoDisparo)));
  relatorio.operacional.abordadosAindaEmProspect = abordadosAindaProspect;

  const semSegmento = deals.filter(
    (deal) =>
      deal.is_prospect !== false &&
      STAGES_DE_FILA.has(String(deal.stage)) &&
      !SEGMENTOS_CANONICOS.has(String(deal.segment ?? "").trim().toLowerCase()),
  );
  relatorio.operacional.semSegmentoCanonico = semSegmento.map((d) => ({
    id: Number(d.id),
    empresa: d.company ?? d.name,
    stage: d.stage,
    segment: d.segment ?? null,
  }));

  const semCopy = deals.filter(
    (deal) =>
      deal.is_prospect !== false &&
      String(deal.stage) === "prospect" &&
      !String(deal.copy_text ?? "").trim() &&
      (chaveTelefone(deal.whatsapp) || chaveTelefone(deal.phone) || deal.contact_id),
  );
  relatorio.operacional.semCopy = semCopy.map((d) => ({ id: Number(d.id), empresa: d.company ?? d.name, segment: d.segment ?? null }));

  // ---------- Saida ----------

  const resumo = [
    ["Contatos com telefone ambiguo (resposta nao grava)", ambiguos.length],
    ["  ...destes, com contato-sombra", ambiguos.filter((item) => item.temSombra).length],
    ["Contatos sem valor casavel pelo webhook", relatorio.telefone.semValorCasavel.length],
    ["Contatos-sombra orfaos", relatorio.telefone.sombrasOrfas.length],
    ["Deals sem contact_id ligado", dealsSemContato.length],
    ["  ...destes, com contato certo ja identificado", dealsSemContato.filter((item) => item.contatoCandidato).length],
    ["Deals orfaos 'WhatsApp NNNN'", relatorio.telefone.dealsOrfaos.length],
    ["Leads que RESPONDERAM e seguem na fila", responderamNaFila.length],
    ["Deals abordados que nunca sairam de prospect", abordadosAindaProspect.length],
    ["Deals na fila sem segmento canonico (invisiveis)", semSegmento.length],
    ["Deals prospect com telefone e sem copy", semCopy.length],
    ["Deals sem telefone nenhum", dealsSemTelefone.length],
  ];

  console.log(`\nVARREDURA DE CONSISTENCIA — ${relatorio.geradoEm}`);
  console.log(`Base: ${contacts.length} contatos, ${deals.length} deals, ${messages.length} mensagens, ${activities.length} activities.\n`);
  for (const [rotulo, valor] of resumo) {
    console.log(`${String(valor).padStart(5)}  ${rotulo}`);
  }

  const detalhar = (titulo, lista, formata, limite = 25) => {
    if (!lista.length) return;
    console.log(`\n--- ${titulo} (${lista.length}) ---`);
    for (const item of lista.slice(0, limite)) console.log(`  ${formata(item)}`);
    if (lista.length > limite) console.log(`  ... e mais ${lista.length - limite}. Use --json-out para a lista completa.`);
  };

  detalhar("Telefone ambiguo", ambiguos, (item) =>
    `${item.telefone} -> ${item.contatos.map((c) => `#${c.id} ${c.nome}${c.sombra ? " (SOMBRA)" : ""}`).join(" | ")}`,
  );
  detalhar("Sem valor casavel pelo webhook", relatorio.telefone.semValorCasavel, (item) =>
    `#${item.id} ${item.empresa ?? item.nome} — phone="${item.phone}" whatsapp="${item.whatsapp}" (canonico ${item.canonico})`,
  );
  detalhar("Deals sem contact_id", dealsSemContato, (item) =>
    `#${item.id} ${item.empresa} [${item.stage}] tel=${item.telefone || "-"} contato=${item.contatoCandidato ?? "nenhum"}`,
  );
  detalhar("RESPONDERAM e seguem na fila", responderamNaFila, (item) =>
    `#${item.id} ${item.empresa} [${item.stage}] ${item.respostas} resposta(s), ultima ${String(item.ultimaResposta).slice(0, 16)}`,
  );
  detalhar("Abordados ainda em prospect", abordadosAindaProspect, (item) =>
    `#${item.id} ${item.empresa} — ${item.disparos} disparo(s), esperado "${item.esperado}"`,
  );
  detalhar("Sem segmento canonico", relatorio.operacional.semSegmentoCanonico, (item) =>
    `#${item.id} ${item.empresa} [${item.stage}] segment=${item.segment ?? "NULL"}`,
  );
  detalhar("Deals orfaos", relatorio.telefone.dealsOrfaos, (item) => `#${item.id} ${item.empresa} [${item.stage}]`);

  const jsonOut = flagValue("json-out");
  if (jsonOut) {
    const destino = path.isAbsolute(jsonOut) ? jsonOut : path.join(process.cwd(), jsonOut);
    fs.mkdirSync(path.dirname(destino), { recursive: true });
    fs.writeFileSync(destino, JSON.stringify(relatorio, null, 2) + "\n");
    console.log(`\nRelatorio completo em ${destino}`);
  }

  console.log("\nSomente leitura. Nada foi alterado.");
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
