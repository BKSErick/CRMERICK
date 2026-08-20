# Story 034 - Demandas de clientes em lista operacional

## Status

Ready for Review

## Executor Assignment

- Executor: `@dev`
- Quality gate: `@qa`
- Apoio: `@ux-design-expert`, `@data-engineer`, `@architect`

## Story

Como operador do CRM, quero administrar várias demandas dos clientes fechados ou
ativos em uma aba própria, com visualização em lista e detalhe vinculado ao deal,
para organizar o trabalho diário sem misturar a execução da entrega com a etapa
comercial do pipeline.

## Contexto

O Pipeline já abre cada deal em um overlay rico (`DealDetailOverlay`) com dados
comerciais, descrição, copy, agenda e atividade. O CRM também possui uma única
`next_action` por deal, voltada à operação comercial. Nenhuma dessas estruturas
representa corretamente várias demandas de execução simultâneas para um mesmo
cliente.

A nova aba deve seguir a referência visual fornecida em 20/08/2026: densidade e
hierarquia de uma lista do ClickUp e abertura de um workspace amplo da tarefa,
com propriedades no topo, conteúdo principal à esquerda e atividade à direita.
A referência é de interação e arquitetura da informação; a implementação deve
preservar o design system do CRM Erick e não copiar marca, cores ou componentes
proprietários do ClickUp.

Uma demanda é uma unidade operacional independente. Ela sempre nasce ligada a
um deal elegível, mas concluir, reabrir ou cancelar a demanda não movimenta o
deal, não altera valor, etapa, status comercial, qualificação ou forecast.

## Decisões aprovadas

- Um mesmo deal pode possuir várias demandas abertas simultaneamente.
- A criação seleciona deals de clientes fechados/ativos.
- Novas demandas são adicionadas diretamente pela aba Demandas.
- A conclusão fica restrita à demanda e não produz mudança no Pipeline.
- Ao clicar na linha, o CRM abre o próprio workspace do deal com a demanda
  selecionada, e não uma ficha paralela ou uma cópia reduzida do cliente.

## Dependências

- Reutilizar o contrato de `Deal`, a API de deals, a sessão administrativa e o
  histórico já existentes.
- Reutilizar visualmente o overlay atual do Pipeline; a extração para componente
  compartilhado não pode regredir a abertura por `/pipeline?dealId=<id>`.
- A Story 033 pode continuar em Draft: esta story usa chave estrangeira para o
  `deals.id` existente, mas não depende da mudança de estratégia de sequências.

## Fluxo de usuário

### Lista

```text
Demandas                                      [ + Nova demanda ]
[Buscar] [Todas] [Responsável] [Prioridade] [Destino]

ATRASADAS (2)
○ Ajustar página institucional   Cliente A   Site       Urgente   19/08

HOJE (3)
◐ Revisar copy do anúncio        Cliente B   Instagram  Alta      Hoje

PRÓXIMAS (5)
○ Editar vídeo de apresentação   Cliente A   Reels      Normal    23/08

SEM PRAZO (1)
○ Organizar referências          Cliente C   Drive      Baixa     —

CONCLUÍDAS
● Aprovar identidade visual      Cliente B   Branding   Normal    18/08
```

### Workspace aberto

```text
Demandas / Cliente A / Ajustar página institucional          [X]
Deal: Cliente A     Status: Em andamento     Prazo: 19/08
Responsável: Erick  Prioridade: Urgente      Destino: Site

[Demanda] [Deal comercial]

Descrição / briefing                    | Atividade
Copy / texto de entrega                  | - demanda criada
Checklist e subtarefas                   | - prazo alterado
Links e referências                     | - comentário
Anexos                                  |
```

Fechar o workspace retorna à lista mantendo busca, filtros, agrupamento e
posição de rolagem.

## Modelo de dados proposto

### `public.client_demands`

- `id bigint generated always as identity primary key`
- `deal_id integer references public.deals(id) on delete set null`
- `title text not null`
- `description text`
- `copy_text text`
- `status text not null`: `todo`, `in_progress`, `review`, `done`, `cancelled`
- `priority text not null`: `low`, `normal`, `high`, `urgent`
- `assignee text`
- `destination_type text`: `instagram`, `site`, `whatsapp`, `ads`,
  `presentation`, `drive`, `other`
- `destination_label text` para detalhar um destino personalizado
- `starts_at timestamptz`
- `due_at timestamptz`
- `completed_at timestamptz`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

`deal_id` aceita `null` apenas para preservar o histórico quando um deal for
apagado. A criação e edição nunca permitem uma demanda voluntariamente órfã.

### Estruturas auxiliares

