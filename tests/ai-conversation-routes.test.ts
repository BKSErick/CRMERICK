import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(path: string) { return readFileSync(new URL(`../${path}`, import.meta.url), "utf8"); }

test("migration cria conversas, mensagens e RLS deny by default", () => {
  for (const sql of [source("scripts/migrations/20260820_ai_agent_conversations.sql"), source("scripts/supabase-schema.sql")]) {
    assert.match(sql, /create table if not exists public\.ai_conversations/i);
    assert.match(sql, /create table if not exists public\.ai_conversation_messages/i);
    assert.match(sql, /enable row level security/i);
  }
});

test("rotas exigem sessao e persistem metadados auditaveis", () => {
  const conversations = source("src/app/api/ai/conversations/route.ts");
  const chat = source("src/app/api/ai/chat/route.ts");
  for (const route of [conversations, chat]) assert.match(route, /requireAiChatAdminSession/);
  assert.match(chat, /prompt_version/);
  assert.match(chat, /source_hash/);
  assert.match(chat, /context_manifest/);
  assert.match(chat, /citations/);
  assert.match(chat, /AI_CHAT_SMART_RETRIEVAL_ENABLED/);
  assert.match(chat, /routing_plan/);
  assert.match(chat, /provider_attempts/);
  assert.match(chat, /model_preference/);
  assert.doesNotMatch(chat, /tool_calls|\.from\(body|\.rpc\(body/);
});

test("catalogo de modelos exige sessao e expoe somente modelos gratuitos", () => {
  const route = source("src/app/api/ai/models/route.ts");
  assert.match(route, /requireAiChatAdminSession/);
  assert.match(route, /getFreeModelCatalog/);
  assert.doesNotMatch(route, /OPENROUTER_API_KEY.*NextResponse|process\.env.*json/i);
});
