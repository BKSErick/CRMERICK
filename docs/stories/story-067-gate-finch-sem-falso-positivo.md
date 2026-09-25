# Story 067: Gate Finch sem falso positivo

## Status

Ready for Review (código, dados e migration `copy_variant` aplicados em 25/09/2026; push pendente)

## Story

Como operador da prospecção, quero que o gate "respostas qualificadas paradas" conte só
conversa de gente esperando o Erick, para que resposta automática, conversa pessoal e card
com data velha não segurem o volume novo nem escondam o que precisa de resposta.

## Contexto

Em 24/09 o gate contou **52** respostas paradas e zerou a primeira mensagem industrial. A
leitura de cada uma em 25/09 mostrou que só **11** precisavam do Erick:

| Grupo | Qtde | Causa |
|---|---|---|
| Resposta automática gravada como "humana" | 15 | frase de bot fora da lista do webhook, ou deal classificado antes da frase entrar na lista |
| Conversa pessoal, spam, card órfão "WhatsApp NNNN" | 12 | o gate não olhava `is_prospect` |
| Recusa ou fora do ICP | 5 | nunca foram fechadas como lost |
| Cortesia sem pergunta ("Ok", "Obrigado") | 5 | resposta de gente sem pendência |
| Última fala era do Erick, card com data velha | 4 | conversa movida de card-sombra em 31/08 sem atualizar `last_*_at`; saída caída em card órfão |
| **Precisa do Erick** | **11** | |

Havia também duas listas de resposta automática que diziam se espelhar e não se
espelhavam (`classifyInboundResponse` no webhook e o regex `AUTORESPONDER` da cadência).

## Acceptance Criteria

- [x] 1. Lista única de resposta automática em `src/lib/autoresponder.mjs`
      (`ehRespostaAutomatica`), usada pelo webhook (`src/lib/followup.ts`) e pela cadência
      (`scripts/uazapi-followup-batch.mjs`). Recusa escrita ("não temos interesse", "já temos
      uma empresa") nunca vira bot, mesmo embrulhada em cortesia.
- [x] 2. Comparação da lista antiga com a nova nas 1.226 respostas da base antes de trocar:
      12 bots novos reconhecidos, 1 recusa humana que as duas listas chamavam de bot (#829),
      5 bots que a lista nova perdia e foram incluídos.
- [x] 3. `respostasQualificadasParadas` ignora `is_prospect=false`; `prepare-prospecting-day`
      e `prepare-pilot-batch` passam o campo.
- [x] 4. `scripts/reconciliar-respostas.mjs` (dry-run por padrão): reclassifica "humana" só
      com bot para "bot" (só `response_type_source=automatic`) e avança `last_inbound_at`/
      `last_outbound_at` pelo `messages.occurred_at`. Rodado em 25/09: 9 deals.
- [x] 5. Triagem das 52 aplicada com aprovação do Erick (25/09): 15 bot, 12 `is_prospect=false`,
      5 lost (2 recusas com e-mail na blocklist, 1 fora do ICP, 2 canal errado sem
      `loss_reason_code`), 5 lost por cortesia sem `loss_reason_code` (e-mail segue vivo),
      4 datas reconciliadas. Gate: 52 -> 11. Rascunhos das 11 em
      `logs/rascunhos-paradas-2026-09-25.md` (local).
- [x] 6. Testes: `tests/autoresponder.test.ts` (mensagens reais da triagem) e caso
      `is_prospect=false` em `tests/finch-gate.test.ts`.
- [x] 7. Migration `scripts/migrations/20260925_copy_variant_eventos.sql` aplicada (25/09 14:32): o banco
      recusava `copy_variant='eventos'` e o envio das casas de evento parava na primeira
      mensagem (manhã de 25/09: 1 de 3; tarde: 1 de 10 até a retomada das 14:40).
- [ ] 8. Push via `@devops`.

## Fora do escopo

- Card órfão que recebe a saída do Erick para o número indicado (Valvugás no #1440, Weloze
  no #1482 "Agência Astro", que está `won`) continua acontecendo enquanto o número indicado
  não estiver em `deals.whatsapp` antes da mensagem. Em 25/09 o número indicado foi gravado
  em #13, #443 e #1406. Correção de fundo: gravar `deals.whatsapp` no `extract-referrals`.

## File List

- `src/lib/autoresponder.mjs` (novo)
- `src/lib/followup.ts`
- `src/lib/finchGate.mjs`
- `scripts/uazapi-followup-batch.mjs`
- `scripts/prepare-prospecting-day.mjs`
- `scripts/prepare-pilot-batch.mjs`
- `scripts/reconciliar-respostas.mjs` (novo)
- `scripts/migrations/20260925_copy_variant_eventos.sql` (novo)
- `tests/autoresponder.test.ts` (novo)
- `tests/finch-gate.test.ts`
- `package.json` (teste novo no `npm test`)