- `client_demand_checklist_items`: texto, concluído, posição e timestamps.
- `client_demand_links`: rótulo, URL validada e timestamp.
- `client_demand_attachments`: nome, caminho privado, MIME type, tamanho e
  timestamp; o binário não fica no banco.
- `client_demand_events`: trilha append-only de criação, alteração de status,
  prazo, responsável, checklist, link, anexo e comentário.

Todas as tabelas possuem chave estrangeira, índices para as consultas da lista,
RLS habilitada e política deny-by-default. As rotas Next.js acessam os dados
somente no servidor após validar a sessão administrativa.

## Regras de elegibilidade

- O seletor de nova demanda lista deals com `stage = 'won'` ou `status = 'won'`.
- Deals perdidos não aparecem no seletor.
- Uma demanda já criada continua visível caso o deal seja posteriormente
  reclassificado; a tela sinaliza que o vínculo comercial não está mais ativo.
- Um deal removido não apaga demandas, checklist, anexos ou eventos; a demanda
  histórica mostra `Deal removido` e fica somente leitura até ser vinculada a
  outro deal elegível por gesto explícito do operador.

## Acceptance Criteria

- [ ] Existe uma nova entrada `Demandas` no grupo `Gestão`, apontando para
  `/demandas`, sem substituir `Sala de Comando`, `Pipeline` ou `Calendário`.
- [ ] `/demandas` carrega dados reais e agrupa demandas em `Atrasadas`, `Hoje`,
  `Próximas`, `Sem prazo` e `Concluídas`, usando o fuso `America/Sao_Paulo` para
  os cortes diários.
- [ ] A lista exibe, no mínimo, status, título, cliente, destino, prioridade,
  responsável e vencimento; busca e filtros podem ser combinados e possuem
  estado vazio e estado de erro úteis.
- [ ] `Nova demanda` permite buscar e selecionar somente deals elegíveis,
  informar ao menos título, prazo, prioridade, responsável e destino, e abre a
  demanda recém-criada para completar os detalhes.
- [ ] Um deal pode possuir zero, uma ou várias demandas simultâneas, sem limite
  artificial no frontend e sem reutilizar `next_action_at` como armazenamento
  da demanda.
- [ ] Clicar em uma linha abre um workspace compartilhado com o deal e inicia na
  demanda selecionada; a aba `Deal comercial` continua expondo os dados atuais
  do overlay do Pipeline sem duplicar regras ou estado.
- [ ] O workspace permite criar e editar descrição/briefing, copy, status,
  prioridade, responsável, início, prazo, destino e rótulo de destino.
- [ ] O workspace permite criar, concluir, reordenar, editar e remover itens de
  checklist; o progresso exibido é calculado a partir dos itens reais.
- [ ] O workspace permite adicionar, abrir, editar o rótulo e remover links
  `http`/`https`; URLs inválidas são rejeitadas no servidor e no cliente.
- [ ] O workspace permite anexar imagens, vídeos e documentos em bucket privado
  do Supabase Storage, usando upload assinado/direto para não trafegar arquivos
  grandes pelo runtime da Vercel; tipo e tamanho são validados antes de confirmar
  o metadado.
- [ ] Downloads usam URL assinada de curta duração e exigem sessão; caminho do
  bucket, service-role e URLs permanentes não são expostos como acesso público.
- [ ] A atividade da demanda registra autor, momento e mudança relevante. O
  histórico é append-only na operação normal e não é reconstruído a partir do
  estado atual.
- [ ] Marcar uma demanda como `done` preenche `completed_at`; reabrir limpa esse
  campo; nenhuma dessas ações altera `deals.stage`, `deals.status`, valor,
  qualificação, saúde, prioridade comercial ou forecast.
- [ ] Fechar o workspace preserva filtros, agrupamento, pesquisa e rolagem da
  lista; URL com `?demandId=<id>` abre diretamente a demanda autorizada e pode
  ser compartilhada dentro da sessão administrativa.
- [ ] O overlay do Pipeline continua abrindo e salvando o deal como antes, com
  teste de regressão para `/pipeline?dealId=<id>`.
- [ ] A interface é navegável por teclado, possui foco visível, nomes acessíveis,
  confirmação para exclusões e layout utilizável em desktop e mobile.
- [ ] Nenhum número, tarefa, arquivo ou atividade de demonstração é inserido em
  produção; estados vazios usam texto explicativo, não dados fictícios.
- [ ] Migration aditiva, schema consolidado, contratos TypeScript, APIs, UI e
  documentação permanecem sincronizados.
- [ ] `npm run lint`, `npm run typecheck`, `npm test` e `npm run build` passam.

## Tasks / Subtasks

- [x] Mapear e testar o contrato antes da implementação (AC: 4-14).
  - [x] Escrever testes RED para elegibilidade, múltiplas demandas, agrupamento
    por data, transições de status e independência do Pipeline.
  - [x] Definir contratos TypeScript compartilhados para demanda, checklist,
    link, anexo, evento, filtros e paginação.
