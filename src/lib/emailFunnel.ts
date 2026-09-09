// Agregacao do funil de e-mail frio: transforma envios (activities email_sent) +
// eventos do Brevo (/v3/smtp/statistics/events) em metricas, Pareto e serie diaria.
//
// Funcoes puras de proposito: a rota busca os dados, isto aqui so conta. Assim o
// calculo e testavel sem rede e a mesma logica serve para o script de CLI.
//
// LIMITE CONHECIDO DA ABERTURA: "aberto" vem de pixel de imagem. Quem bloqueia
// imagem nunca conta, e o proxy do Gmail as vezes conta abertura que nao houve.
// Por isso `opened` e piso, nao verdade, e `openedByProxy` fica separado. Bounce,
// spam e clique sao exatos — esses decidem se a rampa do dominio pode subir.

// Relativo com extensao porque esta lib roda tambem sob `node --test`, que nao
// resolve o alias "@/" (nao passa pelo bundler do Next).
import { matchesSearch } from "./tablePaging.ts";

export type BrevoEvent = {
  email: string;
  event: string;
  date?: string | null;
  link?: string | null;
  reason?: string | null;
};

export type EmailSendRecord = {
  email: string;
  company: string;
  dealId: number | null;
  sentAt: string;
};

export type ButtonKind = "whatsapp" | "site" | "descadastro" | "outro";

export type RecipientRow = {
  email: string;
  company: string;
  dealId: number | null;
  sentAt: string;
  delivered: boolean;
  opened: boolean;
  openedByProxy: boolean;
  clicked: boolean;
  replied: boolean;
  problem: string | null;
  buttons: ButtonKind[];
  status: string;
};

export type ParetoSlice = {
  label: string;
  value: number;
  share: number;
  cumulative: number;
  hint: string;
};

export type EmailFunnelReport = {
  counts: {
    sent: number;
    delivered: number;
    opened: number;
    openedByProxy: number;
    clicked: number;
    replied: number;
    notOpened: number;
    hardBounce: number;
    softBounce: number;
    spam: number;
    blocked: number;
    unsubscribed: number;
  };
  rates: {
    delivery: number;
    open: number;
    click: number;
    clickToOpen: number;
    reply: number;
    bounce: number;
    spam: number;
  };
  buttons: { kind: ButtonKind; label: string; clicks: number }[];
  pareto: ParetoSlice[];
  daily: { day: string; sent: number; delivered: number; opened: number; clicked: number }[];
  recipients: RecipientRow[];
  health: { level: "ok" | "atencao" | "critico"; message: string };
};

// Nomes de evento do Brevo. A API mistura plural e camelCase conforme o endpoint,
// entao normalizamos tudo antes de comparar.
const EVENT_ALIASES: Record<string, string> = {
  delivered: "delivered",
  opened: "opened",
  uniqueopened: "opened",
  loadedbyproxy: "proxy",
  click: "click",
  clicks: "click",
  hardbounces: "hard_bounce",
  hard_bounce: "hard_bounce",
  softbounces: "soft_bounce",
  soft_bounce: "soft_bounce",
  bounces: "soft_bounce",
  deferred: "deferred",
  spam: "spam",
  complaint: "spam",
  blocked: "blocked",
  invalid: "blocked",
  error: "blocked",
  unsubscribed: "unsubscribed",
  requests: "requests",
};

export function normalizeEvent(raw: string): string {
  return EVENT_ALIASES[String(raw || "").trim().toLowerCase().replace(/[\s-]/g, "")] ?? "";
}

// Prioridade proposital: problema de entrega vence engajamento. Se um endereco
// quicou E abriu, o que decide a reputacao do dominio e que ele quicou.
const PROBLEM_ORDER: { key: string; label: string }[] = [
  { key: "spam", label: "Spam" },
  { key: "hard_bounce", label: "Hard bounce" },
  { key: "blocked", label: "Bloqueado" },
  { key: "unsubscribed", label: "Descadastrou" },
  { key: "soft_bounce", label: "Soft bounce" },
  { key: "deferred", label: "Adiado" },
];

export function classifyButton(link: string | null | undefined): ButtonKind {
  const url = String(link || "").toLowerCase();
  if (!url) return "outro";
  if (/wa\.me|whatsapp|api\.whatsapp/.test(url)) return "whatsapp";
  if (/unsubscribe|descadastr|optout|opt-out/.test(url)) return "descadastro";
  if (/mydrion/.test(url)) return "site";
  return "outro";
}

