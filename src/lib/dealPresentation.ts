// Vocabulario visual do deal compartilhado entre o Kanban (/pipeline) e a Lista (/lista):
// etapas, formatacao de valor, cor de saude e rotulos de atividade. Extraido de
// pipeline/page.tsx sem alteracao de comportamento, so pra existir em um lugar so.

import type { DealStage } from "@/store/useCRMStore";

export const stages: Array<{ id: DealStage; label: string; hint: string; color: string }> = [
  { id: "prospect", label: "Prospect", hint: "Entrada", color: "#0091ff" },
  { id: "abordado", label: "Abordado", hint: "Mandei msg", color: "#f59e0b" },
  { id: "followup", label: "Follow-up", hint: "2a+ msg enviada", color: "#8b5cf6" },
  { id: "qualified", label: "Qualified", hint: "Respondeu", color: "#7b68ee" },
  { id: "proposal", label: "Proposal", hint: "Oferta enviada", color: "#ed6c02" },
  { id: "negotiation", label: "Negotiation", hint: "Negociacao", color: "#d32f2f" },
  { id: "won", label: "Won", hint: "Cliente ativo", color: "#2e7d32" },
  { id: "lost", label: "Lost", hint: "Arquivado", color: "#646464" },
];

export const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 0,
});

export const ownerClass: Record<string, string> = {
  JM: "av-mira",
  "Joana Mira": "av-mira",
  CS: "av-cale",
  "Carla S.": "av-cale",
  PA: "av-pri",
  Pri: "av-pri",
  AL: "av-al",
  Al: "av-al",
  RT: "av-rt",
  DP: "av-dev",
  Dev: "av-dev",
  PB: "av-pri",
  MR: "av-mira",
  Erick: "av-cale",
};

export type DealActivity = {
  id: number;
  type: string | null;
  description: string | null;
  created_at: string | null;
};

export const activityTypeLabels: Record<string, string> = {
  stage_change: "Mudanca de etapa",
  note: "Nota",
  call: "Ligacao",
  email: "E-mail",
  meeting: "Reuniao",
  whatsapp_opened: "WhatsApp aberto",
  whatsapp_sent_sync: "WhatsApp enviado",
  whatsapp_received: "WhatsApp recebido",
  automation_task_upserted: "Tarefa automatica",
  automation_priority_set: "Prioridade automatica",
  automation_draft_created: "Rascunho automatico",
  automation_alert: "Alerta automatico",
  automation_confirmation_requested: "Confirmacao pendente",
  automation_event_failed: "Falha na automacao",
  deal_health_recalculated: "Saude recalculada",
  qualification_suggested: "Qualificacao sugerida",
  qualification_confirmed: "Qualificacao confirmada",
  qualification_cleared: "Qualificacao limpa",
  deal_lost: "Perda registrada",
  deal_reopened: "Negocio reaberto",
  deal_loss_corrected: "Motivo corrigido",
};

export function dealHealthColor(score?: number): { background: string; color: string } {
  if (score == null) return { background: "#e8eef7", color: "#455a64" };
  if (score >= 80) return { background: "#dff4e5", color: "#176b35" };
  if (score >= 65) return { background: "#e8f5e9", color: "#2e7d32" };
  if (score >= 45) return { background: "#fff4d6", color: "#8a5a00" };
  return { background: "#fde7e7", color: "#b3261e" };
}

export function activityLabel(type: string | null): string {
  return activityTypeLabels[type ?? "note"] ?? "Atividade";
}

export function activityInitials(type: string | null): string {
  return activityLabel(type).slice(0, 2).toUpperCase();
}

export function formatActivityTime(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}
