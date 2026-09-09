import fs from "node:fs";
import path from "node:path";

const cdpUrl = process.env.LOGIN_SMOKE_CDP_URL || "http://127.0.0.1:9224";
const appUrl = process.env.SMOKE_APP_URL || "http://localhost:3107";
const outputDir = process.env.TEMP || "D:/tmp";
const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function openPage() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(`${cdpUrl}/json/new?${appUrl}/login`, { method: "PUT" });
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

await send("Page.enable");
await send("Runtime.enable");

async function inspect(width, height, mobile) {
  await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: mobile ? 2 : 1, mobile });
  await send("Page.navigate", { url: `${appUrl}/login` });
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const ready = await send("Runtime.evaluate", {
      expression: "Boolean(document.querySelector('.login-card'))",
      returnByValue: true,
    });
    if (ready.result.value) break;
    await sleep(250);
  }
  await sleep(300);
  const result = await send("Runtime.evaluate", {
    expression: `(() => {
      const root = document.documentElement;
      const screen = document.querySelector('.login-screen');
      return {
        viewport: [innerWidth, innerHeight],
        document: [root.clientWidth, root.scrollWidth, root.clientHeight, root.scrollHeight],
        login: [screen.clientWidth, screen.scrollWidth, screen.clientHeight, screen.scrollHeight],
        bodyOverflow: getComputedStyle(document.body).overflow,
        overflowX: root.scrollWidth > root.clientWidth + 1 || screen.scrollWidth > screen.clientWidth + 1,
      };
    })()`,
    returnByValue: true,
  });
  return result.result.value;
}

const desktop = await inspect(1440, 900, false);
const screenshot = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
const screenshotPath = path.join(outputDir, "mydrion-crm-login-scroll-fixed.png");
fs.writeFileSync(screenshotPath, Buffer.from(screenshot.data, "base64"));
const mobile = await inspect(390, 844, true);

const failures = [];
if (desktop.overflowX) failures.push("desktop ainda possui overflow horizontal");
if (mobile.overflowX) failures.push("mobile ainda possui overflow horizontal");
if (desktop.document[3] > desktop.document[2] + 1) failures.push("documento desktop ainda possui scroll vertical externo");
if (desktop.login[3] > desktop.login[2] + 1) failures.push("login desktop ainda possui scroll vertical decorativo");
if (desktop.bodyOverflow !== "hidden" || mobile.bodyOverflow !== "hidden") failures.push("body do login nao esta isolado");

console.log(JSON.stringify({ ok: failures.length === 0, failures, desktop, mobile, screenshot: screenshotPath }, null, 2));
await send("Browser.close");
if (failures.length > 0) process.exit(1);
