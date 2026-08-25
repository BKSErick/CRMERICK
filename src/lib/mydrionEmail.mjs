import { Resend } from 'resend';

export const DEFAULT_MYDRION_EMAIL_FROM = 'Mydrion <onboarding@resend.dev>';

function extractEmail(value) {
  const normalized = String(value || '').trim();
  const match = normalized.match(/<([^>]+)>$/);
  return (match?.[1] || normalized).toLowerCase();
}

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(extractEmail(value));
}

function normalizeRecipients(to) {
  const recipients = (Array.isArray(to) ? to : [to])
    .map((value) => String(value || '').trim())
    .filter(Boolean);

  if (recipients.length === 0 || recipients.some((value) => !isEmail(value))) {
    throw new Error('Informe ao menos um destinatario de email valido.');
  }

  return recipients;
}

function providerError(error) {
  const name = typeof error?.name === 'string' ? error.name : 'unknown_error';
  const status = Number.isInteger(error?.statusCode) ? ` (${error.statusCode})` : '';
  return new Error(`Resend recusou o envio: ${name}${status}.`);
}

export function createMydrionEmailService({ apiKey, client } = {}) {
  const resolvedClient = client || (apiKey ? new Resend(apiKey) : null);

  if (!resolvedClient?.emails?.send) {
    throw new Error('RESEND_API_KEY nao configurada para o servico da Mydrion.');
  }

  function prepare({ from = DEFAULT_MYDRION_EMAIL_FROM, to, subject, html }) {
    const normalizedFrom = String(from || '').trim();
    const normalizedSubject = String(subject || '').trim();
    const normalizedHtml = String(html || '').trim();

    if (!isEmail(normalizedFrom)) {
      throw new Error('Remetente de email invalido.');
    }
    if (!normalizedSubject) {
      throw new Error('Assunto do email e obrigatorio.');
    }
    if (!normalizedHtml) {
      throw new Error('HTML do email e obrigatorio.');
    }

    return {
      from: normalizedFrom,
      to: normalizeRecipients(to),
      subject: normalizedSubject,
      html: normalizedHtml,
    };
  }

  return {
    prepare,
    async send(message) {
      const payload = prepare(message);
      let response;
      try {
        response = await resolvedClient.emails.send(payload);
      } catch (error) {
        throw providerError(error);
      }

      const { data, error } = response || {};

      if (error) {
        throw providerError(error);
      }
      if (!data?.id) {
        throw new Error('Resend nao retornou o identificador do envio.');
      }

      return { id: data.id };
    },
  };
}

export function createMydrionEmailServiceFromEnv(env = process.env) {
  return createMydrionEmailService({ apiKey: env.RESEND_API_KEY });
}
