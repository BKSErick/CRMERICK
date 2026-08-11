import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  QUALIFICATION_FIELD_DEFINITIONS,
  applyQualificationMutation,
  normalizeDealQualification,
  parseQualificationSuggestions,
  summarizeDealQualification,
} from "../src/lib/dealQualification.mjs";
import { updateDealQualification } from "../src/lib/dealQualificationService.mjs";
import { parseDealQualificationArgs } from "../scripts/deal-qualification.mjs";

const NOW = "2026-08-11T15:00:00.000Z";

test("deal legado permanece nao qualificado sem preenchimento inventado", () => {
  const qualification = normalizeDealQualification(null);
  const summary = summarizeDealQualification(qualification);

  assert.equal(QUALIFICATION_FIELD_DEFINITIONS.length, 7);
  assert.equal(summary.completeness, 0);
  assert.equal(summary.confirmedCount, 0);
  assert.equal(summary.suggestedCount, 0);
  assert.equal(summary.pendingFields.length, 7);
  assert.ok(Object.values(qualification.fields).every((field) => field.status === "not_informed"));
});

test("sugestao da IA preserva evidencia e nunca vira confirmacao", () => {
  const qualification = applyQualificationMutation(null, {
    action: "suggest",
    suggestions: {
      problem: {
        value: "Pedidos chegam sem escopo suficiente.",
        evidence: { text: "Cliente relatou retrabalho no WhatsApp.", origin: "messages" },
      },
      impact: {
        value: "Tempo perdido para qualificar cada pedido.",
        evidence: { text: "Atividade registrada apos a reuniao.", origin: "activities" },
      },
    },
  }, { actor: "ai:groq/llama", at: NOW });

  assert.equal(qualification.fields.problem.status, "suggested");
  assert.equal(qualification.fields.problem.source, "ai");
  assert.equal(qualification.fields.problem.updatedBy, "ai:groq/llama");
  assert.deepEqual(qualification.fields.problem.evidence, {
    text: "Cliente relatou retrabalho no WhatsApp.",
    origin: "messages",
  });
  assert.equal(summarizeDealQualification(qualification).completeness, 0);
});

test("sugestao posterior nao sobrescreve valor confirmado pelo operador", () => {
  const confirmed = applyQualificationMutation(null, {
    action: "confirm",
    field: "urgency",
    value: "Resolver antes da feira de setembro.",
    evidence: { text: "Confirmado em ligacao.", origin: "operator" },
  }, { actor: "Erick", at: NOW });

  const afterSuggestion = applyQualificationMutation(confirmed, {
    action: "suggest",
    suggestions: {
      urgency: {
        value: "Sem prazo definido.",
        evidence: { text: "Nao encontrei data nas mensagens.", origin: "messages" },
      },
    },
  }, { actor: "ai:openrouter/gemini", at: "2026-08-11T16:00:00.000Z" });

  assert.deepEqual(afterSuggestion.fields.urgency, confirmed.fields.urgency);
});

test("confirmacao e correcao manual registram autoria e data", () => {
  const suggested = applyQualificationMutation(null, {
    action: "suggest",
    suggestions: {
      investmentCapacity: {
        value: "Ainda nao informado.",
        evidence: { text: "Nao houve conversa de investimento.", origin: "messages" },
      },
    },
  }, { actor: "ai:groq/llama", at: NOW });

  const confirmed = applyQualificationMutation(suggested, {
    action: "confirm",
    field: "investmentCapacity",
    value: "Pode investir ate R$ 3.000 nesta etapa.",
    evidence: { text: "Valor confirmado pelo decisor.", origin: "operator" },
  }, { actor: "Erick", at: "2026-08-11T17:00:00.000Z" });

  assert.equal(confirmed.fields.investmentCapacity.status, "confirmed");
  assert.equal(confirmed.fields.investmentCapacity.source, "operator");
  assert.equal(confirmed.fields.investmentCapacity.updatedBy, "Erick");
  assert.equal(confirmed.fields.investmentCapacity.updatedAt, "2026-08-11T17:00:00.000Z");
  assert.equal(summarizeDealQualification(confirmed).completeness, 14);
});

test("limpeza mantem a autoria da alteracao sem manter valor ou evidencia", () => {
  const confirmed = applyQualificationMutation(null, {
    action: "confirm",
    field: "recommendedOffer",
    value: "Landing page industrial.",
  }, { actor: "Erick", at: NOW });
  const cleared = applyQualificationMutation(confirmed, {
    action: "clear",
    field: "recommendedOffer",
  }, { actor: "Erick", at: "2026-08-11T18:00:00.000Z" });

  assert.deepEqual(cleared.fields.recommendedOffer, {
    status: "not_informed",
    value: null,
    source: "operator",
    evidence: null,
    updatedAt: "2026-08-11T18:00:00.000Z",
    updatedBy: "Erick",
  });
});

test("parser aceita somente campos e evidencias validos da resposta estruturada", () => {
  const parsed = parseQualificationSuggestions(`\`\`\`json
  {"fields":{"problem":{"value":"Baixa conversao.","evidence":{"text":"Lead disse que recebe visitas sem contato.","origin":"messages"}},"unknown":{"value":"ignorar"}}}
  \`\`\``);
  assert.deepEqual(Object.keys(parsed), ["problem"]);
  assert.throws(() => parseQualificationSuggestions("sem json"), /JSON valido/i);
  assert.throws(
    () => parseQualificationSuggestions('{"fields":{"problem":{"value":"sem evidencia"}}}'),
    /evidencia/i,
  );
});

