import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const pipelineSource = readFileSync(
  new URL("../src/app/pipeline/page.tsx", import.meta.url),
  "utf8",
);

test("modal do pipeline nao cria arrays dentro do seletor Zustand", () => {
  assert.doesNotMatch(
    pipelineSource,
    /useCRMStore\(\(state\)\s*=>\s*state\.deals\.map\(/,
    "seletores que criam arrays a cada snapshot causam loop de renderizacao",
  );
  assert.match(
    pipelineSource,
    /useMemo\(\s*\(\)\s*=>\s*storeDeals\.map\(/,
    "a lista derivada de empresas deve ser memoizada fora do seletor",
  );
});
