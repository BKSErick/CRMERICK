"use strict";

/**
 * leadIngest.js - Entrada de lead no CRM, compartilhada pelas duas fontes:
 *   scripts/pull-city-serper.mjs      puxa direto do Google Maps (Serper)
 *   scripts/import-garimpo-leads.mjs  traz o que o Garimpo ja puxou
 *
 * Tudo que o lead precisa atravessar antes de virar card fica aqui: cidade, segmento,
 * deduplicacao, enriquecimento pelo site e gravacao. Duas fontes com regras diferentes
 * era como a base ficava torta (segmento em texto livre, numero do site perdido).
 */

const fs = require("node:fs");
const path = require("node:path");
const { diagnoseLead, normalize } = require("../../src/lib/leadScoring.js");
const { fetchLeadHtml, analyzeHtml } = require("./leadEnrich.js");

const RAIZ = path.resolve(__dirname, "..", "..");

// --- Cidade ----------------------------------------------------------------
// Endereco do Maps: "R. Nadir, 47 - Gopouva, Guarulhos - SP, 07020-201, Brasil".
// A cidade e o pedaco antes do " - UF". Sem isso o CRM so agrupava por DDD, e o 31
// mistura BH, Vale do Aco e Joao Monlevade num balde so.
function cidadeUf(endereco) {
  const s = String(endereco || "");
  const m = s.match(/,\s*([^,]+?)\s*-\s*([A-Z]{2})\b/);
  if (m) return { city: m[1].trim(), uf: m[2] };
  const m2 = s.match(/([^,-]+?)\s*-\s*([A-Z]{2})\s*,\s*\d{5}-?\d{3}/);
  if (m2) return { city: m2[1].trim(), uf: m2[2] };
  return { city: null, uf: null };
}

// --- Segmento --------------------------------------------------------------
// Sem chave canonica o lead entra no CRM mas fica invisivel para uazapi-send-batch,
// que filtra a fila por segmento.
// ATENCAO ao plural: "manuten[cç][aã]o" casava "manutenção" e perdia "manutenções",
// que e como metade das empresas se chama. Por isso os radicais ficam curtos.
const SEGMENTOS = [
  [/usinagem|tornearia|torno|ferramentaria|precis[aã]|cnc/i, "usinagem"],
  [/caldeiraria|solda|metal[uú]rgic|metalurgia|serralheria|estrutura met/i, "caldeiraria"],
  [/manuten|mec[aâ]nic|industrial/i, "manutencao"],
  [/automa|el[eé]tric|painel el|comando el/i, "automacao"],
  [/refrigera|climatiza|ar.condicionado|exaust/i, "climatizacao"],
];

function segmentoCanonico(...textos) {
  const t = textos.filter(Boolean).join(" ");
  const achado = SEGMENTOS.find(([re]) => re.test(t));
  return achado ? achado[1] : null;
}

// --- Quem nunca deve ser prospectado ---------------------------------------
// Cliente e case do Erick nao pode voltar para a fila fria. Na primeira puxada de
// Joao Monlevade os dois unicos leads "novos" eram Jotta e Metalthec, que sao
// clientes dele. Editavel em data/nao-prospectar.json.
const NAO_PROSPECTAR_PADRAO = ["jotta", "metalthec", "ostrack", "backstage", "bks grow", "synkra"];

function carregarNaoProspectar() {
  const arquivo = path.join(RAIZ, "data", "nao-prospectar.json");
  try {
    const lista = JSON.parse(fs.readFileSync(arquivo, "utf8"));
    if (Array.isArray(lista)) return lista.map((x) => normalize(x)).filter(Boolean);
  } catch {
    /* usa o padrao */
  }
  return NAO_PROSPECTAR_PADRAO.map(normalize);
}

function ehProibido(nome, lista) {
  const n = normalize(nome);
  return lista.some((termo) => n.includes(termo));
}

const digitos = (v) => String(v || "").replace(/\D/g, "").replace(/^55/, "");