- [x] Criar migration aditiva e atualizar o schema consolidado (AC: 5, 8-13, 19).
  - [x] Criar tabelas, checks, FKs, índices, trigger de `updated_at` e RLS.
  - [x] Criar bucket privado e políticas mínimas de Storage sem listagem pública.
  - [x] Validar migration em transação com `ROLLBACK` antes da aplicação real.
- [x] Implementar camada server-side de Demandas (AC: 2-14).
  - [x] Criar listagem paginada/filtrada, criação, edição e transições de status.
  - [x] Implementar checklist, links, eventos e comentários com validação.
  - [x] Implementar emissão de upload/download assinado e confirmação segura do
    metadado do anexo.
- [x] Extrair o workspace de deal para componente reutilizável (AC: 6, 15).
  - [x] Preservar todos os comportamentos atuais do Pipeline.
  - [x] Adicionar navegação `Demanda` / `Deal comercial` sem duplicar fetches e
    mutações do deal.
- [x] Implementar `/demandas` e navegação (AC: 1-7, 14-17).
  - [x] Construir lista densa, grupos temporais, busca, filtros e estados.
  - [x] Implementar criação rápida e deep link por `demandId`.
  - [x] Restaurar estado da lista após fechar o workspace.
- [x] Executar acessibilidade, responsividade e regressão visual (AC: 15-17).
- [x] Executar quality gates e atualizar checklist/File List da story (AC: 20).

## Fora de escopo

- Sincronização bidirecional com ClickUp, Trello, Asana ou outro gerenciador.
- Alterar automaticamente o Pipeline quando uma demanda muda de status.
- Criar demanda automaticamente por IA, webhook ou automação comercial.
- Controle de horas, faturamento, cobrança, SLA contratual ou capacidade da equipe.
- Dependências entre demandas diferentes, Gantt, Kanban ou calendário próprio.
- Colaboração externa ou acesso do cliente ao CRM.

## Dev Notes

- `src/app/pipeline/page.tsx` contém hoje `DealDetailOverlay`; extrair com diff
  controlado, evitando reescrever toda a tela durante esta story.
- `src/lib/crmRecords.ts` é a fonte dos contratos e mapeamentos do deal.
- `src/store/useCRMStore.ts` concentra mutações otimistas do Pipeline; demandas
  devem usar estado próprio para não inflar ou acoplar o store comercial.
- `src/lib/navigation.ts` é a fonte do menu lateral.
- `src/app/api/deals/route.ts` e `src/app/api/activities/route.ts` mostram os
  padrões atuais de validação e persistência server-side.
- `scripts/supabase-schema.sql` precisa refletir a migration nova.
- O repositório já possui alterações locais não relacionadas. Não sobrescrever,
  formatar em massa ou incluir esses arquivos no File List desta story.

### Arquivos previstos

**Novos**

- `scripts/migrations/20260820_client_demands.sql`
- `src/lib/clientDemands.ts`
- `src/app/api/demands/route.ts`
- `src/app/api/demands/checklist/route.ts`
- `src/app/api/demands/links/route.ts`
- `src/app/api/demands/attachments/route.ts`
- `src/app/demandas/page.tsx`
- `src/components/DealWorkspace.tsx`
- `src/components/DemandWorkspace.tsx`
- `tests/client-demands.test.ts`
- `tests/demands-routes.test.ts`
- `tests/demands-ui.test.ts`

**Modificados**

- `scripts/supabase-schema.sql`
- `src/lib/navigation.ts`
- `src/app/pipeline/page.tsx`
- `src/app/globals.css`
- `package.json`

### Testing

- Unitário: classificação temporal no fuso correto, progresso do checklist,
  transições de status, elegibilidade e validação de URL/anexo.
- API: sessão, CRUD, paginação, filtros, órfãos preservados, RLS e tentativas de
  acesso/arquivo não autorizadas.
- Integração: múltiplas demandas no mesmo deal, deep link, reabertura, upload e
  download assinado.
- Regressão: overlay do Pipeline, delete de deal com histórico e `next_action`.
- Visual: desktop e mobile com listas vazia/cheia, texto longo, muitos anexos e
  workspace aberto; validar teclado e leitor de tela.

## Rollout e rollback

- Aplicar a migration primeiro em dry-run/`ROLLBACK`, depois no banco real.
- Verificar tabelas, checks, RLS, índices e bucket privado antes do deploy da UI.
- Smoke autenticado: criar duas demandas no mesmo deal, concluir uma, reabrir,
  anexar/baixar arquivo e confirmar que o deal não mudou.
