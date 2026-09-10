import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import test from "node:test";

import {
  buildActivityPayload,
  buildBrevoEmailPayload,
  countEmailSendsForDay,
  contactForDeal,
  fetchCrmEmailSentToday,
  postActivity,
  recipientFromActivityDescription,
  resolveBatchLimit,
  resolveDailyCap,
  resolveEffectiveSentToday,
  sentAtFromLogEntry,
  validateMailbox,
} from "../scripts/email/brevo-support.mjs";
import { montarEmail } from "../scripts/email/copy-institucional.mjs";

test("copy institucional oferece uma unica saida comercial pelo site", () => {
  const email = montarEmail({
    empresa: "Empresa Tecnica Ltda",
    decisorNome: "Ana Souza",
    setor: "industria",
    cidade: "Joao Monlevade",
  });

  assert.equal((email.html.match(/<a\s/gi) ?? []).length, 1);
  assert.match(email.html, /https:\/\/www\.mydrion\.com\.br\/\?utm_source=email&amp;utm_medium=cold&amp;utm_campaign=institucional/);
  assert.match(email.text, /https:\/\/www\.mydrion\.com\.br\/\?utm_source=email&utm_medium=cold&utm_campaign=institucional/);
  assert.doesNotMatch(`${email.html}\n${email.text}`, /wa\.me|553191072407/i);
});

test("rampa diaria inicia em 20 e nunca ultrapassa o teto de 250", () => {
  assert.equal(resolveDailyCap(undefined), 20);
  assert.equal(resolveDailyCap(""), 20);
  assert.equal(resolveDailyCap("invalido"), 20);
  assert.equal(resolveDailyCap("0"), 20);
  assert.equal(resolveDailyCap("-1"), 20);
  assert.equal(resolveDailyCap("30"), 30);
  assert.equal(resolveDailyCap("250"), 250);
  assert.equal(resolveDailyCap("300"), 250);
  assert.equal(resolveBatchLimit(undefined), 0);
  assert.equal(resolveBatchLimit("-1"), 0);
  assert.equal(resolveBatchLimit("20"), 20);
  assert.equal(resolveBatchLimit("300"), 250);
  assert.equal(resolveEffectiveSentToday(12, 0), 12);
  assert.equal(resolveEffectiveSentToday(12, 2), 14);
});

