import assert from "node:assert/strict";
import test from "node:test";

import {
  buildActivityPayload,
  buildBrevoEmailPayload,
  contactForDeal,
  postActivity,
  sentAtFromLogEntry,
  validateMailbox,
} from "../scripts/email/brevo-support.mjs";

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
