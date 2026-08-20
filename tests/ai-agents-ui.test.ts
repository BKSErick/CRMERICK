import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync(new URL("../src/app/agentes/page.tsx", import.meta.url), "utf8");
const workspace = readFileSync(new URL("../src/app/agentes/AgentChatWorkspace.tsx", import.meta.url), "utf8");
const picker = readFileSync(new URL("../src/app/agentes/AgentPicker.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");

test("agentes preserva catalogo e adiciona chat na mesma rota", () => {
  assert.match(page, /AgentChatWorkspace/);
  assert.match(page, /AI_AGENTS_CHAT_ENABLED/);
  assert.doesNotMatch(page, /href=["']\/chat/);
});

test("workspace possui historico, escopos, loading, cancelamento e retry", () => {
  for (const text of ["Nova conversa", "CRM inteiro", "Deal especifico", "Relatorios", "Integracoes", "Conteudo e marca", "Tentar novamente"]) assert.match(workspace.normalize("NFD").replace(/[\u0300-\u036f]/g, ""), new RegExp(text, "i"));
  assert.match(workspace, /AbortController/);
  assert.match(workspace, /aria-live/);
  assert.match(workspace, /AgentPicker/);
});

test("picker oferece atalhos e dialogo acessivel", () => {
  assert.match(picker, /role="dialog"/);
  assert.match(picker, /@/);
  assert.match(picker, /aria-label/);
  assert.match(css, /\.agent-chat-layout/);
  assert.match(css, /@media\s*\(max-width:\s*768px\)[\s\S]*\.agent-chat-layout/);
});
