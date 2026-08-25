/**
 * ai-model-doctor.mjs
 * Diagnostico da camada de IA: mostra quais modelos gratuitos estao VIVOS agora em cada
 * provedor, qual deles o CRM usaria, e faz uma chamada real pra provar que responde.
 *
 * Existe pra substituir o ritual antigo: quando um modelo free era descontinuado, era preciso
 * caçar o nome novo na documentacao do provedor e trocar na mao em varios arquivos. Agora o
 * catalogo e descoberto sozinho e este script e o que mostra o que esta acontecendo.
 *
 * USO:
 *   npm run ai:doctor              # catalogo + escolha + ping real
 *   npm run ai:doctor -- --all     # lista TODOS os modelos gratuitos descobertos
 *   npm run ai:doctor -- --no-ping # so o catalogo, sem gastar chamada
 */

import { AI_PROVIDERS, aiCompleteDetailed, describeFailures } from "../src/lib/aiProviders.mjs";
import { MAX_MODELS_PER_PROVIDER, discoverFreeModels, getProviderModels, rankModels } from "../src/lib/aiModelCatalog.mjs";

const MOSTRAR_TODOS = process.argv.includes("--all");
const PINGAR = !process.argv.includes("--no-ping");

function linha(char = "-") {
  console.log(char.repeat(72));
}

console.log("\nDIAGNOSTICO DA CAMADA DE IA DO CRM");
linha("=");

let algumProvedorVivo = false;

for (const provider of AI_PROVIDERS) {
  const key = provider.getKey();
  console.log(`\n${provider.name}`);
  linha();

  if (!key) {
    console.log("  chave:        AUSENTE");
    console.log(`  -> defina ${provider.name === "Groq" ? "GROQ_API_KEY" : "OPENROUTER_API_KEY"} no .env e na Vercel`);
    continue;
  }
  console.log(`  chave:        presente (${key.slice(0, 7)}...${key.slice(-4)})`);

  const override = process.env[`AI_${provider.name.toUpperCase()}_MODELS`];
  if (override) console.log(`  override:     AI_${provider.name.toUpperCase()}_MODELS=${override}  (vence a descoberta)`);

  let descobertos = [];
  try {
    descobertos = await discoverFreeModels(provider.name, key);
    console.log(`  catalogo:     ${descobertos.length} modelos gratuitos vivos`);
  } catch (error) {
    console.log(`  catalogo:     FALHOU (${error instanceof Error ? error.message : "erro desconhecido"})`);
    console.log("                a cascata vai usar cache ou a lista-semente");
  }

  if (MOSTRAR_TODOS && descobertos.length > 0) {
    for (const id of rankModels(provider.name, descobertos)) console.log(`                  ${id}`);
  }

  const fila = await getProviderModels(provider.name, key);
  if (fila.length === 0) {
    console.log("  fila:         VAZIA (nenhum modelo utilizavel)");
    continue;
  }
  algumProvedorVivo = true;
  console.log(`  fila (top ${MAX_MODELS_PER_PROVIDER}):  ${fila.join("  >  ")}`);
  console.log(`  escolhido:    ${fila[0]}`);
}

if (PINGAR) {
  console.log("\nPING REAL (chamada de verdade pela mesma cascata que o CRM usa)");
  linha("=");
  if (!algumProvedorVivo) {
    console.log("  pulado: nenhum provedor com modelo utilizavel.");
  } else {
    const inicio = Date.now();
    const { result, failures } = await aiCompleteDetailed(
      "Responda com uma unica palavra, sem pontuacao.",
      "Diga: ok",
      { timeoutMs: 30000 },
    );
    const ms = Date.now() - inicio;

    if (result) {
      console.log(`  OK  ${result.provider} / ${result.model}  (${ms}ms)`);
      console.log(`  resposta: ${result.content.slice(0, 120)}`);
      if (failures.length > 0) {
        console.log(`  tentativas descartadas antes de acertar: ${failures.length}`);
        for (const f of failures) console.log(`    - ${f.provider}${f.model ? `/${f.model}` : ""}: ${f.reason}${f.status ? ` (HTTP ${f.status})` : ""}`);
      }
    } else {
      console.log(`  FALHOU apos ${ms}ms`);
      console.log(`  causa: ${describeFailures(failures)}`);
      for (const f of failures) console.log(`    - ${f.provider}${f.model ? `/${f.model}` : ""}: ${f.reason}${f.status ? ` (HTTP ${f.status})` : ""} ${f.detail ? `| ${f.detail.slice(0, 120)}` : ""}`);
      process.exitCode = 1;
    }
  }
}

console.log("");
