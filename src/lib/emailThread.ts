// Separa o corpo de um e-mail em "o que a pessoa escreveu agora" e "o historico
// citado abaixo" (bloco De/Enviada em/Para/Assunto do Outlook, "Em ... escreveu:"
// do Gmail, ou linhas prefixadas com ">"). O Brevo entrega o texto cru, entao sem
// isso a resposta e o e-mail original aparecem colados na caixa de entrada.

export type QuotedEmail = {
  fromName: string | null;
  fromEmail: string | null;
  sentAt: string | null;
  sentAtRaw: string | null;
  to: string | null;
  subject: string | null;
  body: string;
};

export type SplitEmail = {
  reply: string;
  quoted: QuotedEmail | null;
};

const HEADER_FROM = /^\s*(?:de|from)\s*:\s*(.+?)\s*$/i;
const HEADER_SENT = /^\s*(?:enviad[ao]s?\s+em|enviad[ao]|sent|date|data)\s*:\s*(.+?)\s*$/i;
const HEADER_TO = /^\s*(?:para|to)\s*:\s*(.+?)\s*$/i;
const HEADER_SUBJECT = /^\s*(?:assunto|subject)\s*:\s*(.+?)\s*$/i;
const SEPARATOR = /^\s*-{2,}\s*(?:mensagem original|original message|mensagem encaminhada|forwarded message)\s*-{2,}\s*$/i;
const GMAIL_QUOTE = /^\s*(?:em|on)\s.+?(?:escreveu|wrote)\s*:\s*$/i;
const TRACKING_LINE = /^\s*<?https?:\/\/\S+\/tr\/op\/\S*>?\s*$/i;
const MAILTO_DUP = /\s*<mailto:[^>]+>/gi;
const BARE_ADDRESS = /^<?([^\s<>"]+@[^\s<>"]+)>?$/;
const NAMED_ADDRESS = /^"?(.+?)"?\s*<([^\s<>]+@[^\s<>]+)>$/;

const PT_MONTHS: Record<string, number> = {
  janeiro: 0, fevereiro: 1, marco: 2, abril: 3, maio: 4, junho: 5,
  julho: 6, agosto: 7, setembro: 8, outubro: 9, novembro: 10, dezembro: 11,
};

function stripAccents(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

export function parseAddress(value: string | null | undefined): { name: string | null; email: string | null } {
  const raw = String(value ?? "").replace(MAILTO_DUP, "").trim();
  if (!raw) return { name: null, email: null };
  const bare = raw.match(BARE_ADDRESS);
  if (bare) return { name: null, email: bare[1].toLowerCase() };
  const named = raw.match(NAMED_ADDRESS);
  if (!named) return { name: raw, email: null };
  const email = named[2].toLowerCase();
  const name = named[1].trim();
  return { name: name && name.toLowerCase() !== email ? name : null, email };
}

// "terca-feira, 15 de setembro de 2026 09:07" -> ISO local. Devolve null se nao entender.
export function parsePtBrDate(value: string | null | undefined): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const normalized = stripAccents(raw.toLowerCase());
  const match = normalized.match(/(\d{1,2})\s+de\s+([a-z]+)\.?\s+de\s+(\d{4})(?:\D+(\d{1,2}):(\d{2}))?/);
  if (match) {
    const month = PT_MONTHS[match[2]]
      ?? Object.entries(PT_MONTHS).find(([name]) => name.startsWith(match[2].slice(0, 3)))?.[1];
    if (month !== undefined) {
      const date = new Date(Number(match[3]), month, Number(match[1]), Number(match[4] ?? 0), Number(match[5] ?? 0));
      return Number.isNaN(date.getTime()) ? null : date.toISOString();
    }
  }
  const numeric = normalized.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\D+(\d{1,2}):(\d{2}))?/);
  if (numeric) {
    const date = new Date(Number(numeric[3]), Number(numeric[2]) - 1, Number(numeric[1]), Number(numeric[4] ?? 0), Number(numeric[5] ?? 0));
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  const fallback = new Date(raw);
  return Number.isNaN(fallback.getTime()) ? null : fallback.toISOString();
}

