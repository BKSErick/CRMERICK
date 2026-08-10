import { createHash } from "node:crypto";

export type ProspectingSlot = "morning" | "afternoon";

export type ProspectingManifest = {
  version: 1;
  date: string;
  slot: ProspectingSlot;
  cumulativeTarget: number;
  firstContactIds: number[];
  followupIds: number[];
  createdAt: string;
};

export type ProspectingApproval = {
  version: 1;
  date: string;
  slot: ProspectingSlot;
  manifestHash: string;
  approvedAt: string;
  consumedAt?: string;
};

export function cumulativeTargetForSlot(slot: ProspectingSlot) {
  return slot === "morning" ? 20 : 40;
}

export function remainingToTarget(sentToday: number, cumulativeTarget: number) {
  return Math.max(0, cumulativeTarget - Math.max(0, sentToday));
}

function canonicalManifest(manifest: ProspectingManifest) {
  return {
    version: manifest.version,
    date: manifest.date,
    slot: manifest.slot,
    cumulativeTarget: manifest.cumulativeTarget,
    firstContactIds: manifest.firstContactIds,
    followupIds: manifest.followupIds,
    createdAt: manifest.createdAt,
  };
}

export function manifestHash(manifest: ProspectingManifest) {
  return createHash("sha256").update(JSON.stringify(canonicalManifest(manifest))).digest("hex");
}

export function createProspectingApproval(
  manifest: ProspectingManifest,
  approvedAt = new Date().toISOString(),
): ProspectingApproval {
  return {
    version: 1,
    date: manifest.date,
    slot: manifest.slot,
    manifestHash: manifestHash(manifest),
    approvedAt,
  };
}

export function validateProspectingApproval(
  manifest: ProspectingManifest,
  approval: ProspectingApproval | null | undefined,
  currentDate: string,
): { ok: true } | { ok: false; reason: string } {
  if (!approval) return { ok: false, reason: "approval_missing" };
  if (manifest.date !== currentDate || approval.date !== currentDate) {
    return { ok: false, reason: "wrong_date" };
  }
  if (approval.slot !== manifest.slot) return { ok: false, reason: "wrong_slot" };
  if (approval.consumedAt) return { ok: false, reason: "already_consumed" };
  if (approval.manifestHash !== manifestHash(manifest)) {
    return { ok: false, reason: "manifest_changed" };
  }
  return { ok: true };
}
