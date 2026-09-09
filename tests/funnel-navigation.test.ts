import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

function read(relativePath: string) {
  const url = new URL(relativePath, import.meta.url);
  return existsSync(fileURLToPath(url)) ? readFileSync(url, "utf8") : "";
}

const subnav = read("../src/components/FunnelSubnav.tsx");
// O render das abas foi extraido pra Subnav.tsx quando a Lista ganhou a segunda
// subnavegacao (27/08/2026). FunnelSubnav segue dona das abas de Funis.
const subnavBase = read("../src/components/Subnav.tsx");
const navigation = read("../src/lib/navigation.ts");
const sidebar = read("../src/components/Sidebar.tsx");
const css = read("../src/app/globals.css");
const pages = ["funil", "analise", "sinais", "insights", "lab"].map((route) => ({
  route,
  source: read(`../src/app/${route}/page.tsx`),
}));

test("subnavegacao de Funis oferece as cinco abas reais na ordem aprovada", () => {
  const expectedTabs = [
    ["Visao geral", "/funil"],
    ["Analises", "/analise"],
    ["Sinais", "/sinais"],
    ["Achados", "/insights"],
    ["Lab", "/lab"],
  ];

  let cursor = -1;
  for (const [label, href] of expectedTabs) {
    const next = subnav.indexOf(`label: "${label}", href: "${href}"`);
    assert.ok(next > cursor, `${label} deve aparecer na ordem aprovada`);
    cursor = next;
  }

  // FunnelSubnav declara o rotulo; Subnav e quem o entrega como aria-label no <nav>.
  assert.match(subnav, /ariaLabel="Navegacao de Funis"/);
  assert.match(subnavBase, /aria-label=\{ariaLabel\}/);
  assert.match(subnavBase, /aria-current=\{active \? "page" : undefined\}/);
});

test("modulos filhos somem apenas da Sidebar e mantem Funis ativo", () => {
  for (const [label, href] of [
    ["Lab", "/lab"],
    ["Achados", "/insights"],
    ["Analise", "/analise"],
    ["Sinais", "/sinais"],
  ]) {
    const itemPattern = new RegExp(
      `label:\\s*"${label}",\\s*href:\\s*"${href}"[\\s\\S]*?parentModule:\\s*"funil"[\\s\\S]*?sidebar:\\s*false`,
    );
    assert.match(navigation, itemPattern);
  }

  assert.match(sidebar, /filter\(\(item\) => item\.group === group && item\.sidebar !== false\)/);
  assert.match(sidebar, /isNavItemActive\(item, pathname\)/);
  assert.match(navigation, /export function isNavItemActive/);
});

test("as cinco rotas compartilham a mesma subnavegacao", () => {
  for (const page of pages) {
    assert.match(page.source, /import \{ FunnelSubnav \} from "@\/components\/FunnelSubnav"/,
      `${page.route} deve importar FunnelSubnav`);
    assert.match(page.source, /<FunnelSubnav\s*\/>/, `${page.route} deve renderizar FunnelSubnav`);
  }
});

test("Visao geral remove abas decorativas e preserva filtros de fonte", () => {
  const funil = pages.find((page) => page.route === "funil")?.source ?? "";
  for (const obsolete of ["Winners na pratica", "Fluxo 7 automacoes", "Indicacao Landing"]) {
    assert.doesNotMatch(funil, new RegExp(obsolete));
  }
  for (const source of ["Consolidado", "Pipeline", "Instagram", "Facebook Pixel", "Google Analytics", "E-mail"]) {
    assert.match(funil, new RegExp(source));
  }
});

test("abas de e-mail e Google trocam o painel inteiro e escondem o placar herdado", () => {
  const funil = pages.find((page) => page.route === "funil")?.source ?? "";
  // Nenhuma das duas cabe no funil de 6 passos: entrega, bounce, impressao e
  // posicao media nao tem equivalente em alcance/cliques/vendas. Entao cada uma
  // substitui o painel em vez de forcar os dados no formato do outro.
  assert.match(funil, /activeSource === "email" \? <EmailFunnelPanel \/>/);
  assert.match(funil, /activeSource === "google" \? <GooglePanel \/>/);
  // O placar do topo segue a fonte ativa: mantido nessas abas, mostraria o numero
  // do consolidado sob o rotulo "Conversao total".
  assert.match(funil, /activeSource === "email" \|\| activeSource === "google" \? null : \(\s*<aside className="funnel-score">/);
});

test("links das subabas preservam o tratamento responsivo e o foco de teclado", () => {
  assert.match(css, /\.funnel-tabs a/);
  assert.match(css, /\.funnel-tabs a\.active/);
  assert.match(css, /\.funnel-tabs a:focus-visible/);
  assert.match(css, /\.funnel-tabs[\s\S]*?overflow-x:\s*auto/);
});
