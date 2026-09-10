# Story 054 — Disparo manual da automação de e-mail

## Status

Ready for Review

## Objetivo

Como operador administrativo do CRM, quero executar manualmente o lote diário de
uma automação validada para que follow-ups vencidos e novas entradas sejam
enviados com rastreabilidade, sem depender de terminal ou de uma rotina automática.

## Acceptance Criteria

- [x] A versão validada expõe o botão `Enviar lote de hoje`; rascunhos, versões
      alteradas e automações arquivadas não podem disparar.
- [x] O clique exige confirmação explícita e chama uma rota administrativa própria.
- [x] O backend compila apenas grafos lineares seguros, com confirmação humana
      antes de cada rascunho de e-mail, e rejeita formatos ambíguos.
- [x] O lote prioriza follow-ups vencidos, usa o espaço restante para novos
      contatos elegíveis e envia no máximo uma etapa por destinatário por execução.
- [x] O limite inicial é 20 envios por dia, configurável até o teto absoluto de 250,
      contando também os envios já registrados em `activities`.
- [x] Claims, snapshots e progresso são persistidos de forma idempotente; cliques
      simultâneos não reenviam a mesma etapa nem ultrapassam o limite diário.
- [x] Resposta recebida, negócio perdido, bounce, spam ou descadastro interrompem
      a sequência antes de um novo envio.
- [x] Cada sucesso registra `activities.email_sent` com automação, versão, etapa,
      dispatch e message id do provedor.
- [x] Falhas incertas ficam bloqueadas para revisão e nunca são repetidas
      automaticamente.
- [x] Não existe cron, loop contínuo ou envio real durante os testes.
- [x] Migração, rollback, schema consolidado, testes e documentação são atualizados.

## Notas de implementação

- O clique diário é o gatilho humano; a automação não roda em segundo plano.
- A primeira versão usa Brevo transacional e remetente verificado descoberto pela API.
- O texto `{{email.unsubscribe_url}}` vira um `mailto:` de descadastro, evitando que
  scanners de links cancelem o contato por engano.
- A execução atual é dimensionada para o lote inicial de 20. A subida até 250 deve
  manter o mesmo modelo de persistência, mas será liberada por configuração e
  observação de entregabilidade.

## Tasks

- [x] Criar contratos e testes RED do compilador e das travas.
- [x] Criar tabelas e RPC de claim diário.
- [x] Implementar seleção, supressão, envio e avanço da sequência.
- [x] Implementar rota administrativa de dispatch.
- [x] Adicionar botão, confirmação e resumo da execução no editor.
- [x] Executar quality gates e atualizar File List.

## Verificação

- `npm.cmd run test:email-automations`: 35/35 testes passaram.
- `npm.cmd test`: 461/461 testes passaram.
- `npm.cmd run typecheck`: passou.
- `npm.cmd run lint`: 0 erros; 2 avisos preexistentes fora da story.
- `npm.cmd run build`: passou depois da sincronização oficial do DNA
  `alex-hormozi`, compilando 82 páginas e a nova rota.
- Migração validada com `BEGIN/ROLLBACK`, aplicada no Supabase e verificada com
  RLS ativo, execução negada a `anon`, permitida a `service_role` e zero linhas
  criadas em inscrições/dispatches.
- O rascunho real v3 foi consultado somente para leitura e confirmou sequência
  linear D0/D+2/D+5/D+10; nenhum envio foi executado.

## File List

- `docs/stories/story-054-disparo-manual-automacao-email.md`
- `package.json`
- `scripts/migrations/20260910_email_automation_manual_dispatch.sql`
- `scripts/migrations/20260910_email_automation_manual_dispatch.rollback.sql`
- `scripts/supabase-schema.sql`
- `scripts/verify-20260910-email-manual-dispatch.mjs`
- `src/app/api/email-automations/[id]/dispatch/route.ts`
- `src/app/automacoes/page.tsx`
- `src/components/email-automations/AutomationEditor.tsx`
- `src/lib/emailManualDispatch.ts`
- `src/lib/emailManualDispatchServer.ts`
- `tests/email-automation-routes.test.ts`
- `tests/email-automation-schema.test.ts`
- `tests/email-automation-ui.test.ts`
- `tests/email-manual-dispatch.test.ts`
