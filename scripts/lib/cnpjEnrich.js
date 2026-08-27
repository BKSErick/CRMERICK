"use strict";

/**
 * cnpjEnrich.js - Enriquecimento por CNPJ e consulta à MinhaReceita API.
 * 
 * Funcionalidades:
 * 1. Extrai CNPJ do HTML raspado do site (rodapé/contato) com verificação de dígito verificador.
 * 2. Realiza busca de fallback via Serper Search quando o site não divulga o CNPJ.
 * 3. Consulta a API pública MinhaReceita (minhareceita.org) para obter:
 *    - Capital Social & Porte (MEI, ME, EPP, DEMAIS)
 *    - Situação Cadastral (ATIVA, INAPTA, BAIXADA, SUSPENSA)
 *    - CNAE Principal
 *    - Telefones Oficiais da Receita Federal (para suprir números ausentes do Maps)
 * 4. Cache em disco em .cache/cnpj-json/ com TTL de 30 dias.
 */

const fs = require("node:fs");
const path = require("node:path");

const CACHE_DIR = path.join(process.cwd(), ".cache", "cnpj-json");
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 dias

function digitos(v) {
  return String(v || "").replace(/\D/g, "");
}

// Algoritmo oficial de validação de dígito verificador do CNPJ
function validarCnpj(valor) {
  const cnpj = digitos(valor);
  if (cnpj.length !== 14 || /^(\d)\1+$/.test(cnpj)) return false;

  let tamanho = cnpj.length - 2;
  let numeros = cnpj.substring(0, tamanho);
  const digitosCnpj = cnpj.substring(tamanho);
  let soma = 0;
  let pos = tamanho - 7;

  for (let i = tamanho; i >= 1; i--) {
    soma += Number(numeros.charAt(tamanho - i)) * pos--;
    if (pos < 2) pos = 9;
  }
  let resultado = soma % 11 < 2 ? 0 : 11 - (soma % 11);
  if (resultado !== Number(digitosCnpj.charAt(0))) return false;

  tamanho = tamanho + 1;
  numeros = cnpj.substring(0, tamanho);
  soma = 0;
  pos = tamanho - 7;
  for (let i = tamanho; i >= 1; i--) {
    soma += Number(numeros.charAt(tamanho - i)) * pos--;
    if (pos < 2) pos = 9;
  }
  resultado = soma % 11 < 2 ? 0 : 11 - (soma % 11);
  return resultado === Number(digitosCnpj.charAt(1));
}

function formatarCnpj(cnpj) {
  const c = digitos(cnpj);
  if (c.length !== 14) return cnpj;
  return `${c.slice(0, 2)}.${c.slice(2, 5)}.${c.slice(5, 8)}/${c.slice(8, 12)}-${c.slice(12, 14)}`;
}

function extractCnpjsFromText(text) {
  if (!text) return [];
  const regex = /\b(\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2})\b/g;
  const matches = text.match(regex) || [];
  const validos = new Set();
  for (const m of matches) {
    const limpo = digitos(m);
    if (validarCnpj(limpo)) validos.add(limpo);
  }
  return Array.from(validos);
}

function readCache(cnpj) {
  try {
    const file = path.join(CACHE_DIR, `${digitos(cnpj)}.json`);
    const stat = fs.statSync(file);
    if (Date.now() - stat.mtimeMs > CACHE_TTL_MS) return undefined;
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return undefined;
  }
}

function writeCache(cnpj, data) {
  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.writeFileSync(path.join(CACHE_DIR, `${digitos(cnpj)}.json`), JSON.stringify(data), "utf8");
  } catch {
    /* cache opcional */
  }
}

