import fs from "node:fs";
import path from "node:path";
import { createAdminSession } from "../src/lib/adminAuth.ts";

const cdpUrl = process.env.CRM_SMOKE_CDP_URL || "http://127.0.0.1:9223";
const appUrl = process.env.CRM_SMOKE_APP_URL || "http://127.0.0.1:3107";
const outputDir = process.env.TEMP || "D:/tmp";
const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

if (!process.env.CRM_ADMIN_EMAIL || !process.env.CRM_AUTH_SECRET) {
  throw new Error("CRM_ADMIN_EMAIL e CRM_AUTH_SECRET sao obrigatorias para o smoke visual.");
}
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY sao obrigatorias para limpar o fixture.");
}

const token = await createAdminSession({
  email: process.env.CRM_ADMIN_EMAIL,
  secret: process.env.CRM_AUTH_SECRET,
});
const cookie = `crm_admin_session=${token}`;
let automationId = null;
let socket = null;

async function api(relative, options = {}) {
  const response = await fetch(`${appUrl}${relative}`, {
    ...options,
    headers: { Cookie: cookie, "Content-Type": "application/json", ...(options.headers ?? {}) },
  });
  const body = await response.json();
  if (!response.ok || !body.ok) throw new Error(`${relative}: ${body.error ?? `HTTP ${response.status}`}`);
  return body;
}

async function cleanupFixture() {
  if (!automationId) return;
  const headers = {
    apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
    Prefer: "return=minimal",
  };
  const testRuns = await fetch(
    `${process.env.SUPABASE_URL}/rest/v1/email_automation_test_runs?automation_id=eq.${automationId}`,
    { method: "DELETE", headers },
  );
  if (!testRuns.ok) throw new Error(`Falha ao limpar test runs do fixture: HTTP ${testRuns.status}`);
  const automation = await fetch(
    `${process.env.SUPABASE_URL}/rest/v1/email_automations?id=eq.${automationId}&created_by=eq.${encodeURIComponent(process.env.CRM_ADMIN_EMAIL)}`,
    { method: "DELETE", headers },
  );
  if (!automation.ok) throw new Error(`Falha ao limpar automacao fixture: HTTP ${automation.status}`);
}

async function openPage(url) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(`${cdpUrl}/json/new?${encodeURIComponent(url)}`, { method: "PUT" });
      if (response.ok) return response.json();
    } catch {}
    await sleep(250);
  }
  throw new Error("Chrome CDP indisponivel para o smoke visual.");
}

