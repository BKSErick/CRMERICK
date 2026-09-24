# Story 057 — Leitura tipada do WhatsApp recebido

## Status

Ready for Review (migration aplicada; falta deploy e a releitura dos 788 restantes em lotes)

## Story

Como operador do CRM, quero que cada mensagem de WhatsApp recebida venha com intenção,
objeção e a carta do playbook que responde a ela, para decidir a resposta em segundos na
Sala de Comando em vez de reler a conversa inteira.

## Contexto

Medido em 24/09/2026:

- A leitura da IA no webhook (`enrichWithAi`) era texto livre ("resumo, intenção, objeção,
  próximo passo"). Nada no app lia `messages.ai_insight`: só a timeline do deal mostrava, e
  ainda com o rótulo genérico "Atividade".
- 1.166 mensagens recebidas no total: 450 com insight, 713 sem, 95 com erro "aiComplete
  retornou vazio". A view `messages_ai_pendentes` misturava e-mail e mídia, que nunca seriam
  lidos. Legíveis de verdade (WhatsApp, com deal, sem mídia): 809.
- O webhook chamava a IA sem timeout, com `maxDuration = 30`. A função podia morrer antes de
  registrar a falha.

Reutiliza o contrato de decisão tipada da Story 056 (`typedDecision.mjs`).

## Acceptance Criteria

- [x] 1. A leitura grava `ai_intent` e `ai_objection` (listas fechadas com `check` no banco),
      `ai_card`, `ai_evidence` e `ai_decided_by` (`regra` | `llm`).
- [x] 2. As cartas vêm do `content/sales-playbook.json` (`msg2`, `msg2Ponte`, `msg2Preco` e
      `postResponse.cartas.*`, sem as chaves `_nota`), mais `nenhuma`. Carta nova no
      playbook entra sem mudar código nem banco (`ai_card` sem `check`).
- [x] 3. Regras primeiro, sem modelo: bot → `automatica`, encaminhamento (classificador ou
      recepção desviando pra e-mail/telefone de setor) → `encaminhamento`, link sozinho →
      `outro`, frase de `sinaisDeSim.forte` → `sinal_forte`/`msg2`, resposta curta de
      `sinaisDeSim.fraco` → `sinal_fraco`/`msg2Ponte`.
- [x] 4. Cartas só no funil frio (`prospect`, `abordado`, `followup`). Nas outras etapas a
      carta é sempre `nenhuma`: resposta na mão, como manda a doutrina.
- [x] 5. Bot e encaminhamento nunca recebem carta de venda, mesmo se o modelo sugerir.
- [x] 6. A evidência precisa sair da fala do lead. Evidência vinda do Erick descarta a leitura.
- [x] 7. O webhook usa teto de 20 s (metade reservada pro Groq) e registra a falha em
      `ai_error`/`ai_attempts`.
- [x] 8. `ai_insight` vira uma linha em português montada dos campos tipados. A atividade
      `whatsapp_ai_insight` continua sendo criada, agora com rótulo "Leitura do WhatsApp".
- [x] 9. A Sala de Comando mostra a leitura na fila de follow-up, e o chat recebe a leitura
      nos WhatsApps pendentes. Nada é enviado sozinho.
- [x] 10. A view `messages_ai_pendentes` passa a listar só o que o webhook lê (809 no dia da
      migration).
- [x] 11. `npm run ai:reler-whatsapp`: por padrão só simula. `--go` grava, com `--limite`,
      `--pausa`, `--deal` e `--refazer`. Não cria atividade nem apaga o insight antigo.
- [x] 12. Testes, lint, typecheck e build passam.

## Migration

- `scripts/migrations/20260924_whatsapp_leitura_tipada.sql` e `.rollback.sql`.
- Verificação: `node scripts/verify-20260924-whatsapp-leitura-tipada.mjs`.
- **Aplicada em 24/09/2026** pela Management API (dry-run com rollback antes). Verify: 5/5
  checks, 1.166 recebidas, 809 pendentes.
- **Ordem de deploy:** a migration vem antes do código. Ela já está aplicada. O webhook novo
  grava as colunas novas. Sem elas, o update falha e vira `ai_error`.

## Releitura (backfill)

- Primeiro lote gravado em 24/09/2026: 21 mensagens (20 do lote mais 1 relida da Steel).
- Revisão manual do lote e ajustes aplicados antes de gravar:
  - Carta fora do funil frio (Policápsula, cliente, "me liga" → `msg2`) → regra de etapa.
  - Link do Drive lido como sinal forte → regra de link sozinho.
  - Desvio pra compras com e-mail lido como sinal fraco (Steel Usinagem) → regra de
    encaminhamento.
  - O OpenRouter gratuito consumia o prazo inteiro e o Groq nunca era tentado → orçamento
    por provedor.
- Restam 788. Rodar em lotes de cerca de 100 por dia: os planos gratuitos têm cota diária, e
  o webhook e o chat usam as mesmas chaves.

## Observações

- A Policápsula está como `followup` no CRM, mas já é cliente com proposta aprovada. Com a
  etapa certa, a regra de etapa já bloquearia a carta.
- No app, o playbook entra no build (import de JSON): mudou o playbook, a lista de cartas
  muda no próximo deploy. Nos scripts ela é lida a cada execução.

## Dev Agent Record

### Agent Model Used

claude-opus-5-5

### File List

- `docs/stories/story-057-leitura-tipada-whatsapp.md`
- `scripts/migrations/20260924_whatsapp_leitura_tipada.sql` (novo)
- `scripts/migrations/20260924_whatsapp_leitura_tipada.rollback.sql` (novo)
- `scripts/verify-20260924-whatsapp-leitura-tipada.mjs` (novo)
- `scripts/ai-reler-whatsapp.mjs` (novo)
- `scripts/supabase-schema.sql`
- `src/lib/inboundReading.mjs` (novo)
- `src/lib/inboundReading.d.mts` (novo)
- `src/lib/aiRetrievalBroker.ts`
- `src/lib/dealPresentation.ts`
- `src/app/api/webhooks/uazapi/route.ts`
- `src/app/api/comando/route.ts`
- `src/app/comando/page.tsx`
- `src/app/contacts/page.tsx`
- `tests/inbound-reading.test.ts` (novo)
- `package.json`

## Change Log

- 2026-09-24: Implementação, migration aplicada e primeiro lote de releitura gravado.
