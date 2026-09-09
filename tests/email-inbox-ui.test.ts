import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const navigation = readFileSync(new URL("../src/lib/navigation.ts", import.meta.url), "utf8");
const sidebar = readFileSync(new URL("../src/components/Sidebar.tsx", import.meta.url), "utf8");
const page = readFileSync(new URL("../src/app/emails/page.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");

test("inclui E-mails como modulo navegavel com icone proprio", () => {
  assert.match(navigation, /label:\s*"E-mails"[\s\S]*href:\s*"\/emails"[\s\S]*module:\s*"emails"/);
  assert.match(sidebar, /emails:\s*"/);
});

test("lista conversas com busca, filtro e paginacao de dez", () => {
  assert.match(page, /\/api\/emails/);
  assert.match(page, /searchParams\.set\("q"/);
  assert.match(page, /searchParams\.set\("unread"/);
  assert.match(page, /10 por pagina/);
  assert.match(page, /P[aá]gina/);
});

test("abre a thread, marca leitura e mostra o contexto do lead", () => {
  assert.match(page, /searchParams\.set\("thread"/);
  assert.match(page, /\/api\/emails\/read/);
  assert.match(page, /\/lista\?dealId=/);
  assert.match(page, /messages\.map/);
});

test("primeira versao e somente leitura e nao injeta HTML recebido", () => {
  assert.doesNotMatch(page, /dangerouslySetInnerHTML/);
  assert.doesNotMatch(page, /Responder|Enviar resposta|type=["']submit["']/);
  assert.match(page, /Somente leitura/);
  assert.match(page, /validAttachmentUrl\(attachment\.link\)/);
});

test("layout da caixa de entrada responde em telas menores", () => {
  assert.match(styles, /\.email-inbox-page/);
  assert.match(styles, /\.email-inbox-shell/);
  assert.match(styles, /@media\s*\(max-width:\s*900px\)[\s\S]*\.email-inbox-shell/);
});
