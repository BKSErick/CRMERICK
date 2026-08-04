# Story 024 - Kanban operacional de prospeccao Instagram

## Status

Ready for Review

## Story

Como Erick, quero operar os leads do Instagram em um kanban compacto com um painel
de detalhe persistente, para abrir perfis, enviar mensagens manualmente e acompanhar
follow-ups sem perder o card depois de cada acao.

## Contexto

- Design aprovado em `docs/plans/2026-08-04-instagram-kanban-design.md`.
- A grade atual exibe cards completos em duas colunas e se torna longa com 50 leads.
- `Abrir perfil` grava status `opened` e atualiza a fila, reposicionando o card.
- A operacao continua manual e auditavel; nao existe envio automatico.

## Acceptance Criteria

- [ ] A fila exibe colunas Para abordar, Perfil aberto, Em follow-up e Respondeu.
- [ ] Pausados e opt-out ficam em Arquivados, ocultos por padrao e acessiveis por filtro.
- [ ] Cards compactos mostram @, empresa, segmento e proxima acao.
- [ ] Selecionar um card abre um painel com copy, acoes e historico completos.
- [ ] Abrir perfil mantem o lead selecionado depois do refresh.
- [ ] Quando o status muda, o board leva o operador ao card na coluna de destino.
- [ ] Busca local filtra por empresa ou @username.
- [ ] Status so muda por acoes auditaveis existentes; nao ha drag-and-drop livre.
- [ ] Nenhuma mensagem e enviada automaticamente.
- [ ] Layout funciona em desktop e mobile sem regressao nos modos Visao geral e Achados.
- [ ] Testes cobrem o mapeamento de status e o contrato principal da UI.
- [ ] Lint, typecheck, testes, build e smoke visual passam.

## Tasks / Subtasks

- [x] Criar testes RED de colunas e contrato do kanban.
- [x] Implementar mapeamento puro de status para coluna.
- [x] Refatorar follow-ups para board compacto e painel persistente.
- [x] Implementar busca e filtro de arquivados.
- [x] Implementar rastreamento visual apos mudanca de status.
- [x] Aplicar estilos desktop e responsivos.
- [x] Executar quality gates e smoke visual.
- [ ] Publicar e validar o alias de producao.

## Fora de Escopo

- Envio automatico ou API privada do Instagram.
- Drag-and-drop que altere status sem registro de acao.
- Mudanca de cadencia, schema ou regras de classificacao.

## Dev Agent Record

### Agent Model Used

GPT-5 Codex

### Debug Log References

- RED: `node --test --experimental-strip-types tests/instagram-prospecting-ui.test.ts` falhou antes da troca de `scrollIntoView` por rolagem interna.
- GREEN focal: 10 testes de UI e operacao de prospeccao aprovados.
- Suite completa: 66 testes aprovados.
- `npm run lint`, `npm run typecheck`, `npm run build` e `npm audit --audit-level=moderate` aprovados.
- Smoke visual no build local de producao carregou os 50 leads reais e capturou `crm-erick-instagram-followups.png`.
- CodeRabbit indisponivel: WSL instalado sem distribuicao Linux; revisao manual de diff executada como fallback.

### Completion Notes List

- Status de Instagram mapeados deterministicamente para cinco etapas operacionais.
- Cards compactos e painel lateral preservam selecao e copy durante refresh de status.
- Rastreamento do card usa apenas scroll interno do board e da coluna, sem deslocar a pagina.
- Busca por empresa/@ e filtro de arquivados adicionados sem envio automatico ou drag-and-drop.
- Smoke visual endurecido para validar a aba ativa, hidratacao, carregamento da fila e erros de navegador.

### File List

- `docs/plans/2026-08-04-instagram-kanban-design.md`
- `docs/plans/2026-08-04-instagram-kanban.md`
- `docs/stories/story-024-instagram-kanban-operacional.md`
- `scripts/smoke-instagram-visual.mjs`
- `src/app/instagram/InstagramFollowups.tsx`
- `src/lib/prospecting.ts`
- `src/styles/hub.css`
- `tests/instagram-prospecting-ui.test.ts`
- `tests/prospecting-operations.test.ts`

## Change Log

- 2026-08-04: Design aprovado para kanban compacto com painel lateral persistente.
- 2026-08-04: Implementacao concluida e validada com 66 testes, build e smoke visual usando 50 leads reais.
