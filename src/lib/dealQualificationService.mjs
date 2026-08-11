import { createHash } from "node:crypto";

import { processCommercialEventBestEffort } from "./commercialAutomationService.mjs";
import {
  applyQualificationMutation,
  normalizeDealQualification,
  summarizeDealQualification,
} from "./dealQualification.mjs";

function changedFieldKeys(before, after) {
  return Object.keys(after.fields).filter(
    (key) => JSON.stringify(before.fields[key]) !== JSON.stringify(after.fields[key]),
  );
}

function activityType(action) {
  if (action === "suggest") return "qualification_suggested";
  if (action === "clear") return "qualification_cleared";
  return "qualification_confirmed";
}

function activityDescription(action, changedFields, summary) {
  const verb = action === "suggest" ? "Sugestoes registradas" : action === "clear" ? "Campo limpo" : "Campo confirmado";
  return `${verb} na qualificacao: ${changedFields.join(", ") || "sem alteracao"}. Completude ${summary.completeness}%.`;
}

export async function updateDealQualification(supabase, dealId, mutation, options = {}) {
  const id = Number(dealId);
  if (!Number.isInteger(id) || id <= 0) throw new Error("dealId valido e obrigatorio.");
  const actor = typeof options.actor === "string" && options.actor.trim() ? options.actor.trim() : "operador";
  const at = options.at ?? new Date().toISOString();

  const currentResult = await supabase
    .from("deals")
    .select("id, stage, qualification, qualification_revision")
    .eq("id", id)
    .single();
  if (currentResult.error) throw currentResult.error;

  const before = normalizeDealQualification(currentResult.data.qualification);
  const revision = Number(currentResult.data.qualification_revision ?? 0);
  const qualification = applyQualificationMutation(before, mutation, { actor, at });
  const changedFields = changedFieldKeys(before, qualification);
  const summary = summarizeDealQualification(qualification);
  if (changedFields.length === 0) {
    return { dealId: id, qualification, summary, changedFields, persisted: false };
  }

  const updated = await supabase
    .from("deals")
    .update({ qualification, qualification_revision: revision + 1 })
    .eq("id", id)
    .eq("qualification_revision", revision)
    .select("id, stage, qualification, qualification_revision")
    .single();
  if (updated.error?.code === "PGRST116") {
    throw new Error("O deal foi alterado por outra operacao. Recarregue e tente novamente.");
  }
  if (updated.error) throw updated.error;

  const action = String(mutation.action ?? "confirm");
  const audit = await supabase.from("activities").insert({
    deal_id: id,
    type: activityType(action),
    description: activityDescription(action, changedFields, summary),
    metadata: {
      qualification: true,
      action,
      actor,
      changed_fields: changedFields,
      completeness: summary.completeness,
      pending_fields: summary.pendingFields.map((field) => field.key),
    },
  });
  if (audit.error) {
    const rollback = await supabase
      .from("deals")
      .update({ qualification: before, qualification_revision: revision })
      .eq("id", id)
      .eq("qualification_revision", revision + 1);
    if (rollback.error) console.error("Falha ao reverter qualificacao sem auditoria:", rollback.error);
    throw audit.error;
  }

  const digest = createHash("sha256")
    .update(JSON.stringify({ id, action, at, changedFields, qualification }))
    .digest("hex")
    .slice(0, 20);
  const dispatchEvent = options.dispatchEvent ?? processCommercialEventBestEffort;
  await dispatchEvent(supabase, {
    id: `deal:${id}:qualification:${digest}`,
    type: "deal.qualification_updated",
    dealId: id,
    occurredAt: at,
    source: options.source ?? "qualification-service",
    payload: {
      action,
      actor,
      stage: updated.data.stage,
      changedFields,
      completeness: summary.completeness,
      pendingFields: summary.pendingFields.map((field) => field.key),
    },
  }, { apply: true });

  return { dealId: id, qualification, summary, changedFields, persisted: true };
}