test("CLI consulta deal e relatorio de pendencias sem modo de escrita", () => {
  assert.deepEqual(parseDealQualificationArgs(["--deal-id=29", "--pending-only"]), {
    dealId: 29,
    pendingOnly: true,
    stage: null,
  });
  assert.equal(parseDealQualificationArgs([]).pendingOnly, false);
  assert.throws(() => parseDealQualificationArgs(["--stage=won"]), /etapa invalida/i);
});

test("migration, APIs e superficies existentes compartilham qualificacao", () => {
  const migration = readFileSync(new URL("../scripts/migrations/20260811_deal_qualification.sql", import.meta.url), "utf8");
  const schema = readFileSync(new URL("../scripts/supabase-schema.sql", import.meta.url), "utf8");
  const dealsRoute = readFileSync(new URL("../src/app/api/deals/route.ts", import.meta.url), "utf8");
  const aiRoute = readFileSync(new URL("../src/app/api/ai/route.ts", import.meta.url), "utf8");
  const automation = readFileSync(new URL("../src/lib/commercialAutomation.mjs", import.meta.url), "utf8");
  const pipeline = readFileSync(new URL("../src/app/pipeline/page.tsx", import.meta.url), "utf8");
  const comandoRoute = readFileSync(new URL("../src/app/api/comando/route.ts", import.meta.url), "utf8");
  const comandoPage = readFileSync(new URL("../src/app/comando/page.tsx", import.meta.url), "utf8");

  assert.match(migration, /add column if not exists qualification jsonb/i);
  assert.match(migration, /qualification_revision integer/i);
  assert.match(schema, /qualification jsonb not null default '\{\}'::jsonb/i);
  assert.match(dealsRoute, /qualificationMutation/);
  assert.match(aiRoute, /suggest-qualification/);
  assert.match(automation, /deal\.qualification_updated/);
  assert.match(pipeline, /Qualificacao consultiva/);
  assert.match(pipeline, /Confirmar como operador/);
  assert.match(comandoRoute, /qualificationReview/);
  assert.match(comandoPage, /Lacunas de qualificacao/);
  assert.doesNotMatch(pipeline, /href=["']\/qualificacao/);
});

test("mapeamento expoe qualificacao normalizada sem permitir escrita generica", () => {
  const source = readFileSync(new URL("../src/lib/crmRecords.ts", import.meta.url), "utf8");
  assert.match(source, /normalizeDealQualification\(row\.qualification\)/);
  assert.doesNotMatch(source, /qualification:\s*deal\.qualification/);
});

test("servico persiste documento validado, audita e publica somente evento seguro", async () => {
  const state = {
    deal: { id: 29, stage: "qualified", qualification: {} as Record<string, unknown>, qualification_revision: 0 },
    activities: [] as Array<Record<string, unknown>>,
    events: [] as Array<Record<string, unknown>>,
  };
  const supabase = {
    from(table: string) {
      return {
        select() {
          const builder = {
            eq() { return builder; },
            single: async () => ({ data: { ...state.deal }, error: null }),
          };
          return builder;
        },
        update(payload: Record<string, unknown>) {
          Object.assign(state.deal, payload);
          const builder = {
            eq() { return builder; },
            select() { return builder; },
            single: async () => ({ data: { ...state.deal }, error: null }),
          };
          return builder;
        },
        insert(payload: Record<string, unknown>) {
          if (table === "activities") state.activities.push(payload);
          return Promise.resolve({ error: null });
        },
      };
    },
  };

  const result = await updateDealQualification(supabase, 29, {
    action: "confirm",
    field: "problem",
    value: "Orcamentos chegam incompletos.",
  }, {
    actor: "Erick",
    at: NOW,
    dispatchEvent: async (_client: unknown, event: Record<string, unknown>) => {
      state.events.push(event);
      return { failed: false };
    },
  });

  assert.equal(result.summary.completeness, 14);
  assert.equal(state.activities.length, 1);
  assert.equal(state.activities[0].type, "qualification_confirmed");
  assert.equal(state.events.length, 1);
  assert.equal(state.events[0].type, "deal.qualification_updated");
});

test("servico falha claramente quando outra edicao vence a revisao otimista", async () => {
  const supabase = {
    from(table: string) {
      return {
        select() {
          const builder = {
            eq() { return builder; },
            single: async () => ({
              data: { id: 30, stage: "qualified", qualification: {}, qualification_revision: 4 },
              error: null,
            }),
          };
          return builder;
        },
        update() {
          const builder = {
            eq() { return builder; },
            select() { return builder; },
            single: async () => ({ data: null, error: { code: "PGRST116", message: "0 rows" } }),
          };
          return builder;
        },
        insert() {
          assert.notEqual(table, "activities", "conflito nao pode gerar auditoria falsa");
          return Promise.resolve({ error: null });
        },
      };
    },
  };

  await assert.rejects(
    () => updateDealQualification(supabase, 30, {
      action: "confirm",
      field: "impact",
      value: "Perda de tempo comercial.",
    }, { actor: "Erick", at: NOW }),
    /alterado por outra operacao/i,
  );
});
