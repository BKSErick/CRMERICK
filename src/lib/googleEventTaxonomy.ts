// Taxonomia de evento comercial da Mydrion no GA4.
//
// Esta propriedade recebe evento de varias propriedades digitais (OStrack,
// link-in-bio, paginas de diagnostico). Classificar clique por padrao amplo
// (/click|cta/) somava tudo: `click` generico, `blog_internal_link_click` e
// `ostrack_acimon_cta` entravam no mesmo balde e o numero deixava de significar
// "intencao comercial no site da Mydrion".
//
// Por isso a regra e LISTA EXPLICITA, nao padrao. Evento novo so passa a contar
// depois de ser adicionado aqui de proposito — o custo e lembrar de registrar; o
// beneficio e que o numero nunca cresce sozinho por causa de outra propriedade.

/** Cliques que significam intencao comercial no site institucional. */
export const MYDRION_CTA_EVENT_NAMES = [
  "mydrion_cta_click",
  "organic_cta_click",
  "blog_cta_click",
] as const;

/** Eventos que marcam lead entregue. */
export const MYDRION_LEAD_EVENT_NAMES = ["generate_lead"] as const;

// A propriedade recebe o MESMO evento em PascalCase e snake_case, entao a
// comparacao ignora separador e caixa.
const chave = (name: string) => String(name || "").replace(/[^a-z0-9]/gi, "").toLowerCase();

const CTA = new Set(MYDRION_CTA_EVENT_NAMES.map(chave));
const LEAD = new Set(MYDRION_LEAD_EVENT_NAMES.map(chave));

export function isMydrionCtaEvent(eventName: string): boolean {
  return CTA.has(chave(eventName));
}

export function isMydrionLeadEvent(eventName: string): boolean {
  return LEAD.has(chave(eventName));
}
