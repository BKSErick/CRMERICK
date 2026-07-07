# Story 009 - Fase 3: Aposentar o legado

## Status
Ready for Dev

## Story
Como Erick, quero concluir a migracao para o Next.js e tirar o hub estatico de circulacao, para ter um unico CRM ativo, sem dois stacks divergentes gravando ou lendo dados de formas diferentes.

## Contexto
Fonte: `Pre-Vistoria_CRM_2026-07-07.md`, secoes 2, 5, 8 (Fase 3) e 10 (decisoes do Erick).

Dois stacks coexistem hoje no mesmo repositorio: o Next.js (canonico, em uso na Vercel) e o hub estatico legado (`index.html` + `modules/*.html` + `js/supabase-client.js`). A Story 005 (migracao dos modulos restantes) e pre-requisito funcional: sem paridade visual completa no Next.js, aposentar o legado deixa o Erick sem funcionalidade. Por decisao do Erick, nenhuma tela/modulo e deletado por falta de uso; a aposentadoria aqui e do stack HTML duplicado, nao de funcionalidades.

## Acceptance Criteria
- [ ] A Story 005 esta concluida (todos os modulos do menu principal com paridade visual real em React, sem placeholders genericos).
- [ ] `index.html` e os `modules/*.html` restantes (hub legado) sao movidos para uma pasta `/legacy` (fora do caminho de build ativo) ou removidos, conforme decisao tomada com o Erick no momento da execucao.
- [ ] `js/supabase-client.js` e `js/config.js` (gerados no build para o hub legado) deixam de ser gerados quando o legado for removido/arquivado; `scripts/build.js` e ajustado para nao referenciar mais esses artefatos se o legado sair do build.
- [ ] `js/mock-db.js` e os JSONs grandes (`js/garimpo-leads.json`, `js/disparo-data.json`) saem do runtime do Next.js (ja tratado como seed pela Story 007) e passam a existir apenas como fixtures/arquivo de referencia fora do bundle de producao, ou sao removidos se o seed ja tiver sido aplicado e confirmado no Supabase.
- [ ] Nenhuma rota ativa do Next.js depende mais de arquivos do hub legado (`LegacyModule.tsx` ou equivalente, se ainda existir apos a Story 005).
- [ ] Documentacao do projeto (README ou equivalente) e atualizada para refletir que o Next.js e o unico stack ativo.
- [ ] Quality gates do projeto passam (`npm run lint`, `npm run build`).

## Tasks / Subtasks
- [ ] Confirmar conclusao da Story 005 antes de iniciar esta story.
- [ ] Levantar todas as referencias ativas ao hub legado no Next.js (`LegacyModule.tsx` ou similar) e confirmar que nao ha mais dependencia funcional.
- [ ] Mover (ou remover, conforme decisao no momento) `index.html` + `modules/*.html` para `/legacy`.
- [ ] Ajustar `scripts/build.js` para nao gerar mais `js/supabase-client.js`/`js/config.js` se o legado sair do fluxo de build.
- [ ] Confirmar que o seed da Story 007 ja rodou e os dados de `mock-db.js`/JSONs estao no Supabase; remover ou mover os arquivos grandes para fora do runtime.
- [ ] Atualizar documentacao do projeto (README/docs) descrevendo o Next.js como unico stack.
- [ ] Rodar `npm run lint` e `npm run build`.
- [ ] Validar manualmente que todas as rotas principais do menu funcionam sem qualquer dependencia do HTML legado.

## Dependencias
- Bloqueada pela conclusao da Story 005 (migracao dos modulos restantes).
- Depende da Story 007 ja ter migrado a persistencia (sem isso, remover o hub legado tira o unico caminho de escrita real no Supabase).
- Depende indiretamente da Story 008 (funil unificado) para nao deixar pontas soltas de integracao com o Supabase antigo do funil.

## Riscos
- Remover o legado antes da Story 005 estar 100% completa deixa o Erick sem paridade de alguma tela ainda nao portada.
- Se algum modulo do Next.js ainda depender de injecao estatica do HTML legado (`LegacyModule.tsx`), remover os arquivos fonte quebra a tela em producao; checar essa dependencia antes de mover/remover.
- Decisao entre mover para `/legacy` vs remover definitivamente deve ser confirmada com o Erick no momento da execucao (nao assumir remocao definitiva sem checagem).

## Dev Agent Record

### Agent Model Used
_A definir_

### Debug Log References
_A definir_

### Completion Notes List
_A definir_

### File List
_A definir_

### Change Log
- 2026-07-07: Story criada por River (SM) a partir do relatorio de pre-vistoria de 2026-07-07.
- 2026-07-07: Validada por Pax (PO). Escopo conferido contra o relatorio (secoes 2, 5, 8 Fase 3 e 10). Honra a decisao de manter todas as telas (aposenta o stack HTML duplicado, nao funcionalidades); mover vs remover fica a criterio do Erick na execucao. ATENCAO: bloqueada pela Story 005 (ainda Draft/incompleta). Status Draft -> Ready for Dev (na fila, atras da 005).
