import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

function read(relativePath: string) {
  const url = new URL(`../${relativePath}`, import.meta.url);
  return existsSync(fileURLToPath(url)) ? readFileSync(url, "utf8") : "";
}

const layout = read("src/app/layout.tsx");
const sidebar = read("src/components/Sidebar.tsx");
const topbar = read("src/components/Topbar.tsx");
const login = read("src/app/login/page.tsx");
const icon = read("src/app/icon.svg");
const designSystem = read("src/styles/hub.css");
const globalStyles = read("src/app/globals.css");
const legacyStyles = read("src/styles/legacy-pipeline.css");
const loginStyles = read("src/app/login/login.css");
const automationEditor = read("src/components/email-automations/AutomationEditor.tsx");
const northStar = read("src/app/north-star/page.tsx");
const threads = read("src/app/threads/page.tsx");
const dealPresentation = read("src/lib/dealPresentation.ts");

const visualSource = [
  designSystem,
  globalStyles,
  legacyStyles,
  loginStyles,
  automationEditor,
  northStar,
  threads,
  dealPresentation,
].join("\n");

test("apresenta o CRM ERICK com a marca visivel Mydrion CRM", () => {
  assert.match(layout, /title:\s*"Mydrion CRM"/);
  assert.match(layout, /Operação comercial/);
  assert.match(sidebar, /mydrion-contract\.svg/);
  assert.match(sidebar, /alt="Mydrion"/);
  assert.match(sidebar, />Operação comercial</);
  assert.match(topbar, /Mydrion CRM/);
  assert.match(login, /mydrion-contract\.svg/);
  assert.match(login, /Mydrion CRM/);
  assert.doesNotMatch(`${layout}\n${sidebar}\n${topbar}\n${login}`, /CRM Erick|Hub Operacional/);
});

test("usa o monograma oficial da Mydrion como favicon", () => {
  assert.match(icon, /<title>Mydrion<\/title>/);
  assert.match(icon, /#08090B/i);
  assert.match(icon, /#F9D9B1/i);
});

test("declara e aplica os tokens oficiais do design system Mydrion", () => {
  assert.match(designSystem, /--color-ink-950:\s*#08090b/i);
  assert.match(designSystem, /--color-paper-100:\s*#f7f5f0/i);
  assert.match(designSystem, /--color-brand-sand:\s*#f9d9b1/i);
  assert.match(designSystem, /--color-brand-accent:\s*#8d5c25/i);
  assert.match(designSystem, /--font-interface:\s*['"]Instrument Sans['"]/i);
  assert.match(designSystem, /--font-mono:\s*['"]IBM Plex Mono['"]/i);
  assert.match(designSystem, /\.sidebar[\s\S]*var\(--color-ink-950\)/);
  assert.match(designSystem, /\.main[\s\S]*var\(--color-paper-100\)/);
});

test("remove a paleta violeta que identificava o design system anterior", () => {
  assert.doesNotMatch(
    visualSource,
    /#(?:7b68ee|6647f0|7c3aed|4338ca|4f46e5|8b5cf6|a78bfa|8e7ff0|6b56e9|634ee0|ab9efa|b9afff|cfc8ff|efedff|f7f4ff|8b74f4)\b/i,
  );
  assert.doesNotMatch(
    visualSource,
    /rgba\(\s*(?:123\s*,\s*104\s*,\s*238|124\s*,\s*58\s*,\s*237|139\s*,\s*92\s*,\s*246|79\s*,\s*70\s*,\s*229|167\s*,\s*139\s*,\s*250|91\s*,\s*61\s*,\s*240|47\s*,\s*38\s*,\s*99)/i,
  );
  assert.doesNotMatch(visualSource, /--color-brand-violet|--color-ultra-violet/);
});

test("preserva acessibilidade de movimento e adaptacao mobile", () => {
  assert.match(designSystem, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  assert.match(designSystem, /@media\s*\(max-width:\s*768px\)/);
  assert.match(loginStyles, /@media\s*\(max-width:\s*520px\)/);
});

test("mantem o login rolavel apenas quando o conteudo realmente excede a viewport", () => {
  assert.match(loginStyles, /body:has\(\.login-screen\)\s*\{[^}]*overflow:\s*hidden/);
  assert.match(loginStyles, /body:has\(\.login-screen\) > \.main\s*\{[\s\S]*?margin:\s*0/);
  assert.match(loginStyles, /\.login-screen\s*\{[\s\S]*?overflow-x:\s*hidden/);
  assert.match(loginStyles, /\.login-screen\s*\{[\s\S]*?overflow-y:\s*auto/);
  assert.match(loginStyles, /\.login-orbit\s*\{[^}]*position:\s*fixed/);
});