// Dominios que NAO identificam a empresa: varios leads apontam o "site" para a mesma
// rede social ou encurtador. Usar isso como chave de dedupe fazia lead novo ser
// descartado por "ja existe" (7 de 8 na primeira puxada de Joao Monlevade).
const DOMINIOS_GENERICOS = new Set([
  "facebook.com", "m.facebook.com", "instagram.com", "linktr.ee", "linktree.com",
  "wa.me", "api.whatsapp.com", "bit.ly", "google.com", "sites.google.com",
  "business.site", "negocio.site", "youtube.com", "linkedin.com",
]);

function dominio(url) {
  // Sem esta guarda, new URL("https://null") e valido e devolve o host "null": todo lead
  // sem site passava a colidir com todo deal sem site (87 descartes falsos numa puxada).
  if (!url || typeof url !== "string" || !url.trim()) return null;
  try {
    const host = new URL(/^https?:/i.test(url) ? url : `https://${url}`).hostname.replace(/^www\./, "").toLowerCase();
    if (DOMINIOS_GENERICOS.has(host)) return null;
    // Subdominio de plataforma (loja.business.site) tambem nao identifica empresa unica.
    if (/\.(business\.site|negocio\.site|wixsite\.com|godaddysites\.com)$/.test(host)) return null;
    return host;
  } catch {
    return null;
  }
}

// --- Cliente REST do CRM ---------------------------------------------------
function crmClient(url, key) {
  return (rota, init = {}) =>
    fetch(`${url}/rest/v1/${rota}`, {
      ...init,
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...(init.headers || {}) },
    });
}

// PostgREST devolve no maximo 1000 linhas por resposta, mesmo com Range largo. A
// primeira versao pediu "0-9999" e perdeu 214 leads em silencio. Aqui pagina de verdade.
async function buscarTudo(cliente, rota, passo = 1000) {
  const todos = [];
  for (let de = 0; ; de += passo) {
    const r = await cliente(rota, { headers: { Range: `${de}-${de + passo - 1}` } });
    const lote = await r.json();
    if (!Array.isArray(lote)) throw new Error(`Resposta inesperada em ${rota}: ${JSON.stringify(lote).slice(0, 160)}`);
    todos.push(...lote);
    if (lote.length < passo) break;
  }
  return todos;
}

// --- Deduplicacao ----------------------------------------------------------
// Ordem: cid do Maps (chave estavel), nome, telefone, dominio. Nome e telefone mudam
// de grafia entre puxadas; o cid nao.
async function montarIndiceDedupe(crm) {
  const [contatos, deals] = await Promise.all([
    buscarTudo(crm, "contacts?select=id,name,company,phone,whatsapp_site,maps_cid,status"),
    buscarTudo(crm, "deals?select=id,company,site_url"),
  ]);
  return {
    contatos,
    deals,
    cid: new Set(contatos.map((c) => c.maps_cid).filter(Boolean)),
    nome: new Set(contatos.map((c) => normalize(c.company || c.name)).filter(Boolean)),
    fone: new Set(contatos.flatMap((c) => [digitos(c.phone), digitos(c.whatsapp_site)]).filter((x) => x.length >= 10)),
    dominio: new Set(deals.map((d) => dominio(d.site_url)).filter(Boolean)),
    // Cliente ativo nunca volta para a fila fria.
    clientes: new Set(contatos.filter((c) => c.status === "client").map((c) => normalize(c.company || c.name))),
    proximoId: Math.max(0, ...contatos.map((c) => c.id), ...deals.map((d) => d.id)) + 1,
  };
}

function filtrarNovos(candidatos, indice, limite = Infinity) {
  const proibidos = carregarNaoProspectar();
  const vistos = { cid: new Set(), nome: new Set(), fone: new Set() };
  const motivos = { cid: 0, nome: 0, fone: 0, dominio: 0, cliente: 0, proibido: 0 };
  const novos = [];

  for (const l of candidatos) {
    if (novos.length >= limite) break;
    const nome = normalize(l.name);
    const fone = digitos(l.phone);
    const dom = dominio(l.website);

    if (ehProibido(l.name, proibidos)) { motivos.proibido++; continue; }
    if (indice.clientes.has(nome)) { motivos.cliente++; continue; }
    if (l.maps_cid && (indice.cid.has(l.maps_cid) || vistos.cid.has(l.maps_cid))) { motivos.cid++; continue; }
    if (indice.nome.has(nome) || vistos.nome.has(nome)) { motivos.nome++; continue; }
    if (fone.length >= 10 && (indice.fone.has(fone) || vistos.fone.has(fone))) { motivos.fone++; continue; }
    if (dom && indice.dominio.has(dom)) { motivos.dominio++; continue; }

    if (l.maps_cid) vistos.cid.add(l.maps_cid);
    vistos.nome.add(nome);
    if (fone.length >= 10) vistos.fone.add(fone);
    novos.push(l);
  }
  return { novos, motivos };
}

