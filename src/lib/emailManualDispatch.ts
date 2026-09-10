import type { EmailAutomationGraph, EmailAutomationNode } from "./emailAutomationGraph";
import { validateEmailAutomationGraph } from "./emailAutomationGraph.ts";

export type ManualEmailStep = {
  nodeId: string;
  stepIndex: number;
  dueAfterMinutes: number;
  subjectTemplate: string;
  bodyTemplate: string;
};

export type ManualDispatchCandidate = {
  dealId: number;
  contactId: number | null;
  recipientEmail: string;
  company: string;
  contactName: string;
};

export type ManualEnrollment = ManualDispatchCandidate & {
  id: number;
  automationId: string;
  automationVersion: number;
  nextStep: number;
  startedAt?: string;
};

export type ManualDispatchClaim = {
  id: number;
  idempotencyKey: string;
};

export type ManualDispatchResult = {
  dailyCap: number;
  usedBefore: number;
  sent: number;
  stopped: number;
  skipped: number;
  remaining: number;
  errors: string[];
};

type RunnableAutomation = {
  id: string;
  version: number;
  status: string;
  graph: EmailAutomationGraph;
};

type ClaimInput = {
  enrollment: ManualEnrollment;
  recipientEmail: string;
  automationId: string;
  automationVersion: number;
  step: ManualEmailStep;
  subject: string;
  html: string;
  actor: string;
  dailyCap: number;
  now: Date;
};

type OutboundMessage = ClaimInput & ManualDispatchClaim;

export type ManualDispatchDependencies = {
  getAutomation: (automationId: string) => Promise<RunnableAutomation | null>;
  bootstrapExistingFirstSteps?: (input: {
    automationId: string;
    automationVersion: number;
    firstFollowupDueAfterMinutes: number;
    now: Date;
  }) => Promise<number>;
  getDailyUsage: (now: Date) => Promise<number>;
  listDueEnrollments: (input: {
    automationId: string;
    automationVersion: number;
    now: Date;
    limit: number;
  }) => Promise<ManualEnrollment[]>;
  listNewCandidates: (input: {
    automationId: string;
    automationVersion: number;
    graph: EmailAutomationGraph;
    limit: number;
  }) => Promise<ManualDispatchCandidate[]>;
  ensureEnrollment: (candidate: ManualDispatchCandidate, input: {
    automationId: string;
    automationVersion: number;
    now: Date;
  }) => Promise<ManualEnrollment>;
  suppressionReason: (enrollment: ManualEnrollment) => Promise<string | null>;
  stopEnrollment: (enrollmentId: number, reason: string) => Promise<void>;
  claimDispatch: (input: ClaimInput) => Promise<ManualDispatchClaim | null>;
  sendEmail: (message: OutboundMessage) => Promise<{ messageId: string }>;
  completeDispatch: (input: {
    dispatchId: number;
    enrollment: ManualEnrollment;
    messageId: string;
    nextStep: number;
    nextDueAt: string | null;
    completed: boolean;
  }) => Promise<void>;
  markDispatchUncertain: (dispatchId: number, error: string) => Promise<void>;
};

const MINUTES_BY_UNIT: Record<string, number> = {
  minute: 1,
  hour: 60,
  day: 24 * 60,
};

function asText(value: unknown) {
  return typeof value === "string" ? value : "";
}

export function resolveManualDailyCap(value: unknown, defaultCap = 20) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isInteger(parsed) || parsed <= 0) return defaultCap;
  return Math.min(parsed, 250);
}

