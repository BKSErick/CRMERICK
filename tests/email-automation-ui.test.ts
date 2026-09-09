import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const navigation = readFileSync(new URL("../src/lib/navigation.ts", import.meta.url), "utf8");
const sidebar = readFileSync(new URL("../src/components/Sidebar.tsx", import.meta.url), "utf8");
const page = readFileSync(new URL("../src/app/automacoes/page.tsx", import.meta.url), "utf8");
const editor = readFileSync(new URL("../src/components/email-automations/AutomationEditor.tsx", import.meta.url), "utf8");
const palette = readFileSync(new URL("../src/components/email-automations/AutomationPalette.tsx", import.meta.url), "utf8");
const graph = readFileSync(new URL("../src/lib/emailAutomationGraph.ts", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");

test("inclui Automacoes como modulo navegavel com icone proprio", () => {
  assert.match(navigation, /label:\s*"Automacoes"[\s\S]*href:\s*"\/automacoes"[\s\S]*module:\s*"automacoes"/);
  assert.match(sidebar, /automacoes:\s*"/);
});

test("lista permite busca, filtros, criacao e abertura no editor", () => {
  assert.match(page, /\/api\/email-automations/);
  assert.match(page, /Criar automacao/);
  assert.match(page, /Todos|Rascunhos/);
  assert.match(page, /AutomationEditor/);
});

test("editor usa canvas conectado, controles, minimapa e inspetor", () => {
  assert.match(editor, /ReactFlow/);
  assert.match(editor, /MiniMap/);
  assert.match(editor, /Controls/);
  assert.match(editor, /AutomationPalette/);
  assert.match(editor, /AutomationInspector/);
  assert.match(editor, /Salvar/);
  assert.match(editor, /Testar/);
});

test("envio aparece bloqueado e interface nao oferece ativacao", () => {
  assert.match(`${palette}\n${graph}`, /action\.email_send/);
  assert.match(palette, /locked|Bloqueado/);
  assert.doesNotMatch(`${page}\n${editor}\n${palette}`, /Ativar automacao|Enviar agora/);
});

test("layout do editor responde em telas menores", () => {
  assert.match(styles, /\.automation-page/);
  assert.match(styles, /\.automation-editor-shell/);
  assert.match(styles, /@media\s*\(max-width:\s*900px\)[\s\S]*\.automation-editor-shell/);
});