const BUTTON_LABELS: Record<ButtonKind, string> = {
  whatsapp: "Falar no WhatsApp",
  site: "Conheca a Mydrion",
  descadastro: "Descadastrar",
  outro: "Outro link",
};

const pct = (part: number, whole: number) => (whole > 0 ? (part / whole) * 100 : 0);

export function buildEmailFunnel(
  sends: EmailSendRecord[],
  events: BrevoEvent[],
  repliedEmails: string[] = [],
): EmailFunnelReport {
  const byEmail = new Map<string, BrevoEvent[]>();
  for (const event of events) {
    const key = String(event.email || "").trim().toLowerCase();
    if (!key) continue;
    const bucket = byEmail.get(key);
    if (bucket) bucket.push(event);
    else byEmail.set(key, [event]);
  }

  const replied = new Set(repliedEmails.map((e) => String(e || "").trim().toLowerCase()).filter(Boolean));

  const recipients: RecipientRow[] = sends.map((send) => {
    const own = byEmail.get(send.email) ?? [];
    const kinds = new Set(own.map((e) => normalizeEvent(e.event)).filter(Boolean));
    const problemKey = PROBLEM_ORDER.find((p) => kinds.has(p.key));
    const buttons = [
      ...new Set(
        own
          .filter((e) => normalizeEvent(e.event) === "click")
          .map((e) => classifyButton(e.link)),
      ),
    ];

    const delivered = kinds.has("delivered");
    const opened = kinds.has("opened");
    const openedByProxy = !opened && kinds.has("proxy");
    const clicked = kinds.has("click");
    const hasReplied = replied.has(send.email);

    const status = problemKey
      ? problemKey.label
      : hasReplied
        ? "Respondeu"
        : clicked
          ? "Clicou"
          : opened
            ? "Abriu"
            : openedByProxy
              ? "Abriu? (proxy)"
              : delivered
                ? "Entregue"
                : own.length
                  ? "Em transito"
                  : "Sem evento";

    return {
      email: send.email,
      company: send.company,
      dealId: send.dealId,
      sentAt: send.sentAt,
      delivered,
      opened,
      openedByProxy,
      clicked,
      replied: hasReplied,
      problem: problemKey?.label ?? null,
      buttons,
      status,
    };
  });

  const has = (fn: (r: RecipientRow) => boolean) => recipients.filter(fn).length;
  const counts = {
    sent: recipients.length,
    delivered: has((r) => r.delivered),
    opened: has((r) => r.opened || r.openedByProxy),
    openedByProxy: has((r) => r.openedByProxy),
    clicked: has((r) => r.clicked),
    replied: has((r) => r.replied),
    notOpened: has((r) => r.delivered && !r.opened && !r.openedByProxy),
    hardBounce: has((r) => r.problem === "Hard bounce"),
    softBounce: has((r) => r.problem === "Soft bounce"),
    spam: has((r) => r.problem === "Spam"),
    blocked: has((r) => r.problem === "Bloqueado"),
    unsubscribed: has((r) => r.problem === "Descadastrou"),
  };

  const rates = {
    delivery: pct(counts.delivered, counts.sent),
    open: pct(counts.opened, counts.delivered),
    click: pct(counts.clicked, counts.delivered),
    clickToOpen: pct(counts.clicked, counts.opened),
    reply: pct(counts.replied, counts.delivered),
    bounce: pct(counts.hardBounce + counts.softBounce, counts.sent),
    spam: pct(counts.spam, counts.sent),
  };

  // Cliques por botao: o clique so vira acao quando se sabe QUAL botao. WhatsApp e
  // pedido de contato; site e curiosidade. Somar os dois num numero so perde isso.
  const buttonCounts = new Map<ButtonKind, number>();
  for (const r of recipients) {
    for (const kind of r.buttons) buttonCounts.set(kind, (buttonCounts.get(kind) ?? 0) + 1);
  }
  const buttons = (["whatsapp", "site", "descadastro", "outro"] as ButtonKind[])
    .map((kind) => ({ kind, label: BUTTON_LABELS[kind], clicks: buttonCounts.get(kind) ?? 0 }))
    .filter((b) => b.clicks > 0 || b.kind === "whatsapp" || b.kind === "site");

  // PARETO das PERDAS: onde o funil derrete, do maior para o menor, com acumulado.
  // Responde "o que eu conserto primeiro" em vez de "quanto abriu".
  const losses = [
    { label: "Nao abriu", value: counts.notOpened, hint: "Entregou e nao abriu: problema de assunto e remetente." },
    { label: "Abriu e nao clicou", value: Math.max(0, counts.opened - counts.clicked), hint: "Leu e nao agiu: problema de oferta e CTA." },
    { label: "Clicou e nao respondeu", value: Math.max(0, counts.clicked - counts.replied), hint: "Agiu e parou: problema de follow-up." },
    { label: "Hard bounce", value: counts.hardBounce, hint: "Endereco morto: limpar da base antes de escalar." },
    { label: "Spam", value: counts.spam, hint: "Marcou como spam: risco direto de queimar o dominio." },
    { label: "Soft bounce", value: counts.softBounce, hint: "Falha temporaria: da para tentar de novo depois." },
    { label: "Bloqueado", value: counts.blocked, hint: "Provedor recusou a entrega." },
  ].filter((l) => l.value > 0);

  const totalLoss = losses.reduce((acc, l) => acc + l.value, 0);
  losses.sort((a, b) => b.value - a.value);
  let running = 0;
  const pareto: ParetoSlice[] = losses.map((l) => {
    running += l.value;
    return { ...l, share: pct(l.value, totalLoss), cumulative: pct(running, totalLoss) };
  });

  // Serie diaria: a rampa do dominio so faz sentido olhada dia a dia.
  const dayMap = new Map<string, { day: string; sent: number; delivered: number; opened: number; clicked: number }>();
  for (const r of recipients) {
    const day = String(r.sentAt || "").slice(0, 10);
    if (!day) continue;
    const row = dayMap.get(day) ?? { day, sent: 0, delivered: 0, opened: 0, clicked: 0 };
    row.sent += 1;
    if (r.delivered) row.delivered += 1;
    if (r.opened || r.openedByProxy) row.opened += 1;
    if (r.clicked) row.clicked += 1;
    dayMap.set(day, row);
  }
  const daily = [...dayMap.values()].sort((a, b) => a.day.localeCompare(b.day));

  // Limites do setor: hard bounce acima de 2% e reclamacao de spam acima de 0,1%
  // sao os patamares em que provedor comeca a punir. Em dominio novo isso e fatal.
  const hardRate = pct(counts.hardBounce, counts.sent);
  const health =
    counts.spam > 0 || rates.spam > 0.1
      ? { level: "critico" as const, message: `Reclamacao de spam em ${rates.spam.toFixed(1)}%. Pare o disparo e revise a lista.` }
      : hardRate > 2
        ? { level: "critico" as const, message: `Hard bounce em ${hardRate.toFixed(1)}% (limite seguro: 2%). Limpe a base antes de escalar.` }
        : hardRate > 0
          ? { level: "atencao" as const, message: `Hard bounce em ${hardRate.toFixed(1)}%. Da para escalar, mas limpando os mortos.` }
          : { level: "ok" as const, message: "Entrega limpa: sem hard bounce nem reclamacao de spam." };

  return { counts, rates, buttons, pareto, daily, recipients, health };
}