export function compileManualEmailSequence(graph: EmailAutomationGraph): ManualEmailStep[] {
  const validation = validateEmailAutomationGraph(graph);
  if (!validation.valid) {
    throw new Error(`Grafo invalido para disparo: ${validation.issues.map((issue) => issue.message).join(" ")}`);
  }

  const incoming = new Map(graph.nodes.map((node) => [node.id, 0]));
  const outgoing = new Map(graph.nodes.map((node) => [node.id, [] as string[]]));
  for (const edge of graph.edges) {
    incoming.set(edge.target, (incoming.get(edge.target) ?? 0) + 1);
    outgoing.get(edge.source)?.push(edge.target);
  }
  if ([...incoming.values()].some((count) => count > 1) || [...outgoing.values()].some((targets) => targets.length > 1)) {
    throw new Error("O disparo manual aceita somente um fluxo linear, sem bifurcacoes ou convergencias.");
  }

  const trigger = graph.nodes.find((node) => node.data.kind.startsWith("trigger."));
  if (!trigger) throw new Error("O fluxo precisa de um gatilho.");
  const byId = new Map(graph.nodes.map((node) => [node.id, node]));
  const ordered: EmailAutomationNode[] = [];
  const visited = new Set<string>();
  let cursor: EmailAutomationNode | undefined = trigger;
  while (cursor) {
    if (visited.has(cursor.id)) throw new Error("O fluxo manual nao pode conter ciclos.");
    visited.add(cursor.id);
    ordered.push(cursor);
    const target: string | undefined = outgoing.get(cursor.id)?.[0];
    cursor = target ? byId.get(target) : undefined;
  }
  if (visited.size !== graph.nodes.length) {
    throw new Error("O disparo manual aceita somente um fluxo linear e totalmente conectado.");
  }

  let elapsedMinutes = 0;
  let confirmationArmed = false;
  const steps: ManualEmailStep[] = [];
  for (const node of ordered) {
    if (node.data.kind === "action.wait") {
      const amount = Number(node.data.config.amount);
      const multiplier = MINUTES_BY_UNIT[String(node.data.config.unit)] ?? 0;
      elapsedMinutes += amount * multiplier;
      continue;
    }
    if (node.data.kind === "action.confirmation_request") {
      confirmationArmed = true;
      continue;
    }
    if (node.data.kind !== "action.email_draft") continue;
    if (!confirmationArmed) {
      throw new Error(`O e-mail ${node.data.label || node.id} precisa de confirmacao humana imediatamente antes do envio.`);
    }
    steps.push({
      nodeId: node.id,
      stepIndex: steps.length,
      dueAfterMinutes: elapsedMinutes,
      subjectTemplate: asText(node.data.config.subject),
      bodyTemplate: asText(node.data.config.body),
    });
    confirmationArmed = false;
  }
  if (steps.length === 0) throw new Error("O fluxo validado nao possui rascunhos de e-mail para enviar.");
  if (steps.length > 12) throw new Error("O disparo manual aceita no maximo 12 e-mails por sequencia.");
  return steps;
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function valueAtPath(input: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce<unknown>((current, key) => {
    if (!current || typeof current !== "object" || Array.isArray(current)) return undefined;
    return (current as Record<string, unknown>)[key];
  }, input);
}

export function renderManualEmail(step: ManualEmailStep, input: {
  contact: Record<string, unknown>;
  deal: Record<string, unknown>;
  recipientEmail: string;
  unsubscribeMailbox: string;
}) {
  const unsubscribeUrl = `mailto:${input.unsubscribeMailbox}?subject=sair`;
  const context: Record<string, unknown> = {
    contact: input.contact,
    deal: input.deal,
    email: { unsubscribe_url: unsubscribeUrl },
  };
  const replace = (template: string) => template.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (_match, path: string) => {
    const value = valueAtPath(context, path);
    return value === undefined || value === null ? "" : escapeHtml(value);
  });
  const subject = replace(step.subjectTemplate).replace(/[\r\n]+/g, " ").trim().slice(0, 998);
  if (!subject) throw new Error("O assunto renderizado ficou vazio.");
  const body = replace(step.bodyTemplate).trim();
  if (!body) throw new Error("O corpo renderizado ficou vazio.");
  const hasUnsubscribePlaceholder = /\{\{\s*email\.unsubscribe_url\s*\}\}/i.test(step.bodyTemplate);
  return {
    subject,
    html: `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.55;color:#1a1a1a">${body}${hasUnsubscribePlaceholder ? "" : `\n<p style="font-size:11px;color:#777;margin-top:22px">Se não quiser receber novos contatos, <a href="${unsubscribeUrl}">responda com sair</a>.</p>`}</div>`,
  };
}

function dueAt(startedAt: string | undefined, now: Date, step: ManualEmailStep | undefined) {
  if (!step) return null;
  const start = startedAt ? new Date(startedAt) : now;
  const safeStart = Number.isNaN(start.getTime()) ? now : start;
  return new Date(safeStart.getTime() + step.dueAfterMinutes * 60_000).toISOString();
}

