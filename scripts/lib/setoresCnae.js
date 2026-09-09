"use strict";

/**
 * setoresCnae.js - Classificação de lead por CNAE da Receita Federal.
 *
 * Existe porque a descoberta (Serper/Maps) acha empresa por PALAVRA, e palavra mente:
 * "Imagem X" pode ser gráfica ou clínica de radiologia. O CNAE não mente, e ele só chega
 * depois do enriquecimento por CNPJ. Então o filtro de setor roda DEPOIS do enriquecimento.
 *
 * Os segmentos industriais espelham os canônicos já usados na fila de disparo
 * (usinagem/caldeiraria/manutencao/automacao/climatizacao). Saúde entrou em 08/09/2026,
 * quando o ICP passou a incluir clínicas e diagnóstico.
 *
 * Prefixos batem contra o CNAE de 7 dígitos sem pontuação (ex.: 2539001, 8640205).
 */

const SETORES = {
  saude: {
    label: "Saúde",
    prefixos: [
      "8610", // hospitais
      "8621", // UTI móvel e atendimento de urgência
      "8622",
      "8630", // atendimento ambulatorial, consultórios médicos e odontológicos
      "8640", // complementação diagnóstica e terapêutica (laboratório, imagem, radiologia)
      "8650", // profissionais da área de saúde (fisio, nutrição, psicologia)
      "8660", // apoio à gestão de saúde
      "8690", // outras atividades de atenção à saúde
      "8711", // atendimento em residências assistenciais
      "8712",
    ],
  },
  industria: {
    label: "Indústria",
    prefixos: [
      "24", // metalurgia
      "25", // produtos de metal (usinagem, caldeiraria, estruturas)
      "26", // equipamentos de informática e eletrônicos
      "27", // máquinas e materiais elétricos
      "28", // máquinas e equipamentos
      "29", // veículos automotores
      "30",
      "31",
      "32",
      "33", // manutenção, reparação e instalação de máquinas
      "22", // borracha e plástico
      "23", // minerais não metálicos (cerâmica, concreto)
    ],
  },
  climatizacao: {
    label: "Climatização e refrigeração",
    prefixos: [
      "4322", // instalação e manutenção de sistemas de ar condicionado e refrigeração
      "3314707", // manutenção de máquinas e aparelhos de refrigeração e ventilação
      "4753", // comércio de eletrodomésticos (revenda de ar condicionado)
    ],
  },
  construcao: {
    label: "Construção e engenharia",
    prefixos: ["41", "42", "43", "711"],
  },
};

// Segmentos industriais finos, para quando o CNAE permite ser mais específico que "indústria".
const SUBSEGMENTOS = {
  usinagem: ["2539", "2599", "2543"],
  caldeiraria: ["2511", "2512", "2513", "2532"],
  manutencao: ["3314", "3311", "3312", "3313", "3319", "3321"],
  automacao: ["2651", "2712", "2790", "3321", "2610"],
};

function limparCnae(cnae) {
  return String(cnae || "").replace(/\D/g, "");
}

function casaPrefixo(cnae, prefixos) {
  const c = limparCnae(cnae);
  if (!c) return false;
  return prefixos.some((p) => c.startsWith(p));
}

/** Devolve a chave do setor (saude, industria, climatizacao, construcao) ou null. */
function setorDeCnae(cnae) {
  const c = limparCnae(cnae);
  if (!c) return null;
  // Climatização antes de indústria: 3314707 casaria com "33" e viraria indústria genérica.
  for (const chave of ["saude", "climatizacao", "construcao", "industria"]) {
    if (casaPrefixo(c, SETORES[chave].prefixos)) return chave;
  }
  return null;
}

/** Subsegmento industrial fino (usinagem, caldeiraria, manutencao, automacao) ou null. */
function subsegmentoDeCnae(cnae) {
  const c = limparCnae(cnae);
  if (!c) return null;
  for (const [chave, prefixos] of Object.entries(SUBSEGMENTOS)) {
    if (casaPrefixo(c, prefixos)) return chave;
  }
  return null;
}

/** Aceita "saude", "industria", "saude,industria" ou vazio (tudo passa). */
function filtroDeSetores(expressao) {
  const chaves = String(expressao || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (chaves.length === 0) return () => true;
  const desconhecidos = chaves.filter((k) => !SETORES[k]);
  if (desconhecidos.length > 0) {
    throw new Error(`Setor desconhecido: ${desconhecidos.join(", ")}. Válidos: ${Object.keys(SETORES).join(", ")}`);
  }
  return (cnae) => {
    const setor = setorDeCnae(cnae);
    return setor !== null && chaves.includes(setor);
  };
}

module.exports = { SETORES, SUBSEGMENTOS, setorDeCnae, subsegmentoDeCnae, filtroDeSetores, limparCnae };