export const BUTTON_SHORT_LABELS: Record<ButtonKind, string> = {
  whatsapp: "WhatsApp",
  site: "Site",
  descadastro: "Descadastro",
  outro: "Outro",
};

/**
 * Filtro da tabela de destinatarios. Busca no que da para LER na linha (empresa,
 * endereco, status e botao), entao procurar por "bounce" ou "whatsapp" funciona
 * igual a procurar pelo nome da empresa.
 */
export function filterRecipients(
  recipients: RecipientRow[],
  { search = "", onlyProblems = false }: { search?: string; onlyProblems?: boolean } = {},
): RecipientRow[] {
  return recipients.filter((row) => {
    // "Problema" inclui quem nao abriu: e a fila de quem precisa de outra tentativa.
    if (onlyProblems && !row.problem && (row.opened || row.openedByProxy)) return false;
    return matchesSearch(recipientSearchText(row), search);
  });
}

/** Texto que a linha mostra na tela — e o que a busca da tabela procura. */
export function recipientSearchText(row: RecipientRow): string {
  return [row.company, row.email, row.status, ...row.buttons.map((b) => BUTTON_SHORT_LABELS[b])].join(" ");
}

/** `E-mail enviado para alguem@x.com.br: assunto` -> `alguem@x.com.br` */
export function parseRecipientFromDescription(description: string): string | null {
  const match = /para\s+([^\s:]+@[^\s:]+)/i.exec(String(description || ""));
  return match ? match[1].trim().toLowerCase() : null;
}