// --- Enriquecimento --------------------------------------------------------
// Visita o site atras do WhatsApp que a empresa publica. Roda DEPOIS do dedupe:
// enriquecer antes gastaria fetch em lead que ja esta na base.
async function enriquecer(leads, paralelo = 5) {
  const comSite = leads.filter((l) => l.website);
  for (let i = 0; i < comSite.length; i += paralelo) {
    await Promise.all(
      comSite.slice(i, i + paralelo).map(async (l) => {
        const html = await fetchLeadHtml(l.website).catch(() => null);
        if (html) Object.assign(l, analyzeHtml(l, html));
      }),
    );
  }
  return { visitados: comSite.length, comWhatsapp: comSite.filter((l) => l.site_whatsapp).length };
}

function perfilVencedor() {
  try {
    return JSON.parse(fs.readFileSync(path.join(RAIZ, "data", "winning-profile.json"), "utf8"));
  } catch {
    return null;
  }
}

function pontuar(leads) {
  const perfil = perfilVencedor();
  const itens = leads.map((lead) => ({ lead, diag: diagnoseLead(lead, perfil) }));
  itens.sort((a, b) => b.diag.priority_score - a.diag.priority_score);
  return { itens, temPerfil: Boolean(perfil) };
}

// --- Gravacao --------------------------------------------------------------
// contacts.id e deals.id sao o MESMO numero para o mesmo lead: as telas e os scripts de
// disparo cruzam as tabelas por id, sem foreign key. Por isso o id e alocado na mao.
async function gravar(crm, itens, proximoId, aoGravar) {
  let id = proximoId;
  let gravados = 0;
  const falhas = [];

  for (const { lead, diag } of itens) {
    const meuId = id++;
    const nome = String(lead.name).slice(0, 120);
    const iniciais = nome.split(/\s+/).slice(0, 2).map((p) => p[0] || "").join("").toUpperCase() || "?";

    const rc = await crm("contacts", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        id: meuId,
        name: nome,
        company: nome,
        phone: lead.phone || "—",
        status: "lead",
        initials: iniciais,
        city: lead.city,
        uf: lead.uf,
        address: lead.address,
        rating: lead.rating,
        reviews_count: Number(lead.reviews_count || 0),
        maps_cid: lead.maps_cid,
        lat: lead.lat,
        lng: lead.lng,
        source: lead.source || "serper_maps",
        whatsapp_site: lead.site_whatsapp || null,
        site_url: lead.website || null,
      }),
    });
    if (!rc.ok) {
      falhas.push(`contact #${meuId} ${nome}: ${rc.status} ${(await rc.text()).slice(0, 110)}`);
      continue;
    }

    const rd = await crm("deals", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        id: meuId,
        name: nome,
        company: nome,
        segment: segmentoCanonico(lead.name, lead.categoria),
        stage: "prospect",
        status: "open",
        phone: lead.phone || null,
        site_url: lead.website || null,
        points: diag.priority_score,
      }),
    });
    if (!rd.ok) {
      falhas.push(`deal #${meuId} ${nome}: ${rd.status} ${(await rd.text()).slice(0, 110)}`);
      continue;
    }
    gravados++;
    if (aoGravar) aoGravar(meuId, lead, diag);
  }
  return { gravados, falhas };
}

module.exports = {
  cidadeUf,
  segmentoCanonico,
  carregarNaoProspectar,
  ehProibido,
  digitos,
  dominio,
  crmClient,
  buscarTudo,
  montarIndiceDedupe,
  filtrarNovos,
  enriquecer,
  perfilVencedor,
  pontuar,
  gravar,
};