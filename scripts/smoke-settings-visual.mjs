import fs from "node:fs";
import path from "node:path";
import { createAdminSession } from "../src/lib/adminAuth.ts";

// Smoke visual da tela de Configuracoes. Confere que as classes de layout realmente
// aplicam (a pagina caiu em texto corrido porque .pref-row e .source-card nunca
// existiram no CSS) e tira print em desktop e mobile.
//
// Pre-requisitos, iguais aos outros smokes visuais do repo:
//   1. dev server em 127.0.0.1:3107 com CRM_AUTH_SECRET=0123456789abcdef0123456789abcdef
//   2. Chrome com --remote-debugging-port=9223

const cdpUrl = "http://127.0.0.1:9223";
// localhost, nao 127.0.0.1: em dev o Next bloqueia os recursos cross-origin quando o
// host nao bate com o configurado, a hidratacao morre e nenhum useEffect roda (as
// automacoes ficariam eternamente em "Carregando").
const appUrl = process.env.SMOKE_APP_URL || "http://localhost:3107";
const outputDir = process.env.TEMP || "D:/tmp";
const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function openPage() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(`${cdpUrl}/json/new?${appUrl}/configuracoes`, { method: "PUT" });
      if (response.ok) return response.json();
    } catch {}
    await sleep(250);
  }
  throw new Error("Chrome CDP indisponivel.");
}

const page = await openPage();
const socket = new WebSocket(page.webSocketDebuggerUrl);
const pending = new Map();
let sequence = 0;

socket.addEventListener("message", async (event) => {
  const raw = typeof event.data === "string" ? event.data : await event.data.text();
  const message = JSON.parse(raw);
  const request = pending.get(message.id);
  if (!request) return;
  pending.delete(message.id);
  if (message.error) request.reject(new Error(message.error.message));
  else request.resolve(message.result);
});

await new Promise((resolve, reject) => {
  if (socket.readyState === WebSocket.OPEN) return resolve();
  socket.addEventListener("open", resolve, { once: true });
  socket.addEventListener("error", reject, { once: true });
});

function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++sequence;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
}

await send("Network.enable");
await send("Page.enable");
await send("Runtime.enable");
// A sessao precisa bater com o que o dev server valida: o proxy compara o e-mail do
// token com CRM_ADMIN_EMAIL. Por isso lemos do mesmo .env em vez de chutar um e-mail.
const token = await createAdminSession({
  email: process.env.CRM_ADMIN_EMAIL || "admin@example.invalid",
  secret: process.env.CRM_AUTH_SECRET || "0123456789abcdef0123456789abcdef",
});
await send("Network.setCookie", { name: "crm_admin_session", value: token, url: appUrl, httpOnly: true, sameSite: "Lax" });
await send("Page.navigate", { url: `${appUrl}/configuracoes` });

let ready = false;
for (let attempt = 0; attempt < 80; attempt += 1) {
  const result = await send("Runtime.evaluate", {
    expression: `Boolean(document.querySelector('.source-card') && document.querySelector('.pref-row'))`,
    returnByValue: true,
  });
  if (result.result.value) { ready = true; break; }
  await sleep(500);
}
if (!ready) throw new Error("Tela de configuracoes nao renderizou os cards e as linhas de preferencia.");

// Viewport desktop ANTES de medir: a janela padrao do CDP e estreita e cai no media
// query de 768px, o que faria a checagem de "linha" falhar por motivo errado.
await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1200, deviceScaleFactor: 1, mobile: false });
await sleep(400);

// As regras de automacao vem da API; espera elas pintarem antes de conferir as etiquetas.
// Cuidado: o proprio "Carregando..." e um .connection-status, entao esperar por ele
// daria pronto na hora. So conta regra pintada ou estado final de vazio/erro.
for (let attempt = 0; attempt < 60; attempt += 1) {
  const result = await send("Runtime.evaluate", {
    expression: `(() => {
      if (document.querySelector('.rule-badge')) return true;
      const status = document.querySelector('#automacoes .connection-status')?.textContent ?? '';
      return status.includes('Nenhuma regra') || status.includes('Nao foi possivel');
    })()`,
    returnByValue: true,
  });
  if (result.result.value) break;
  await sleep(500);
}

// O bug original era layout: .pref-row precisa ser uma linha de verdade (label a
// esquerda, controle a direita) e o toggle precisa ter tamanho. Se qualquer um falhar,
// o CSS regrediu de novo.
const layout = await send("Runtime.evaluate", {
  expression: `(() => {
    const row = document.querySelector('.pref-row');
    const rowStyle = getComputedStyle(row);
    const toggle = document.querySelector('.toggle');
    const toggleBox = toggle?.getBoundingClientRect();
    const card = document.querySelector('.source-card');
    const cardStyle = card ? getComputedStyle(card) : null;
    const grid = document.querySelector('.sources-grid');
    const title = document.querySelector('.settings-section-title');
    return {
      rowDisplay: rowStyle.display,
      rowDirection: rowStyle.flexDirection,
      rowJustify: rowStyle.justifyContent,
      toggleWidth: toggleBox ? Math.round(toggleBox.width) : 0,
      toggleHeight: toggleBox ? Math.round(toggleBox.height) : 0,
      cardHasBorder: cardStyle ? cardStyle.borderTopWidth !== '0px' : false,
      gridDisplay: grid ? getComputedStyle(grid).display : null,
      titleWeight: title ? getComputedStyle(title).fontWeight : null,
      ruleBadges: document.querySelectorAll('.rule-badge').length,
      ruleRows: document.querySelectorAll('#automacoes .pref-row').length,
      automationFallback: document.querySelector('#automacoes .connection-status')?.textContent?.trim() ?? null,
      activeNavItem: document.querySelector('.settings-panel-item.active')?.textContent?.trim() ?? null,
      overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    };
  })()`,
  returnByValue: true,
});

const value = layout.result.value;
const failures = [];
if (value.rowDisplay !== "flex") failures.push(`pref-row display=${value.rowDisplay}`);
if (value.rowDirection !== "row") failures.push(`pref-row direction=${value.rowDirection}`);
if (value.toggleWidth < 30 || value.toggleHeight < 15) failures.push(`toggle invisivel ${value.toggleWidth}x${value.toggleHeight}`);
if (!value.cardHasBorder) failures.push("source-card sem borda");
if (value.gridDisplay !== "grid") failures.push(`sources-grid display=${value.gridDisplay}`);
if (value.overflowX) failures.push("pagina rola na horizontal");

const desktop = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
const desktopPath = path.join(outputDir, "crm-erick-configuracoes-desktop.png");
fs.writeFileSync(desktopPath, Buffer.from(desktop.data, "base64"));

await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
await sleep(500);
const mobileLayout = await send("Runtime.evaluate", {
  expression: `(() => {
    const row = document.querySelector('.pref-row');
    return {
      direction: getComputedStyle(row).flexDirection,
      overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    };
  })()`,
  returnByValue: true,
});
if (mobileLayout.result.value.direction !== "column") failures.push("mobile nao empilha a pref-row");
if (mobileLayout.result.value.overflowX) failures.push("mobile rola na horizontal");

const mobile = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
const mobilePath = path.join(outputDir, "crm-erick-configuracoes-mobile.png");
fs.writeFileSync(mobilePath, Buffer.from(mobile.data, "base64"));

console.log(JSON.stringify({ ok: failures.length === 0, failures, layout: value, screenshots: [desktopPath, mobilePath] }, null, 2));
await send("Browser.close");
if (failures.length > 0) process.exit(1);