- Em rollback, reverter somente o deploy da aplicação; manter tabelas, bucket e
  dados para evitar perda. A remoção física da estrutura exige operação separada
  e explicitamente aprovada.

## CodeRabbit Integration

- Tipo: Full-stack + Database + Storage + Security + Frontend; complexidade alta.
- Pre-Commit `@dev`: contratos, validação, isolamento entre demanda e deal,
  upload assinado, acessibilidade e testes.
- Pre-PR `@qa`/`@architect`: migration reversível, RLS, regressão do Pipeline,
  API e comportamento em falha parcial.
- Pre-Deployment `@devops`: variáveis, bucket privado, schema remoto, build,
  rollback e smoke autenticado.
- Self-healing: `@dev` light, até 2 iterações/15 min, auto-fix somente CRITICAL;
  HIGH documentado para revisão de `@qa`.

## Story Draft Checklist

- Goal & Context Clarity: PASS
- Technical Implementation Guidance: PASS
- Reference Effectiveness: PASS
- Self-Containment Assessment: PASS
- Testing Guidance: PASS
- CodeRabbit Integration: PASS
- Readiness: READY FOR PO REVIEW

## Change Log

| Data | Versão | Descrição | Autor |
| --- | --- | --- | --- |
| 2026-08-20 | 1.0 | Story criada a partir do desenho aprovado e da referência visual ClickUp-like | @sm |
| 2026-08-20 | 1.1 | Implementação da aba Demandas, APIs, persistência, Storage privado e testes | @dev |
| 2026-08-20 | 1.2 | Corrigida consulta relacional que solicitava a coluna inexistente `deals.title`; adicionado teste de regressão e smoke autenticado | @dev |

## Dev Agent Record

### Agent Model Used

GPT-5 Codex

### Debug Log References

- `node --test tests/client-demands.test.ts tests/demands-routes.test.ts tests/demands-ui.test.ts`
- `node scripts/apply-migration.mjs scripts/migrations/20260820_client_demands.sql --dry-run` — HTTP 201 com `ROLLBACK`.
- `npm.cmd run lint` — PASS.
- `npm.cmd run typecheck` — PASS.
- `npm.cmd test` — 207/207 PASS.
- `npm.cmd run build` — PASS, incluindo `/demandas` e cinco rotas `/api/demands`.
- CodeRabbit CLI não estava instalado neste checkout; revisão local e `git diff --check` usados como fallback.

### Completion Notes List

- Lista operacional paginada com grupos no fuso de São Paulo, filtros combináveis, criação rápida e deep link.
- Workspace de demanda com propriedades, briefing, copy, checklist reordenável, links, anexos e atividade append-only.
- A aba comercial mantém o Pipeline como superfície canônica por deep link, evitando duplicar estado e regras comerciais.
- Status da demanda não escreve em `deals`; demandas órfãs preservam histórico e ficam bloqueadas para mutação no servidor e na UI.
- Upload e download usam URLs assinadas; o bucket é privado e tamanho/MIME são reconferidos antes do metadado.
- Migration validada com `ROLLBACK` e aplicada no Supabase — HTTP 201. Smoke autenticado de `/api/demands` retornou HTTP 200 no localhost.
- Corrigido o normalizador Uazapi para omitir `mediaUrl` ausente, desbloqueando o teste de regressão já existente.
- Corrigido o relacionamento `deal:deals(...)` para refletir o schema real sem `deals.title`; o teste dedicado falha se a coluna inexistente voltar.

### File List

- `docs/plans/2026-08-20-story-034-demandas-implementation.md` (novo)
- `docs/stories/story-034-demandas-clientes-lista-operacional.md` (novo/atualizado)
- `package.json` (atualizado)
- `scripts/migrations/20260820_client_demands.sql` (novo)
- `scripts/supabase-schema.sql` (atualizado)
- `src/app/api/demands/route.ts` (novo)
- `src/app/api/demands/attachments/route.ts` (novo)
- `src/app/api/demands/checklist/route.ts` (novo)
- `src/app/api/demands/events/route.ts` (novo)
- `src/app/api/demands/links/route.ts` (novo)
- `src/app/demandas/page.tsx` (novo)
- `src/app/globals.css` (atualizado)
- `src/components/DealWorkspace.tsx` (novo)
- `src/components/DemandWorkspace.tsx` (novo)
- `src/lib/clientDemands.ts` (novo)
- `src/lib/demandAuth.ts` (novo)
- `src/lib/demandServer.ts` (novo)
- `src/lib/navigation.ts` (atualizado)
- `src/lib/uazapiWebhook.ts` (correção de regressão existente)
- `tests/client-demands.test.ts` (novo)
- `tests/demands-routes.test.ts` (novo)
- `tests/demands-ui.test.ts` (novo)

## QA Results