export async function runManualEmailDispatch(
  dependencies: ManualDispatchDependencies,
  input: {
    automationId: string;
    actor: string;
    confirmed: boolean;
    expectedVersion?: number;
    now?: Date;
    dailyCap?: unknown;
    unsubscribeMailbox?: string;
  },
): Promise<ManualDispatchResult> {
  if (!input.confirmed) throw new Error("O disparo exige confirmacao explicita do lote de hoje.");
  const automation = await dependencies.getAutomation(input.automationId);
  if (!automation) throw new Error("Automacao nao encontrada.");
  if (input.expectedVersion && automation.version !== input.expectedVersion) {
    throw new Error("A automacao mudou em outra aba. Recarregue antes de enviar.");
  }
  if (automation.status !== "validated") throw new Error("Somente uma automacao validada pode enviar o lote.");
  const runnable = automation;

  const steps = compileManualEmailSequence(runnable.graph);
  const now = input.now ?? new Date();
  if (steps[1]) {
    await dependencies.bootstrapExistingFirstSteps?.({
      automationId: runnable.id,
      automationVersion: runnable.version,
      firstFollowupDueAfterMinutes: steps[1].dueAfterMinutes,
      now,
    });
  }
  const dailyCap = resolveManualDailyCap(input.dailyCap);
  const usedBefore = Math.max(0, await dependencies.getDailyUsage(now));
  let remaining = Math.max(0, dailyCap - usedBefore);
  const result: ManualDispatchResult = {
    dailyCap, usedBefore, sent: 0, stopped: 0, skipped: 0, remaining, errors: [],
  };
  if (remaining === 0) return result;

  async function processEnrollment(enrollment: ManualEnrollment) {
    if (remaining <= 0) return;
    const step = steps[enrollment.nextStep];
    if (!step) {
      await dependencies.stopEnrollment(enrollment.id, "sequence_completed");
      result.stopped += 1;
      return;
    }
    const suppression = await dependencies.suppressionReason(enrollment);
    if (suppression) {
      await dependencies.stopEnrollment(enrollment.id, suppression);
      result.stopped += 1;
      return;
    }
    const rendered = renderManualEmail(step, {
      contact: { name: enrollment.contactName, email: enrollment.recipientEmail },
      deal: { company: enrollment.company },
      recipientEmail: enrollment.recipientEmail,
      unsubscribeMailbox: input.unsubscribeMailbox || "contato@mydrion.com.br",
    });
    const claimInput: ClaimInput = {
      enrollment,
      recipientEmail: enrollment.recipientEmail,
      automationId: runnable.id,
      automationVersion: runnable.version,
      step,
      subject: rendered.subject,
      html: rendered.html,
      actor: input.actor,
      dailyCap,
      now,
    };
    const claim = await dependencies.claimDispatch(claimInput);
    if (!claim) {
      result.skipped += 1;
      return;
    }
    try {
      const sent = await dependencies.sendEmail({ ...claimInput, ...claim });
      const nextStepIndex = enrollment.nextStep + 1;
      await dependencies.completeDispatch({
        dispatchId: claim.id,
        enrollment,
        messageId: sent.messageId,
        nextStep: nextStepIndex,
        nextDueAt: dueAt(enrollment.startedAt, now, steps[nextStepIndex]),
        completed: nextStepIndex >= steps.length,
      });
      result.sent += 1;
      remaining -= 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha desconhecida no provedor.";
      await dependencies.markDispatchUncertain(claim.id, message).catch(() => undefined);
      result.errors.push(`${enrollment.recipientEmail}: ${message}`);
      remaining = 0;
    }
  }

  const scanLimit = Math.max(remaining * 3, remaining);
  const due = await dependencies.listDueEnrollments({
    automationId: runnable.id,
    automationVersion: runnable.version,
    now,
    limit: scanLimit,
  });
  for (const enrollment of due) {
    await processEnrollment(enrollment);
    if (remaining <= 0) break;
  }

  if (remaining > 0) {
    const candidates = await dependencies.listNewCandidates({
      automationId: runnable.id,
      automationVersion: runnable.version,
      graph: runnable.graph,
      limit: Math.max(remaining * 3, remaining),
    });
    for (const candidate of candidates) {
      const enrollment = await dependencies.ensureEnrollment(candidate, {
        automationId: runnable.id,
        automationVersion: runnable.version,
        now,
      });
      if (enrollment.nextStep !== 0) {
        result.skipped += 1;
        continue;
      }
      await processEnrollment(enrollment);
      if (remaining <= 0) break;
    }
  }

  result.remaining = Math.max(0, dailyCap - usedBefore - result.sent);
  return result;
}
