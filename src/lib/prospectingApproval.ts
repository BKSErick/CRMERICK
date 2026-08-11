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

/**
 * Marca do processo que esta com o lote na mao. Existe porque o disparo leva mais de
 * uma hora e a tarefa agendada reexecuta de 5 em 5 minutos: sem isso, ou dois runners
 * disparavam junto, ou (o que aconteceu em 11/08) o unico runner morria no meio e
 * ninguem terminava o lote.
 */
export type ProspectingLease = {
  pid: number;
  startedAt: string;
  attempt: number;
};

export type ProspectingApproval = {
  version: 1;
  date: string;
  slot: ProspectingSlot;
  manifestHash: string;
  approvedAt: string;
  /** Terminal: lote concluido ou abandonado depois de MAX_ATTEMPTS. Nao volta a rodar. */
  consumedAt?: string;
  completedAt?: string;
  abortedAt?: string;
  attempts?: number;
  lease?: ProspectingLease | null;
  lastError?: string;
};

/**
 * Teto de vida do lease. Casa com o "Stop task if it runs longer than" (3h) das tarefas:
 * passado isso o processo dono nao existe mais, mesmo que o PID tenha sido reciclado.
 */
export const LEASE_MAX_MINUTES = 180;

/** Tentativas por turno. Um lote que morre sempre no comeco nao pode queimar o teto do dia. */
export const MAX_ATTEMPTS = 4;

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

/**
 * `isRunnerAlive` deixa a checagem de processo com quem chama: esta lib tambem e
 * importada pelo app, e o app nao tem por que enxergar PID de nada. Sem o callback,
 * o lease so vence pela idade.
 */
export function validateProspectingApproval(
  manifest: ProspectingManifest,
  approval: ProspectingApproval | null | undefined,
  currentDate: string,
  options: { now?: Date; isRunnerAlive?: (pid: number) => boolean } = {},
): { ok: true; resuming: boolean } | { ok: false; reason: string } {
  if (!approval) return { ok: false, reason: "approval_missing" };
  if (manifest.date !== currentDate || approval.date !== currentDate) {
    return { ok: false, reason: "wrong_date" };
  }
  if (approval.slot !== manifest.slot) return { ok: false, reason: "wrong_slot" };
  if (approval.consumedAt) return { ok: false, reason: "already_consumed" };
  if (approval.manifestHash !== manifestHash(manifest)) {
    return { ok: false, reason: "manifest_changed" };
  }
  if ((approval.attempts ?? 0) >= MAX_ATTEMPTS) return { ok: false, reason: "max_attempts" };

  const lease = approval.lease;
  if (lease) {
    const now = options.now ?? new Date();
    const idadeMin = (now.getTime() - new Date(lease.startedAt).getTime()) / 60000;
    const vivo = idadeMin < LEASE_MAX_MINUTES && (options.isRunnerAlive?.(lease.pid) ?? true);
    // Runner vivo = lote andando, o tick de 5 minutos so precisa sair de fininho.
    // Runner morto = e exatamente a hora de retomar de onde parou.
    if (vivo) return { ok: false, reason: "em_andamento" };
    return { ok: true, resuming: true };
  }
  return { ok: true, resuming: (approval.attempts ?? 0) > 0 };
}