export function cleanEmailText(value: string | null | undefined): string {
  return String(value ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(MAILTO_DUP, "")
    .split("\n")
    .filter((line) => !TRACKING_LINE.test(line))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Tira o prefixo "> " de cada linha sem engolir a quebra de linha (por isso [ \t], nao \s).
function unquote(lines: string[]): string {
  return lines.join("\n").replace(/^[ \t]*>[ \t]?/gm, "").trim();
}

function findHeaderBlock(lines: string[]): number {
  for (let index = 0; index < lines.length; index += 1) {
    if (SEPARATOR.test(lines[index])) return index;
    if (!HEADER_FROM.test(lines[index])) continue;
    // Um "De:" solto pode ser texto normal; exige mais um cabecalho nas 5 linhas seguintes.
    const window = lines.slice(index + 1, index + 6);
    const siblings = window.filter((line) => HEADER_SENT.test(line) || HEADER_TO.test(line) || HEADER_SUBJECT.test(line));
    if (siblings.length >= 1) return index;
  }
  return -1;
}

function findGmailQuote(lines: string[]): number {
  return lines.findIndex((line, index) => {
    if (GMAIL_QUOTE.test(line)) return true;
    // Gmail quebra a linha "Em ..., X <x@y> escreveu:" em duas quando e longa.
    return /^\s*(?:em|on)\s+\d/i.test(line) && /(?:escreveu|wrote)\s*:\s*$/i.test(lines[index + 1] ?? "");
  });
}

function findAngleQuote(lines: string[]): number {
  const first = lines.findIndex((line) => /^\s*>/.test(line));
  if (first < 0) return -1;
  const rest = lines.slice(first).filter((line) => line.trim());
  return rest.every((line) => /^\s*>/.test(line)) ? first : -1;
}

export function splitQuotedEmail(content: string | null | undefined): SplitEmail {
  const text = cleanEmailText(content);
  if (!text) return { reply: "", quoted: null };
  const lines = text.split("\n");

  const headerAt = findHeaderBlock(lines);
  if (headerAt >= 0) {
    const reply = lines.slice(0, headerAt).join("\n").trim();
    const block = lines.slice(headerAt);
    let cursor = SEPARATOR.test(block[0]) ? 1 : 0;
    const quoted: QuotedEmail = { fromName: null, fromEmail: null, sentAt: null, sentAtRaw: null, to: null, subject: null, body: "" };
    while (cursor < block.length && cursor < 12) {
      const line = block[cursor];
      const from = line.match(HEADER_FROM);
      const sent = line.match(HEADER_SENT);
      const to = line.match(HEADER_TO);
      const subject = line.match(HEADER_SUBJECT);
      if (from) {
        const address = parseAddress(from[1]);
        quoted.fromName = address.name;
        quoted.fromEmail = address.email;
      } else if (sent) {
        quoted.sentAtRaw = sent[1];
        quoted.sentAt = parsePtBrDate(sent[1]);
      } else if (to) {
        quoted.to = to[1].replace(MAILTO_DUP, "").trim();
      } else if (subject) {
        quoted.subject = subject[1];
      } else if (line.trim()) {
        break;
      }
      cursor += 1;
    }
    quoted.body = unquote(block.slice(cursor));
    return { reply, quoted };
  }

  const gmailAt = findGmailQuote(lines);
  if (gmailAt >= 0) {
    const reply = lines.slice(0, gmailAt).join("\n").trim();
    const intro = GMAIL_QUOTE.test(lines[gmailAt]) ? lines[gmailAt] : `${lines[gmailAt]} ${lines[gmailAt + 1] ?? ""}`;
    const bodyStart = GMAIL_QUOTE.test(lines[gmailAt]) ? gmailAt + 1 : gmailAt + 2;
    const inner = intro.replace(/^\s*(?:em|on)\s+/i, "").replace(/\s+(?:escreveu|wrote)\s*:\s*$/i, "").trim();
    // O nome vem sempre grudado no endereco, entao ancora pelo <email> (ou email solto) no fim.
    const match = inner.match(/^(.*?)(?:,\s*)?([^,<]*<[^>]+@[^>]+>|[^\s,]+@[^\s,]+)\s*$/);
    const address = parseAddress(match?.[2] ?? null);
    const when = (match?.[1] ?? inner).replace(/,\s*$/, "").trim() || null;
    return {
      reply,
      quoted: {
        fromName: address.name,
        fromEmail: address.email,
        sentAt: parsePtBrDate(when),
        sentAtRaw: when,
        to: null,
        subject: null,
        body: unquote(lines.slice(bodyStart)),
      },
    };
  }

  const angleAt = findAngleQuote(lines);
  if (angleAt >= 0) {
    return {
      reply: lines.slice(0, angleAt).join("\n").trim(),
      quoted: {
        fromName: null, fromEmail: null, sentAt: null, sentAtRaw: null, to: null, subject: null,
        body: unquote(lines.slice(angleAt)),
      },
    };
  }

  return { reply: text, quoted: null };
}

export function normalizeSubject(value: string | null | undefined): string {
  return stripAccents(String(value ?? "").toLowerCase())
    .replace(/^(?:\s*(?:re|res|enc|fw|fwd)\s*:\s*)+/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function emailPreview(value: string, max = 160): string {
  const flat = value.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat;
}
