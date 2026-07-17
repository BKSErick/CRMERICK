# Funil de WhatsApp — Sequência por Momento (CRM ERICK)

> Gerado pela skill `whatsapp-vendas` (método Alan Nicolas) a partir dos dados reais do CRM.
> Tipo de negócio: **B2B serviço ticket alto** (LP R$3.000 / DFY R$10.000 / retainer R$500-800).
> Regra mestra: **toda mensagem mira a reunião, nunca o checkout.** Nada de link de pagamento no fio.
> Status: AGUARDANDO APROVAÇÃO DO ERICK. Nada é disparado sem revisão.

## Contexto extraído do CRM

| Input | Valor (fonte) |
|---|---|
| Oferta | Landing page R$3k (entrada) · DFY R$10k · retainer R$500-800 (goals.json) |
| Público | Donos de indústria/manutenção industrial, decisor direto, validação B2B (huberick + brain) |
| Evento no funil | Nenhum (sem live/webinar). A "reunião" cumpre o papel do evento |
| Momentos detectáveis | Estágios do pipeline: prospect, abordado, qualified, proposal, negotiation, won, lost + módulo reuniões |
| Ferramenta | Disparo manual com copy pronta (huberick `*_copy.txt`, 942 leads) |
| Temperatura | Frio (cold outreach), esquenta por resposta e reunião |
| Prova real permitida | Clientes ativos: Jotta Manutenções, Metalthec (carteira.json). NUNCA inventar número ou resultado |

## Mapa de momentos (estágio CRM → momento WhatsApp)

| # | Momento | Estágio CRM | Temperatura | Timing | Tom |
|---|---------|-------------|-------------|--------|-----|
| 1 | Reunião marcada: confirmação | qualified → reunião | Quentíssimo | Imediato ao marcar | Direto, leve |
| 2 | Lembrete de reunião | reunião agendada | Quentíssimo | Véspera + 1h antes (link na hora) | Curto |
| 3 | No-show | reunião não aconteceu | Quente | Até 30 min após o horário | Sem culpa, reagendar |
| 4 | Proposta enviada sem resposta | proposal | Quente (análogo boleto gerado) | D+2 · D+7 | Direto, abrir conversa |
| 5 | Negociação travada | negotiation | Quente com objeção | D+4 do último contato | Leve, destravar |
| 6 | Respondeu mas não marcou | qualified | Morno | D+1 da resposta | Puxar pra agenda |
| 7 | Abordado sem resposta | abordado | Frio (análogo carrinho) | D+2 · D+5 · D+10 | Leve, curioso |
| 8 | Perdido / esfriou | lost | Frio | 45 dias | Reativar a dor (nível 4) |

## Sequência do mais quente ao mais frio

1. Reunião marcada (confirmar + lembrar) → 2. No-show (reagendar) → 3. Proposta parada (follow-up) → 4. Negociação travada (objeção) → 5. Respondeu sem marcar (agendar) → 6. Abordado sem resposta (cadência 3 toques) → 7. Lost (re-engajamento 45d).

## Cadência da reunião (substitui a cadência de evento)

Confirmação imediata → véspera → 1h antes com o link. Agenda vai antes, link vai na hora.

## Mapa de disparos

As 12 mensagens estão na conversa em blocos separados e devem ser revisadas pelo Erick antes de qualquer envio. Placeholders: [NOME], [EMPRESA], [PONTO], [DIA], [HORA], [LINK].

## Lacuna de detecção (melhoria no CRM)

O funil hoje não detecta **visita na página de auditoria** (huberick). Se o hub registrar o acesso (pixel simples ou log do Cloudflare), vira o gatilho mais quente do topo do funil: "abriu a auditoria e não respondeu" merece follow-up próprio em 24h, antes do D+2 padrão.