test("motor sem comando encerra antes de consultar provedor ou enviar", () => {
  const result = spawnSync(process.execPath, [resolve(process.cwd(), "scripts/email/brevo_send.mjs")], {
    cwd: process.cwd(),
    encoding: "utf8",
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /nada a fazer/i);
  assert.doesNotMatch(result.stdout + result.stderr, /fetch failed|CONTA:|SENDER:/i);
});

test("contagem diaria respeita o dia de Sao Paulo na fronteira UTC", () => {
  const now = new Date("2026-09-10T02:30:00.000Z"); // 09/09, 23:30 em Sao Paulo
  const rows = [
    { created_at: "2026-09-09T02:59:59.000Z" }, // 08/09, 23:59:59 local
    { created_at: "2026-09-09T03:00:00.000Z" }, // 09/09, 00:00 local
    { created_at: "2026-09-10T02:00:00.000Z" }, // 09/09, 23:00 local
    { created_at: "2026-09-10T03:00:00.000Z" }, // 10/09, 00:00 local
  ];

  assert.equal(countEmailSendsForDay(rows, now), 2);
});

test("consulta central filtra email_sent e falha fechada quando o CRM recusa", async () => {
  let requestedUrl = "";
  const count = await fetchCrmEmailSentToday({
    fetchFn: async (url) => {
      requestedUrl = String(url);
      return Response.json([
        { created_at: "2026-09-10T13:00:00.000Z" },
        { created_at: "2026-09-09T13:00:00.000Z" },
      ]);
    },
    supabaseUrl: "https://project.supabase.co",
    headers: { apikey: "redacted" },
    now: new Date("2026-09-10T15:00:00.000Z"),
  });

  assert.equal(count, 1);
  assert.match(requestedUrl, /type=eq%5C?\.?(email_sent)|type=eq\.email_sent/i);
  await assert.rejects(
    () => fetchCrmEmailSentToday({
      fetchFn: async () => new Response("segredo", { status: 503 }),
      supabaseUrl: "https://project.supabase.co",
      headers: {},
    }),
    /total diario.*503/i,
  );
});

test("extrai destinatario do registro central sem aceitar texto arbitrario", () => {
  assert.equal(
    recipientFromActivityDescription("E-mail enviado para Compras@Empresa.com.br: Assunto"),
    "compras@empresa.com.br",
  );
  assert.equal(recipientFromActivityDescription("Outra atividade sem destinatario"), null);
});

test("resolve o contato pela chave real deals.contact_id", () => {
  const contacts = new Map([
    [21, { id: 21, email: "contato-errado@example.com" }],
    [901, { id: 901, email: "contato-certo@example.com" }],
  ]);

  const contact = contactForDeal({ id: 21, contact_id: 901 }, contacts);

  assert.equal(contact?.id, 901);
  assert.equal(contact?.email, "contato-certo@example.com");
});

test("nao presume contato quando deals.contact_id esta ausente", () => {
  const contacts = new Map([[21, { id: 21, email: "legado@example.com" }]]);

  assert.equal(contactForDeal({ id: 21, contact_id: null }, contacts), null);
});

test("atividade usa deal_id e contact_id independentes", () => {
  assert.deepEqual(
    buildActivityPayload(
      {
        dealId: 21,
        contactId: 901,
        email: " decisor@example.com ",
        subject: "Diagnostico",
        classe: "decisor",
      },
      "brevo-message-123",
      "2026-09-08T20:00:00.000Z",
    ),
    {
      type: "email_sent",
      deal_id: 21,
      contact_id: 901,
      description: "E-mail enviado para decisor@example.com: Diagnostico",
      metadata: {
        provider: "brevo",
        message_id: "brevo-message-123",
        classe: "decisor",
      },
      created_at: "2026-09-08T20:00:00.000Z",
    },
  );
});

test("atividade rejeita fila sem deal para nao voltar a criar orfa", () => {
  assert.throws(
    () =>
      buildActivityPayload(
        { dealId: null, contactId: 901, email: "decisor@example.com", subject: "Diagnostico" },
        "brevo-message-123",
      ),
    /atividade de e-mail nao pode nascer orfa/i,
  );
});

test("Reply-To funcional tambem recebe pedidos de unsubscribe", () => {
  const payload = buildBrevoEmailPayload(
    { name: "Erick Sena", email: "contato@mydrion.com.br" },
    {
      company: "Empresa",
      email: "decisor@example.com",
      subject: "Diagnostico",
      html: "<p>Ola</p>",
      semSite: false,
    },
    "caixa.funcional@gmail.com",
  );

  assert.deepEqual(payload.replyTo, { email: "caixa.funcional@gmail.com", name: "Erick Sena" });
  assert.deepEqual(payload.headers, {
    "List-Unsubscribe": "<mailto:caixa.funcional@gmail.com?subject=unsubscribe>",
  });
});

test("sent_log antigo e novo contam pelo mesmo timestamp", () => {
  assert.equal(sentAtFromLogEntry("2026-09-08T19:11:59.564Z"), "2026-09-08T19:11:59.564Z");
  assert.equal(
    sentAtFromLogEntry({ sentAt: "2026-09-08T20:00:00.000Z", messageId: "brevo-1" }),
    "2026-09-08T20:00:00.000Z",
  );
});

test("postActivity torna falha HTTP do Supabase observavel sem vazar o body", async () => {
  const secretBody = "constraint details with private data";

  await assert.rejects(
    () =>
      postActivity({
        fetchFn: async () => new Response(secretBody, { status: 409 }),
        supabaseUrl: "https://project.supabase.co",
        headers: { apikey: "redacted" },
        payload: { type: "email_sent" },
      }),
    (error: Error) => {
      assert.match(error.message, /atividades do CRM.*409/i);
      assert.doesNotMatch(error.message, new RegExp(secretBody));
      return true;
    },
  );
});

test("postActivity envia JSON e aceita resposta 2xx", async () => {
  let request: { url?: string; init?: RequestInit } = {};

  await postActivity({
    fetchFn: async (url, init) => {
      request = { url: String(url), init };
      return new Response(null, { status: 201 });
    },
    supabaseUrl: "https://project.supabase.co/",
    headers: { apikey: "redacted" },
    payload: { type: "email_sent", deal_id: 21, contact_id: 901 },
  });

  assert.equal(request.url, "https://project.supabase.co/rest/v1/activities");
  assert.equal(request.init?.method, "POST");
  assert.deepEqual(JSON.parse(String(request.init?.body)), {
    type: "email_sent",
    deal_id: 21,
    contact_id: 901,
  });
});

test("postActivity rejeita URL do Supabase ausente antes da rede", async () => {
  let calls = 0;
  await assert.rejects(
    () =>
      postActivity({
        fetchFn: async () => {
          calls += 1;
          return new Response(null, { status: 201 });
        },
        supabaseUrl: "",
        headers: {},
        payload: { type: "email_sent" },
      }),
    /SUPABASE_URL.*invalida/i,
  );
  assert.equal(calls, 0);
});

test("validateMailbox rejeita Reply-To invalido antes do disparo", () => {
  assert.equal(validateMailbox("contato@mydrion.com.br"), "contato@mydrion.com.br");
  assert.throws(() => validateMailbox("contato@"), /e-mail de resposta invalido/i);
});
