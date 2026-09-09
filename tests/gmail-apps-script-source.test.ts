import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("../integrations/google-apps-script/gmail-to-crm.gs", import.meta.url),
  "utf8",
);

test("Apps Script busca Gmail inclusive Spam e sincroniza a cada cinco minutos", () => {
  assert.match(source, /GmailApp\.search/);
  assert.match(source, /in:anywhere/);
  assert.match(source, /newer_than:30d/);
  assert.match(source, /everyMinutes\(5\)/);
  assert.match(source, /sincronizarGmailComCrm/);
});

test("Apps Script usa propriedades e Bearer sem segredo hardcoded", () => {
  assert.match(source, /PropertiesService\.getScriptProperties/);
  assert.match(source, /CRM_WEBHOOK_URL/);
  assert.match(source, /CRM_WEBHOOK_SECRET/);
  assert.match(source, /CRM_MAILBOX_ADDRESSES/);
  assert.match(source, /Authorization:\s*"Bearer "\s*\+/);
  assert.doesNotMatch(source, /sk_[a-zA-Z0-9]{20,}/);
});

test("Apps Script e somente leitura e nao transfere HTML ou anexos", () => {
  assert.doesNotMatch(source, /sendEmail|\.reply\(|markRead|markUnread|moveToTrash|moveToArchive/i);
  assert.doesNotMatch(source, /getBody\(|getRawContent\(|getAttachments\(/);
  assert.match(source, /getPlainBody\(\)/);
  assert.match(source, /attachments:\s*\[\]/);
});

test("Apps Script limita cada lote pelo tamanho real antes de publicar", () => {
  assert.match(source, /maximumPayloadBytes:\s*900000/);
  assert.match(source, /Utilities\.newBlob\(JSON\.stringify\(payload\)\)\.getBytes\(\)\.length/);
  assert.match(source, /lotesParaEnvio_/);
});
