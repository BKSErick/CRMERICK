"use strict";

/**
 * leadEnrich.js - Enriquecimento best-effort por coleta de HTML (Story 017).
 * Usado SO pelo CLI (batch). Faz fetch com timeout curto, cache em disco e NUNCA derruba o run
 * (qualquer falha volta null e o lead mantem o score baseline). Analisa o HTML para: builder
 * por fingerprint, site feito por concorrente (creditos no footer), content_score industrial
 * e extracao de email. Todos sao SINAIS declarados, com origem. Fica em scripts/ (CommonJS)
 * para nao ser bundlado pelo Next nem lintado como TS.
 */

const fs = require("node:fs");
const path = require("node:path");
const { detectBuilderByUrl } = require("../../src/lib/leadScoring.js");

const CACHE_DIR = path.join(process.cwd(), ".cache", "lead-html");
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function cacheFile(url) {
  const safe = String(url).replace(/[^a-z0-9]+/gi, "_").slice(0, 120);
  return path.join(CACHE_DIR, `${safe}.html`);
}

function readCache(url) {
  try {
    const file = cacheFile(url);
    const stat = fs.statSync(file);
    if (Date.now() - stat.mtimeMs > CACHE_TTL_MS) return undefined;
    return fs.readFileSync(file, "utf8");
  } catch {
    return undefined;
  }
}

function writeCache(url, html) {
  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.writeFileSync(cacheFile(url), html, "utf8");
  } catch {
    /* cache e opcional */
  }
}

async function fetchLeadHtml(url, options = {}) {
  const timeoutMs = options.timeoutMs || 7000;
  if (!url) return null;
  let target = String(url).trim();
  if (!/^https?:\/\//i.test(target)) target = `https://${target}`;

  const cached = readCache(target);
  if (cached !== undefined) return cached || null;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(target, {
      signal: controller.signal,
      redirect: "follow",
      headers: { "User-Agent": "CRM-Erick-LeadBot/1.0 (+diagnostico de presenca digital)" },
    });
    clearTimeout(timer);
    if (!res.ok) {
      writeCache(target, "");
      return null;
    }
    const html = (await res.text()).slice(0, 250000);
    writeCache(target, html);
    return html;
  } catch {
    writeCache(target, "");
    return null;
  }
}

const BUILDER_HTML_FINGERPRINTS = [
  ["Wix", /wix\.com|parastorage|wixstatic|_wixCssStates/i],
  ["WordPress", /wp-content|wp-includes|wordpress/i],
  ["Squarespace", /squarespace|static1\.squarespace/i],
  ["Webflow", /webflow/i],
  ["Duda", /dudamobile|multiscreensite/i],
  ["GoDaddy", /godaddy|websitebuilder/i],
  ["Joomla", /joomla/i],
  ["Webnode", /webnode/i],
];

function detectBuilderFromHtml(html) {
  const generator = html.match(/<meta[^>]+name=["']generator["'][^>]+content=["']([^"']+)["']/i);
  if (generator) {
    for (const [name, re] of BUILDER_HTML_FINGERPRINTS) {
      if (re.test(generator[1])) return name;
    }
  }
  for (const [name, re] of BUILDER_HTML_FINGERPRINTS) {
    if (re.test(html)) return name;
  }
  return null;
}

const COMPETITOR_PATTERNS = [
  /desenvolvido\s+(?:e\s+hospedado\s+)?por\s*:?\s*([^<\n.|]{2,50})/i,
  /criado\s+por\s*:?\s*([^<\n.|]{2,50})/i,
  /produzido\s+por\s*:?\s*([^<\n.|]{2,50})/i,
  /site\s+by\s*:?\s*([^<\n.|]{2,50})/i,
  /powered\s+by\s*:?\s*([^<\n.|]{2,50})/i,
];

function detectCompetitor(html) {
  for (const re of COMPETITOR_PATTERNS) {
    const m = html.match(re);
    if (m) {
      const provider = m[1].replace(/<[^>]+>/g, "").replace(/&[a-z]+;/gi, " ").trim();
      // ignora auto-creditos de plataforma (Wix/WordPress) - isso e builder, nao agencia.
      if (/wix|wordpress|squarespace|godaddy|webnode/i.test(provider)) continue;
      // Preferir o link logo DEPOIS do credito (costuma ser o do fornecedor); ignorar social/wa.me.
      const after = html.slice(m.index, m.index + 250);
      const before = html.slice(Math.max(0, m.index - 120), m.index);
      const link = after.match(/href=["'](https?:\/\/[^"']+)["']/i) || before.match(/href=["'](https?:\/\/[^"']+)["']/i);
      const linkUrl = link && !/wa\.me|whatsapp|instagram\.com|facebook\.com/i.test(link[1]) ? link[1] : null;
      return { built: true, provider: provider || null, link: linkUrl };
    }
  }
  return { built: false, provider: null, link: null };
}

function computeContentScore(lead, html) {
  const signals = {
    title: /<title[^>]*>[^<]{5,}<\/title>/i.test(html),
    metaDescription: /<meta[^>]+name=["']description["'][^>]+content=["'][^"']{20,}["']/i.test(html),
    catalog: /(catalog|especifica|ficha\s+tecnica|linha\s+de\s+produtos|nossos\s+produtos)/i.test(html),
    whatsapp: /(whatsapp|wa\.me|api\.whatsapp)/i.test(html),
    email: /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i.test(html),
    https: /^https:\/\//i.test(String(lead.website || "")),
    mobileViewport: /name=["']viewport["']/i.test(html),
  };
  const score = Object.values(signals).filter(Boolean).length;
  return { score, max: Object.keys(signals).length, signals };
}

function extractEmail(html) {
  const mailto = html.match(/mailto:([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})/i);
  if (mailto) return mailto[1].toLowerCase();
  const inline = html.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i);
  if (inline) {
    const email = inline[0].toLowerCase();
    if (/\.(png|jpg|jpeg|gif|webp|svg)$/i.test(email)) return null;
    if (/(example|sentry|wixpress|godaddy|domain)\./i.test(email)) return null;
    return email;
  }
  return null;
}

// Aplica os sinais do HTML ao lead (retorna novo objeto enriquecido).
function analyzeHtml(lead, html) {
  if (!html) return lead;
  const builderUrl = detectBuilderByUrl(lead.website);
  const builderHtml = builderUrl ? null : detectBuilderFromHtml(html);
  const competitor = detectCompetitor(html);
  const content = computeContentScore(lead, html);
  const email = lead.email || extractEmail(html) || undefined;
  const builder = builderUrl || builderHtml || lead.builder || null;
  return {
    ...lead,
    builder,
    builder_source: builder ? (builderUrl ? "url" : "html") : null,
    competitor_built: competitor.built,
    competitor_provider: competitor.provider,
    competitor_link: competitor.link,
    content_score: content.score,
    content_signals: content.signals,
    email,
  };
}

module.exports = {
  CACHE_DIR,
  fetchLeadHtml,
  analyzeHtml,
  detectBuilderFromHtml,
  detectCompetitor,
  computeContentScore,
  extractEmail,
};
