/**
 * analise-comum.mjs
 * Regras compartilhadas entre lead-winning-profile.mjs, classify-conversations.mjs
 * e analise-conversas.mjs.
 *
 * Existe por um motivo especifico: a regra de segmento canonico e a de suavizacao
 * estavam DENTRO do lead-winning-profile.mjs. Assim que um segundo script precisou
 * das duas, copiar viraria divergencia silenciosa (dois relatorios discordando sobre
 * quantos leads sao "usinagem"). Aqui e a fonte unica.
 */

import fs from "node:fs";
import path from "node:path";

/** Carrega .env do repo pro process.env sem sobrescrever o que ja veio do shell. */
export function carregarEnv(raiz) {
  for (const nome of [".env", ".env.local"]) {
    const arquivo = path.join(raiz, nome);
    if (!fs.existsSync(arquivo)) continue;
    for (const linha of fs.readFileSync(arquivo, "utf8").split(/\r?\n/)) {
      const m = linha.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
}

/** Cliente REST do Supabase com service role. Range alto porque o PostgREST corta em 1000. */
export function clienteSupabase() {
  const URL = process.env.SUPABASE_URL;
  const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!URL || !KEY) throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY ausentes no .env");
  const base = { apikey: KEY, Authorization: `Bearer ${KEY}` };

  return {
    /**
     * GET paginado. O PostgREST corta a resposta em 1000 linhas por padrao e NAO
     * avisa: a requisicao volta 200 com menos dado do que existe. Esse bug ja
     * apareceu antes neste pipeline (relatorio some com lead sem dar erro), entao
     * aqui a paginacao e obrigatoria em vez de um Range grande e otimista.
     */
    async get(rota) {
      const PAGINA = 1000;
      const juncao = rota.includes("?") ? "&" : "?";
      const todos = [];
      for (let inicio = 0; ; inicio += PAGINA) {
        const r = await fetch(`${URL}/rest/v1/${rota}${juncao}limit=${PAGINA}&offset=${inicio}`, {
          headers: base,
        });
        if (!r.ok) throw new Error(`GET ${rota} -> ${r.status} ${await r.text()}`);
        const lote = await r.json();
        todos.push(...lote);
        if (lote.length < PAGINA) return todos;
      }
    },
    async patch(rota, corpo) {
      const r = await fetch(`${URL}/rest/v1/${rota}`, {
        method: "PATCH",
        headers: { ...base, "Content-Type": "application/json", Prefer: "return=minimal" },
        body: JSON.stringify(corpo),
      });
      if (!r.ok) throw new Error(`PATCH ${rota} -> ${r.status} ${await r.text()}`);
    },
  };
}

// ---------------------------------------------------------------------------
// Segmento canonico
// ---------------------------------------------------------------------------

/**
 * Boa parte dos deals tem TEXTO LIVRE no campo segment (a categoria crua do Google
 * Maps: "Caldeiraria e pecas para industria", "Trocadores de Calor"). Sao ~120
 * valores distintos com n=1, o que torna qualquer corte "por tipo de empresa"
 * inutil. Aqui o texto livre e reduzido a uma das 5 chaves canonicas.
 *
 * ORDEM IMPORTA: a lista e avaliada de cima pra baixo e o primeiro match vence.
 * "manutencao" usa radical curto e por isso vem DEPOIS de usinagem/caldeiraria —
 * senao "manutencao de tornos CNC" cairia em manutencao em vez de usinagem.
 */
const SEGMENTOS = [
  [/usinagem|torno|ferramentaria|precis[aã]o|cnc|eletroeros|fresa/i, "usinagem"],
  [/caldeiraria|estrutura|solda|metal[uú]rgic|serralheria|corte a laser|dobra|fundi/i, "caldeiraria"],
  [/automa|el[eé]tric|painel|comando|eletr[oô]nic/i, "automacao"],
  [/refrigera|climatiza|ar.condicionado|exaust/i, "climatizacao"],
  [/manuten|industrial|mec[aâ]nic|empilhadeira|hidr[aá]ulic|pneum[aá]tic/i, "manutencao"],
];

export const CANONICOS = ["usinagem", "caldeiraria", "automacao", "climatizacao", "manutencao"];
const SET_CANONICOS = new Set(CANONICOS);

/**
 * Devolve a chave canonica de um lead, ou null quando nao da pra afirmar.
 * null e resposta legitima: e melhor um balde "(sem classificacao)" honesto do que
 * empurrar o lead pro segmento errado e sujar a taxa daquele grupo.
 */
export function segmentoCanonico(segment, empresa, extra) {
  if (segment && SET_CANONICOS.has(segment)) return segment;
  const texto = `${segment || ""} ${empresa || ""} ${extra || ""}`;
  const achado = SEGMENTOS.find(([re]) => re.test(texto));
  return achado ? achado[1] : null;
}

// ---------------------------------------------------------------------------
// Quem NAO e prospect
// ---------------------------------------------------------------------------

/**
 * Linhas que existem no CRM mas nao sao prospeccao fria e por isso nao podem
 * entrar em nenhuma taxa:
 *   - clientes atuais (Jotta, Metalthec) — sao os CASES, nao alvos
 *   - o proprio Erick e contatos pessoais
 *   - socio/ex-socio e negocio a parte (Lucas)
 *   - deals orfaos "WhatsApp NNNN" criados pelo webhook quando a resposta nao
 *     achou o deal de origem. Nao sao empresa nenhuma: sao thread solta.
 *
 * Deixar qualquer um deles no relatorio inflaria a taxa de resposta com conversa
 * que ja era quente antes da abordagem existir.
 */
const NAO_PROSPECT = [
  /^\s*jotta\b/i,
  /metalthec/i,
  /^\s*erick\s+sena/i,
  /^\s*lucas\s+rodrigues/i,
  /^\s*whatsapp\s*\d+/i,
];

export function ehProspect(company, name) {
  const texto = `${company || ""} ${name || ""}`.trim();
  if (!texto) return false;
  return !NAO_PROSPECT.some((re) => re.test(company || "") || re.test(name || ""));
}

/** Deal orfao: o webhook criou a linha a partir de um numero, sem empresa. */
export function ehOrfao(company, name) {
  return /^\s*whatsapp\s*\d+/i.test(`${company || name || ""}`);
}

// ---------------------------------------------------------------------------
// Estatistica
// ---------------------------------------------------------------------------

/**
 * Taxa suavizada (media bayesiana): puxa a celula para a media geral conforme ela
 * e pequena. n=0 devolve a media geral; n grande devolve quase a taxa crua.
 *
 * Sem isso, "climatizacao converte 50%" (1 resposta em 2 leads) vira doutrina e o
 * scoring passa a priorizar ruido. O peso equivale a "quantos disparos de media
 * geral valem tanto quanto a evidencia propria da celula".
 */
export function taxaSuavizada(acertos, total, mediaGeral, peso = 12) {
  return (acertos + peso * mediaGeral) / (total + peso);
}

/**
 * Amostra minima para o relatorio ter direito de concluir algo sobre uma celula.
 * Abaixo disso o numero ate aparece, mas marcado como indicativo.
 */
export const AMOSTRA_MINIMA = 8;

/** Barra de texto pra leitura rapida no terminal. */
export function barra(fracao, largura = 18) {
  const cheio = Math.round(Math.max(0, Math.min(1, fracao)) * largura);
  return "#".repeat(cheio) + ".".repeat(largura - cheio);
}

export function pct(x) {
  return `${(x * 100).toFixed(0)}%`;
}