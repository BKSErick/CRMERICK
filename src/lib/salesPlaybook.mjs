import SALES_PLAYBOOK from "../../content/sales-playbook.json" with { type: "json" };

export { SALES_PLAYBOOK };

function foldText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function stableBucket(value, buckets) {
  let hash = 2166136261;
  for (const character of String(value)) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % buckets;
}

function detectVariantFromCopy(copyText) {
  const text = String(copyText ?? "").trim();
  if (/^fala!/i.test(text)) return "B";
  if (/^oi,?\s*tudo bem\?/i.test(text)) return "A";
  return null;
}

function copyAssignmentForLead(input) {
  const variants = SALES_PLAYBOOK.experiment.variants;
  const detected = detectVariantFromCopy(input.copyText);
  const identity = input.id ?? input.company ?? "lead-sem-identidade";
  const variant = detected ?? variants[stableBucket(identity, variants.length)];
  return {
    copyVersion: SALES_PLAYBOOK.copyVersion,
    offerVersion: SALES_PLAYBOOK.offer.version,
    experimentId: SALES_PLAYBOOK.experiment.id,
    variant,
  };
}

function shortCompany(value) {
  const words = String(value ?? "").split(/[|\-–,]/)[0].trim().split(/\s+/);
  const connector = words.findIndex((word) => /^(e|de|da|do|das|dos|em|com|para|pra|&)$/i.test(word));
  const end = connector > 0 ? Math.min(connector, 4) : 4;
  return words.slice(0, end).join(" ") || String(value ?? "empresa");
}

function segmentDescription(segment) {
  return segment === "usinagem" || segment === "caldeiraria"
    ? "metalurgia e usinagem de precisão"
    : "manutenção industrial";
}

function isLocal(city) {
  return foldText(city).includes("monlevade");
}

function interpolate(template, values) {
  return Object.entries(values).reduce(
    (result, [key, value]) => result.replaceAll(`{{${key}}}`, String(value)),
    template,
  );
}

function renderFollowupMessage(input) {
  const company = shortCompany(input.company);
  const values = {
    company,
    mechanism: SALES_PLAYBOOK.mechanism,
    segmentDescription: segmentDescription(input.segment),
  };
  if (input.responseType === "bot") {
    return interpolate(SALES_PLAYBOOK.followups.bot, values);
  }
  if (input.tier === "M1") return interpolate(SALES_PLAYBOOK.followups.M1, values);
  if (input.tier === "M2") {
    const template = isLocal(input.city)
      ? SALES_PLAYBOOK.followups.M2Local
      : SALES_PLAYBOOK.followups.M2Remote;
    return interpolate(template, values);
  }
  return interpolate(SALES_PLAYBOOK.followups.M3, values);
}

function activityExperimentMetadata(assignment, extra = {}) {
  return {
    ...extra,
    copy_version: assignment.copyVersion,
    copy_variant: assignment.variant,
    offer_version: assignment.offerVersion,
    experiment_id: assignment.experimentId,
  };
}

const salesPlaybookModule = {
  SALES_PLAYBOOK,
  activityExperimentMetadata,
  copyAssignmentForLead,
  detectVariantFromCopy,
  isLocal,
  renderFollowupMessage,
  shortCompany,
};

export {
  activityExperimentMetadata,
  copyAssignmentForLead,
  detectVariantFromCopy,
  isLocal,
  renderFollowupMessage,
  shortCompany,
};

export default salesPlaybookModule;
