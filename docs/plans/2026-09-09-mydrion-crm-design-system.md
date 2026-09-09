# Plano - Mydrion CRM Design System

## Tarefa 1: Congelar o contrato visual em teste RED

**Arquivos:** `tests/mydrion-design-system.test.ts`

**Objetivo:** verificar identidade textual, logo, favicon, tokens oficiais, fontes e
remocao dos valores violetas que definiam a marca anterior.

**Verificacao:** executar o teste isolado e confirmar que falha contra a interface atual.

## Tarefa 2: Atualizar identidade e assets da aplicacao

**Arquivos:** `src/app/layout.tsx`, `src/app/icon.svg`,
`src/components/Sidebar.tsx`, `src/components/Topbar.tsx`,
`src/app/login/page.tsx`.

**Objetivo:** aplicar `Mydrion CRM`, `Operacao comercial`, wordmark e monograma sem
alterar navegacao, sessao ou autenticacao.

**Verificacao:** teste isolado deve reconhecer a nova marca e rejeitar os textos antigos.

## Tarefa 3: Substituir o sistema de tokens e componentes base

**Arquivos:** `src/styles/hub.css`, `src/styles/legacy-pipeline.css`,
`src/app/globals.css`, `src/app/login/login.css`.

**Objetivo:** definir os tokens Mydrion e propaga-los por sidebar, topbar, cards,
botoes, formularios, tabelas, modais, kanbans e automacoes. Remover violeta hardcoded.

**Verificacao:** teste isolado passa e busca textual nao encontra a paleta antiga nos
arquivos de interface em escopo.

## Tarefa 4: Alinhar cores declaradas no codigo de interface

**Arquivos:** `src/app/north-star/page.tsx`, `src/app/threads/page.tsx`,
`src/components/email-automations/AutomationEditor.tsx`,
`src/lib/dealPresentation.ts` e demais ocorrencias confirmadas pela busca.

**Objetivo:** substituir fallbacks e cores de marca hardcoded pelos tokens/valores
Mydrion sem alterar o significado de categorias operacionais.

**Verificacao:** teste isolado e `rg` de regressao passam.

## Tarefa 5: Fechar qualidade e revisao visual

**Arquivos:** `docs/stories/story-049-mydrion-crm-design-system.md`.

**Objetivo:** executar teste focado, suite completa, lint, typecheck e build; atualizar
checklist, evidencias e file list; iniciar servidor local e revisar desktop/mobile.

**Verificacao:** gates registrados na Story 049 e localhost aberto para aprovacao.

