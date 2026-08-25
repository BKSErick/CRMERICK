import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
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
  assert.deepEqual(payloads, [
    {
      from: "Mydrion <onboarding@resend.dev>",
      to: ["erick@example.com"],
      subject: "Ola Mydrion",
      html: "<p>Teste</p>",
    },
  ]);
});

test("falha sem API key quando cria cliente real", () => {
  assert.throws(() => createMydrionEmailServiceFromEnv({}), /RESEND_API_KEY/);
});

test("rejeita payload invalido antes do provider", async () => {
  let calls = 0;
  const service = createMydrionEmailService({
    client: {
      emails: {
        send: async () => {
          calls += 1;
          return {};
        },
      },
    },
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
    () =>
      service.send({
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

test("sanitiza excecao de rede lancada pelo provider", async () => {
  const secret = "network-error-with-secret";
  const service = createMydrionEmailService({
    client: {
      emails: {
        send: async () => {
          throw new Error(secret);
        },
      },
    },
  });

  await assert.rejects(
    () =>
      service.send({
        to: ["erick@example.com", "contato@example.com"],
        subject: "Teste de rede",
        html: "<p>Teste</p>",
      }),
    (error: Error) => {
      assert.match(error.message, /Resend recusou o envio/);
      assert.doesNotMatch(error.message, new RegExp(secret));
      return true;
    },
  );
});

test("CLI valida a configuracao sem enviar por padrao", () => {
  const script = resolve(process.cwd(), "scripts/email/send-mydrion-test.mjs");
  const result = spawnSync(process.execPath, [script, "--to=erick@example.com"], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: { ...process.env, RESEND_API_KEY: "fake-test-key" },
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /nenhum email enviado/i);
  assert.doesNotMatch(result.stdout + result.stderr, /fake-test-key/);
});

test("CLI exige destinatario explicito", () => {
  const script = resolve(process.cwd(), "scripts/email/send-mydrion-test.mjs");
  const result = spawnSync(process.execPath, [script], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: { ...process.env, RESEND_API_KEY: "fake-test-key" },
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /--to=<email>/);
  assert.doesNotMatch(result.stdout + result.stderr, /fake-test-key/);
});

test("CLI rejeita destinatario invalido sem tentar envio", () => {
  const script = resolve(process.cwd(), "scripts/email/send-mydrion-test.mjs");
  const result = spawnSync(process.execPath, [script, "--to=invalido"], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: { ...process.env, RESEND_API_KEY: "fake-test-key" },
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /destinatario/i);
  assert.doesNotMatch(result.stdout + result.stderr, /fake-test-key/);
});
