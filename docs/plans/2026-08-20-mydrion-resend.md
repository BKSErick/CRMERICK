# Plano de implementacao - Resend transacional da Mydrion

> **Story:** `docs/stories/story-036-resend-transacional-mydrion.md`  
> **Design:** `docs/plans/2026-08-20-mydrion-resend-design.md`  
> **Executor:** `@dev`

## Tarefa 1: Criar os testes RED do servico

**Arquivo:** `tests/mydrion-email.test.ts`  
**Objetivo:** Fixar o contrato antes da implementacao e impedir rede/segredo nos
testes.

**Codigo:**

```typescript
import assert from "node:assert/strict";
import test from "node:test";

import {
  createMydrionEmailService,
  createMydrionEmailServiceFromEnv,
} from "../src/lib/mydrionEmail.mjs";

test("envia payload transacional normalizado e retorna id", async () => {
  const payloads: unknown[] = [];
  const service = createMydrionEmailService({
    client: {
      emails: {
        send: async (payload: unknown) => {
          payloads.push(payload);
          return { data: { id: "email-123" }, error: null };
        },
      },
    },
  });

  const result = await service.send({
    to: " erick@example.com ",
    subject: " Ola Mydrion ",
    html: "<p>Teste</p>",
  });

  assert.equal(result.id, "email-123");
  assert.deepEqual(payloads, [{
    from: "Mydrion <onboarding@resend.dev>",
    to: ["erick@example.com"],
    subject: "Ola Mydrion",
    html: "<p>Teste</p>",
  }]);
});

test("falha sem API key quando cria cliente real", () => {
  assert.throws(
    () => createMydrionEmailServiceFromEnv({}),
    /RESEND_API_KEY/,
  );
});

test("rejeita payload invalido antes do provider", async () => {
  let calls = 0;
  const service = createMydrionEmailService({
    client: { emails: { send: async () => { calls += 1; return {}; } } },
  });

  await assert.rejects(
    () => service.send({ to: "invalido", subject: "", html: "" }),
    /destinatario|assunto|HTML/i,
  );
  assert.equal(calls, 0);
});

test("sanitiza erro do provider sem vazar segredo", async () => {
  const secret = "fake-secret-that-must-not-leak";
  const service = createMydrionEmailService({
    client: {
      emails: {
        send: async () => ({
          data: null,
          error: { name: "validation_error", statusCode: 403, message: secret },
        }),
      },
    },
  });

  await assert.rejects(
    () => service.send({
      to: "erick@example.com",
      subject: "Teste",
      html: "<p>Teste</p>",
    }),
    (error: Error) => {
      assert.match(error.message, /validation_error|403/);
      assert.doesNotMatch(error.message, new RegExp(secret));
      return true;
    },
  );
});
```

**Verificacao:**

```powershell
node --test tests/mydrion-email.test.ts
```

Resultado RED esperado: falha porque `src/lib/mydrionEmail.mjs` ainda nao existe.

## Tarefa 2: Instalar o SDK oficial

**Arquivos:** `package.json`, `package-lock.json`  
**Objetivo:** Adicionar a dependencia runtime `resend` sem alterar as demais.

**Comando:**

```powershell
npm.cmd install resend
```

**Verificacao:**

```powershell
npm.cmd ls resend --depth=0
```

## Tarefa 3: Implementar o servico server-side

**Arquivo:** `src/lib/mydrionEmail.mjs`  
**Objetivo:** Encapsular o SDK, validar o payload e sanitizar erros.

**Codigo:**

