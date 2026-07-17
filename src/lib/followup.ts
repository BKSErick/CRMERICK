// Janelas e mensagens da sequencia de follow-up (docs/funil-whatsapp-sequencia.md).
// Compartilhado entre a tela de Disparo e a Sala de Comando. B2B: o objetivo de toda
// mensagem e a conversa/reuniao, nunca link de checkout no fio.

export type FollowupTier = "aguardar" | "M1" | "M2" | "M3";

export const TIER_INFO: Record<Exclude<FollowupTier, "aguardar">, { label: string; window: string }> = {
  M1: { label: "M1 - Retomada leve", window: "D+2 a D+4" },
  M2: { label: "M2 - Prova (cases)", window: "D+5 a D+9" },
  M3: { label: "M3 - Breakup", window: "D+10 ou mais" },
};

export function tierForDays(days: number | null): FollowupTier {
  if (days === null) return "M1";
  if (days < 2) return "aguardar";
  if (days <= 4) return "M1";
  if (days <= 9) return "M2";
  return "M3";
}

export function followupMessage(tier: Exclude<FollowupTier, "aguardar">, company: string) {
  if (tier === "M1") {
    return `Oi, Erick de novo. Te mandei uma análise rápida sobre a ${company} esses dias. Sei que a rotina aí não para, então vou direto: é uma leitura de 2 minutos mostrando o que um comprador industrial vê quando pesquisa vocês antes de pedir orçamento. Quer que eu mande?`;
  }
  if (tier === "M2") {
    return `Um contexto rápido: fiz esse mesmo trabalho pra Jotta Manutenções e pra Metalthec, que atendem indústria como vocês. O problema era o mesmo: serviço bom, mas o comprador não achava prova disso na internet. Se fizer sentido, te mostro o diagnóstico da ${company} sem compromisso.`;
  }
  return `Vou parar de te chamar pra não virar incômodo. Fica só o registro: o diagnóstico da ${company} está pronto aqui comigo. Se em algum momento presença digital virar prioridade, me responde essa mensagem que eu te envio na hora.`;
}