try {
  const created = await api("/api/email-automations", {
    method: "POST",
    body: JSON.stringify({ name: "[SMOKE] Editor visual Story 047", description: "Fixture temporario de validacao visual." }),
  });
  automationId = created.automation.id;

  const graph = {
    nodes: [
      { id: "trigger-1", type: "automationNode", position: { x: 80, y: 230 }, data: { kind: "trigger.email_received", label: "E-mail recebido", config: {} } },
      { id: "rule-1", type: "automationNode", position: { x: 390, y: 230 }, data: { kind: "rule.has_email", label: "Contato possui e-mail", config: {} } },
      { id: "action-1", type: "automationNode", position: { x: 700, y: 230 }, data: { kind: "action.email_draft", label: "Criar rascunho", config: { subject: "Retorno sobre {{deal.company}}", body: "Ola {{contact.name}}" } } },
    ],
    edges: [
      { id: "edge-1", source: "trigger-1", target: "rule-1" },
      { id: "edge-2", source: "rule-1", target: "action-1" },
    ],
    viewport: { x: 0, y: 0, zoom: 0.86 },
  };
  const seeded = await api(`/api/email-automations/${automationId}`, {
    method: "PATCH",
    body: JSON.stringify({
      action: "save",
      expectedVersion: created.automation.version,
      name: created.automation.name,
      description: created.automation.description,
      status: "draft",
      graph,
    }),
  });

  const page = await openPage(`${appUrl}/automacoes?automation=${automationId}`);
  socket = new WebSocket(page.webSocketDebuggerUrl);
  const pending = new Map();
  const requests = [];
  const diagnostics = [];
  let sequence = 0;

  socket.addEventListener("message", async (event) => {
    const raw = typeof event.data === "string" ? event.data : await event.data.text();
    const message = JSON.parse(raw);
    if (message.method === "Network.requestWillBeSent") requests.push(message.params?.request?.url ?? "");
    if (message.method === "Runtime.exceptionThrown") {
      diagnostics.push(message.params?.exceptionDetails?.exception?.description ?? message.params?.exceptionDetails?.text ?? "Runtime exception");
    }
    if (message.method === "Log.entryAdded" && message.params?.entry?.level === "error") diagnostics.push(message.params.entry.text);
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
  await send("Runtime.enable");
  await send("Log.enable");
  await send("Page.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await send("Network.setCookie", { name: "crm_admin_session", value: token, url: appUrl, httpOnly: true, sameSite: "Lax" });
  await send("Page.navigate", { url: `${appUrl}/automacoes?automation=${automationId}` });

  let ready = false;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const result = await send("Runtime.evaluate", {
      expression: `document.querySelectorAll('.automation-node').length === 3 && document.querySelector('.automation-editor-shell') !== null`,
      returnByValue: true,
    });
    if (result.result.value) { ready = true; break; }
    await sleep(250);
  }
  if (!ready) throw new Error(`Editor nao renderizou tres nodes. Diagnosticos: ${diagnostics.slice(-5).join(" | ")}`);

  const layout = await send("Runtime.evaluate", {
    expression: `(() => {
      const shell = document.querySelector('.automation-editor-shell');
      const palette = document.querySelector('.automation-palette');
      const canvas = document.querySelector('.automation-canvas-column');
      const inspector = document.querySelector('.automation-inspector');
      const locked = [...document.querySelectorAll('.automation-palette-item')].find((item) => item.textContent.includes('Enviar e-mail'));
      return {
        shellDisplay: getComputedStyle(shell).display,
        shellWidth: Math.round(shell.getBoundingClientRect().width),
        paletteWidth: Math.round(palette.getBoundingClientRect().width),
        canvasWidth: Math.round(canvas.getBoundingClientRect().width),
        inspectorWidth: Math.round(inspector.getBoundingClientRect().width),
        nodes: document.querySelectorAll('.automation-node').length,
        edges: document.querySelectorAll('.react-flow__edge').length,
        lockedSend: Boolean(locked?.disabled),
        hasActivation: document.body.innerText.includes('Ativar automacao'),
        overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      };
    })()`,
    returnByValue: true,
  });
  const desktop = layout.result.value;
  const failures = [];
  if (desktop.shellDisplay !== "grid") failures.push(`shell display=${desktop.shellDisplay}`);
  if (desktop.canvasWidth < 500) failures.push(`canvas estreito=${desktop.canvasWidth}`);
  if (desktop.paletteWidth < 220 || desktop.inspectorWidth < 220) failures.push("paineis laterais estreitos");
  if (desktop.nodes !== 3 || desktop.edges !== 2) failures.push(`grafo ${desktop.nodes} nodes/${desktop.edges} edges`);
  if (!desktop.lockedSend) failures.push("envio nao esta bloqueado na paleta");
  if (desktop.hasActivation) failures.push("interface exibe ativacao proibida");
  if (desktop.overflowX) failures.push("desktop com overflow horizontal");

  const desktopShot = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  const desktopPath = path.join(outputDir, "crm-erick-automacoes-editor-desktop.png");
  fs.writeFileSync(desktopPath, Buffer.from(desktopShot.data, "base64"));

  await send("Runtime.evaluate", {
    expression: `[...document.querySelectorAll('.automation-editor-actions button')].find((item) => item.textContent.trim() === 'Testar')?.click()`,
    returnByValue: true,
  });
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const drawer = await send("Runtime.evaluate", { expression: `Boolean(document.querySelector('.automation-test-drawer'))`, returnByValue: true });
    if (drawer.result.value) break;
    await sleep(200);
  }
  await send("Runtime.evaluate", {
    expression: `document.querySelector('.automation-test-drawer .automation-button.primary.wide')?.click()`,
    returnByValue: true,
  });

  let traceCount = 0;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const trace = await send("Runtime.evaluate", {
      expression: `document.querySelectorAll('.automation-test-result li').length`,
      returnByValue: true,
    });
    traceCount = trace.result.value;
    if (traceCount === 3) break;
    await sleep(250);
  }
  if (traceCount !== 3) failures.push(`simulacao retornou ${traceCount} etapas`);
  const testShot = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  const testPath = path.join(outputDir, "crm-erick-automacoes-teste-desktop.png");
  fs.writeFileSync(testPath, Buffer.from(testShot.data, "base64"));

  await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await sleep(600);
  const mobileLayout = await send("Runtime.evaluate", {
    expression: `({
      overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      paletteVisible: document.querySelector('.automation-palette')?.getBoundingClientRect().height > 150,
      canvasVisible: document.querySelector('.automation-canvas-column')?.getBoundingClientRect().height > 400,
    })`,
    returnByValue: true,
  });
  if (mobileLayout.result.value.overflowX) failures.push("mobile com overflow horizontal na pagina");
  if (!mobileLayout.result.value.paletteVisible || !mobileLayout.result.value.canvasVisible) failures.push("mobile esconde paleta ou canvas");
  const mobileShot = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  const mobilePath = path.join(outputDir, "crm-erick-automacoes-editor-mobile.png");
  fs.writeFileSync(mobilePath, Buffer.from(mobileShot.data, "base64"));

  const externalEffects = requests.filter((url) => /api\.brevo|improvmx|gmail\.google|sendinblue/i.test(url));
  if (externalEffects.length) failures.push(`efeito externo detectado: ${externalEffects.join(", ")}`);
  if (diagnostics.length) failures.push(`erros no navegador: ${diagnostics.slice(-5).join(" | ")}`);

  console.log(JSON.stringify({
    ok: failures.length === 0,
    failures,
    seededVersion: seeded.automation.version,
    layout: desktop,
    mobile: mobileLayout.result.value,
    traceCount,
    externalEffects: externalEffects.length,
    screenshots: [desktopPath, testPath, mobilePath],
  }, null, 2));
  if (failures.length) process.exitCode = 1;
} finally {
  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ id: 999999, method: "Browser.close", params: {} }));
    await sleep(150);
    socket.close();
  }
  await cleanupFixture();
}