```javascript
import { Resend } from 'resend';

export const DEFAULT_MYDRION_EMAIL_FROM = 'Mydrion <onboarding@resend.dev>';

function extractEmail(value) {
  const match = String(value).trim().match(/<([^>]+)>$/);
  return (match?.[1] || String(value).trim()).toLowerCase();
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

  return {
    async send({ from = DEFAULT_MYDRION_EMAIL_FROM, to, subject, html }) {
      const normalizedFrom = String(from || '').trim();
      const normalizedSubject = String(subject || '').trim();
      const normalizedHtml = String(html || '').trim();
      if (!isEmail(normalizedFrom)) throw new Error('Remetente de email invalido.');
      if (!normalizedSubject) throw new Error('Assunto do email e obrigatorio.');
      if (!normalizedHtml) throw new Error('HTML do email e obrigatorio.');

      const { data, error } = await resolvedClient.emails.send({
        from: normalizedFrom,
        to: normalizeRecipients(to),
        subject: normalizedSubject,
        html: normalizedHtml,
      });
      if (error) throw providerError(error);
      if (!data?.id) throw new Error('Resend nao retornou o identificador do envio.');
      return { id: data.id };
    },
  };
}

export function createMydrionEmailServiceFromEnv(env = process.env) {
  return createMydrionEmailService({ apiKey: env.RESEND_API_KEY });
}
```

**Verificacao:** repetir o teste focado e obter GREEN.

## Tarefa 4: Criar o comando manual com dry-run seguro

**Arquivo:** `scripts/email/send-mydrion-test.mjs`  
**Objetivo:** Validar configuracao por padrao e enviar apenas com `--send`.

**Codigo:**

```javascript
import {
  DEFAULT_MYDRION_EMAIL_FROM,
  createMydrionEmailServiceFromEnv,
} from '../../src/lib/mydrionEmail.mjs';

const args = process.argv.slice(2);
const readArg = (name) => {
  const prefix = `--${name}=`;
  return args.find((value) => value.startsWith(prefix))?.slice(prefix.length) || '';
};

const to = readArg('to');
const shouldSend = args.includes('--send');
const from = process.env.MYDRION_EMAIL_FROM || DEFAULT_MYDRION_EMAIL_FROM;

if (!to) throw new Error('Informe --to=<email> para o teste da Mydrion.');

const service = createMydrionEmailServiceFromEnv();
const message = {
  from,
  to,
  subject: 'Primeiro email da Mydrion com Resend',
  html: '<p>Parabens! O envio transacional da <strong>Mydrion</strong> esta configurado.</p>',
};

if (!shouldSend) {
  console.log(`VALIDACAO OK: nenhum email enviado. Destinatario: ${to}`);
  console.log('Para enviar de verdade, repita com a flag --send.');
} else {
  const result = await service.send(message);
  console.log(`Email enviado pelo Resend. ID: ${result.id}`);
}
```

**Verificacao:**

```powershell
npm.cmd run email:mydrion:test -- --to=erickgit7@gmail.com
```

O output deve conter `nenhum email enviado`; nao usar `--send` nesta story.

## Tarefa 5: Sincronizar scripts e configuracao documentada

**Arquivos:** `package.json`, `.env.example`  
**Objetivo:** Expor o comando e documentar apenas nomes de variaveis.

**Alteracoes:**

```json
"email:mydrion:test": "node --env-file-if-exists=.env scripts/email/send-mydrion-test.mjs"
```

```dotenv
# Resend / Mydrion (somente server-side)
RESEND_API_KEY=
MYDRION_EMAIL_FROM=Mydrion <onboarding@resend.dev>
```

Adicionar `tests/mydrion-email.test.ts` ao script `test` existente.

**Verificacao:** conferir que `.env` segue ignorado e que nenhum `re_` real
aparece em arquivos rastreados.

## Tarefa 6: Fechar story e quality gates

**Arquivo:** `docs/stories/story-036-resend-transacional-mydrion.md`  
**Objetivo:** Atualizar apenas checkboxes, Status, Change Log e Dev Agent Record.

**Comandos:**

```powershell
npm.cmd run lint
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
```

**Verificacao:** todos os comandos passam, nenhum email foi enviado e o diff nao
inclui arquivos Brevo nem alteracoes locais fora da Story 036.