// Normaliza o texto de porte da Receita Federal
function normalizarPorte(porteRaw, capitalSocial) {
  const p = String(porteRaw || "").toUpperCase();
  if (p.includes("MEI") || p === "01") return "MEI";
  if (p.includes("MICRO") || p.includes("ME") || p === "03") return "ME";
  if (p.includes("PEQUENO") || p.includes("EPP") || p === "05") return "EPP";
  
  // Fallback baseado no Capital Social se o porte vier genérico "00" (Demais)
  const cap = Number(capitalSocial || 0);
  if (cap > 0 && cap <= 81000) return "MEI";
  if (cap > 81000 && cap <= 360000) return "ME";
  if (cap > 360000 && cap <= 4800000) return "EPP";
  if (cap > 4800000) return "DEMAIS";
  
  return "DEMAIS";
}

async function fetchCnpjMinhaReceita(cnpjLimpo, timeoutMs = 5000) {
  const cnpj = digitos(cnpjLimpo);
  if (!validarCnpj(cnpj)) return null;

  const cached = readCache(cnpj);
  if (cached !== undefined) return cached;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    // Tenta MinhaReceita API
    let res = await fetch(`https://minhareceita.org/${cnpj}`, { signal: controller.signal }).catch(() => null);
    
    // Fallback para BrasilAPI se a MinhaReceita estiver instável
    if (!res || !res.ok) {
      res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`, { signal: controller.signal }).catch(() => null);
    }
    clearTimeout(timer);

    if (!res || !res.ok) {
      writeCache(cnpj, null);
      return null;
    }

    const payload = await res.json();
    if (!payload || payload.message) {
      writeCache(cnpj, null);
      return null;
    }

    // Processa os números de telefone da Receita
    const phones = [];
    const pushPhone = (ddd, num) => {
      const d = digitos(`${ddd || ""}${num || ""}`);
      if (d.length >= 10 && d.length <= 11 && !phones.includes(`55${d}`)) {
        phones.push(`55${d}`);
      }
    };
    if (payload.ddd_telefone_1) pushPhone(payload.ddd_1, payload.ddd_telefone_1);
    if (payload.ddd_telefone_2) pushPhone(payload.ddd_2, payload.ddd_telefone_2);
    if (payload.ddd_fax) pushPhone(payload.ddd_fax_1, payload.ddd_fax);
    if (payload.telefone_1) pushPhone("", payload.telefone_1);

    const data = {
      cnpj: formatarCnpj(cnpj),
      cnpj_limpo: cnpj,
      razao_social: payload.razao_social || payload.social_reason || null,
      nome_fantasia: payload.nome_fantasia || payload.commercial_name || null,
      situacao_cadastral: String(payload.descricao_situacao_cadastral || payload.situacao_cadastral || "ATIVA").toUpperCase(),
      capital_social: Number(payload.capital_social || 0),
      porte: normalizarPorte(payload.porte || payload.descricao_porte, payload.capital_social),
      cnae_principal: payload.cnae_fiscal ? String(payload.cnae_fiscal) : (payload.cnae_principal_codigo ? String(payload.cnae_principal_codigo) : null),
      cnae_descricao: payload.cnae_fiscal_descricao || payload.cnae_principal_descricao || null,
      receita_phones: phones,
      email_receita: payload.email ? String(payload.email).toLowerCase() : null,
    };

    writeCache(cnpj, data);
    return data;
  } catch {
    writeCache(cnpj, null);
    return null;
  }
}

// Fallback via Serper Search: busca o CNPJ da empresa no Google se o site não tiver
async function searchCnpjViaSerper(companyName, city, uf, serperClient) {
  if (!serperClient || !companyName) return null;
  try {
    const q = `"${companyName}" "${city || ""}" CNPJ`;
    const res = await serperClient.search({ q, num: 3 });
    const organic = res.organic || [];
    for (const item of organic) {
      const text = `${item.title || ""} ${item.snippet || ""}`;
      const cnpjs = extractCnpjsFromText(text);
      if (cnpjs.length > 0) {
        const dados = await fetchCnpjMinhaReceita(cnpjs[0]);
        if (dados) return dados;
      }
    }
  } catch {
    /* fallback sem erro */
  }
  return null;
}

module.exports = {
  validarCnpj,
  formatarCnpj,
  extractCnpjsFromText,
  fetchCnpjMinhaReceita,
  searchCnpjViaSerper,
  normalizarPorte,
};
