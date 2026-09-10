import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const collection = readFileSync(new URL("../src/app/api/email-automations/route.ts", import.meta.url), "utf8");
const detail = readFileSync(new URL("../src/app/api/email-automations/[id]/route.ts", import.meta.url), "utf8");
const simulation = readFileSync(new URL("../src/app/api/email-automations/test/route.ts", import.meta.url), "utf8");
const dispatch = readFileSync(new URL("../src/app/api/email-automations/[id]/dispatch/route.ts", import.meta.url), "utf8");
const dispatchServer = readFileSync(new URL("../src/lib/emailManualDispatchServer.ts", import.meta.url), "utf8");
const repository = readFileSync(new URL("../src/lib/emailAutomationRepository.ts", import.meta.url), "utf8");

test("API lista, cria, consulta, versiona e arquiva rascunhos", () => {
  assert.match(collection, /listEmailAutomations/);
  assert.match(collection, /createEmailAutomation/);
  assert.match(detail, /getEmailAutomation/);
  assert.match(detail, /saveEmailAutomation/);
  assert.match(detail, /archived/);
  assert.match(repository, /save_email_automation/);
  assert.match(repository, /expectedVersion/);
});

test("API valida o grafo no servidor e persiste somente simulacao", () => {
  assert.match(detail, /validateEmailAutomationGraph/);
  assert.match(simulation, /simulateEmailAutomationGraph/);
  assert.match(simulation, /recordEmailAutomationTestRun/);
  assert.match(simulation, /status:\s*result\.status/);
});

test("nao existe caminho de ativacao automatica ou worker nas rotas", () => {
  const source = `${collection}\n${detail}\n${simulation}\n${repository}`;
  assert.doesNotMatch(source, /activateAutomation|setInterval|setTimeout/i);
  assert.doesNotMatch(source, /status:\s*["']active["']/i);
});

test("disparo manual exige admin, confirmacao e delega ao executor seguro", () => {
  assert.match(dispatch, /requireDemandAdminSession\(request, "automacoes"\)/);
  assert.match(dispatch, /confirmed/);
  assert.match(dispatch, /runManualEmailDispatch/);
  assert.match(dispatch, /createManualDispatchDependencies/);
  assert.doesNotMatch(dispatch, /GET\s*\(|setInterval|cron/i);
});

test("adaptador usa idempotencia Brevo e bloqueia respostas e eventos de supressao", () => {
  assert.match(dispatchServer, /Idempotency-Key/);
  assert.match(dispatchServer, /hard_bounce[\s\S]*soft_bounce[\s\S]*spam[\s\S]*blocked[\s\S]*unsubscribed/);
  assert.match(dispatchServer, /eq\("direction", "received"\)/);
  assert.match(dispatchServer, /Auditoria Brevo indisponivel[\s\S]*bloqueado antes do envio/);
});
