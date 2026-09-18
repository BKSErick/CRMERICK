import { getCrmSupabaseAdmin } from "../src/lib/crmSupabase.ts";
import { planAiQuery } from "../src/lib/aiQueryRouter.ts";
import { retrieveAiEvidence } from "../src/lib/aiRetrievalBroker.ts";

function questionFromArgs(argv) {
  const named = argv.find((value) => value.startsWith("--question="));
  const question = named ? named.slice("--question=".length) : argv.filter((value) => !value.startsWith("--")).join(" ");
  return question.trim();
}

async function main() {
  const question = questionFromArgs(process.argv.slice(2));
  if (!question) {
    console.error('Uso: npm run ai:query -- --question="Qual é minha prioridade hoje?"');
    process.exitCode = 2;
    return;
  }
  const plan = planAiQuery(question);
  const evidence = await retrieveAiEvidence(getCrmSupabaseAdmin(), plan);
  console.log(JSON.stringify({ ok: true, readOnly: true, question, plan, evidence }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : "Falha na consulta." }));
  process.exitCode = 1;
});
