import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(relativePath: string) {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

const page = source("src/app/reunioes/page.tsx");

test("o corte entre os dois cards e so o relogio, nunca o done", () => {
  const futuras = page.match(/const futuras = useMemo\([\s\S]*?\n  \);/)?.[0] ?? "";
  const passadas = page.match(/const passadas = useMemo\([\s\S]*?\n  \);/)?.[0] ?? "";

  assert.ok(futuras, "futuras deve existir");
  assert.ok(passadas, "passadas deve existir");
  assert.match(futuras, /new Date\(e\.starts_at\)\.getTime\(\) >= now/);
  assert.match(passadas, /new Date\(e\.starts_at\)\.getTime\(\) < now/);

  // A API grava done=true para held, no_show e cancelled. Usar done aqui jogava
  // reuniao futura marcada cedo para dentro do historico.
  for (const bloco of [futuras, passadas]) {
    assert.doesNotMatch(bloco, /\.done/);
  }
});

test("reuniao futura nao aceita desfecho", () => {
  const bloco = page.match(/const FUTURE_ACTIONS[\s\S]*?\n\};/)?.[0] ?? "";
  assert.ok(bloco, "FUTURE_ACTIONS deve existir");

  // So os alvos importam: held e no_show aparecem como chave (reuniao marcada cedo
  // por engano volta para agendada), mas nunca como acao oferecida.
  const alvos = [...bloco.matchAll(/\[([^\]]*)\]/g)].map((match) => match[1]).join(",");
  assert.doesNotMatch(alvos, /"held"/);
  assert.doesNotMatch(alvos, /"no_show"/);
  assert.match(alvos, /"confirmed"/);
  assert.match(alvos, /"cancelled"/);
});

test("reuniao passada aceita os tres desfechos e a linha do tempo tem botao", () => {
  const bloco = page.match(/const PAST_ACTIONS[\s\S]*?;/)?.[0] ?? "";
  for (const status of ["held", "no_show", "cancelled"]) {
    assert.match(bloco, new RegExp(`"${status}"`));
  }
  // Antes a Linha do Tempo era so leitura: pill e texto, sem nenhuma acao.
  assert.match(page, /renderActions\(event, PAST_ACTIONS\)/);
});

test("passada sem desfecho aparece como pendente e o historico nao fica escondido", () => {
  assert.match(page, /PENDING_STATUSES/);
  assert.match(page, /aguardando desfecho/);
  assert.match(page, /onlyPending/);
  assert.match(page, /Mostrar todas/);
});

test("o relogio da tela e recalculado, nao congelado na montagem", () => {
  assert.match(page, /setInterval\(\(\) => setNow\(Date\.now\(\)\)/);
  assert.match(page, /clearInterval/);
});

test("erro de acao nao trava a tela e a linha em voo fica desabilitada", () => {
  // setStatus("error") sem volta deixava o aviso preso para sempre.
  assert.match(page, /setActionError\(null\)/);
  assert.match(page, /savingId/);
  assert.match(page, /disabled=\{savingId === event\.id\}/);
});
