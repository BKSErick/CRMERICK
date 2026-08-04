# Plano de Implementacao - Central Omnichannel com Prospeccao Instagram

## Tarefa 1 - Fixar o contrato de dominio em testes RED

**Arquivos:** `tests/prospecting-operations.test.ts`, `package.json`

**Objetivo:** Cobrir verticais aceitas, consultas Serper, normalizacao de username,
estado por canal, cadencia D+2/D+5/D+10, opt-out e isolamento WhatsApp/Instagram.

**Codigo:** Criar fixtures puras de `deal + prospectingChannel + messages` e asserts
para `buildSearchQueries`, `normalizeInstagramIdentity`, `nextChannelAction` e
`summarizeChannelHistory`. Incluir o arquivo no script `npm test`.

**Verificacao:** `node --test tests/prospecting-operations.test.ts` deve falhar por
modulo ou exports ainda inexistentes.

## Tarefa 2 - Implementar o dominio omnichannel puro

**Arquivos:** `src/lib/prospecting.ts`, `src/lib/prospecting.d.ts`

**Objetivo:** Concentrar regras sem acesso a banco ou rede.

**Codigo:** Definir `ProspectingChannel`, `ProspectingVertical`, `ChannelStatus`,
configuracao versionada de Odontologia/Estetica, geracao de consultas, identidade de
Instagram, evidencia de match, historico por canal e proxima acao. Reutilizar tipos
de classificacao de `src/lib/followup.ts` em vez de duplicar a taxonomia.

**Verificacao:** teste direcionado da Tarefa 1 passa sem alterar APIs/UI.

## Tarefa 3 - Persistir estado por deal e canal

**Arquivos:** `scripts/migrations/20260804_prospecting_channels.sql`,
`scripts/supabase-schema.sql`, `src/lib/prospectingRecords.ts`

**Objetivo:** Criar fonte unica de estado operacional sem poluir etapas do pipeline.

**Codigo:** Criar `public.prospecting_channels` com FK `deal_id`, `channel`, identidade,
URL, origem/confianca, status, timestamps, proxima acao, classificacao, opt-out,
evidencia JSON e `unique(deal_id, channel)`. Habilitar RLS deny-by-default e indices
de fila. Implementar mapeadores tolerantes a campos nulos.

**Verificacao:** typecheck e teste de mapeamento; migration idempotente em banco de teste.

## Tarefa 4 - Extrair o cliente Serper reutilizavel

**Arquivos:** `src/lib/serper.ts`, `scripts/pull-city-serper.mjs`, `.env.example`

**Objetivo:** Reusar rotacao de chaves e chamadas Maps/Search sem duplicar segredo.

**Codigo:** Implementar cliente server-only que le `SERPER_API_KEYS`, mascara erros e
expoe `searchMaps`/`searchOrganic`. Adaptar o script atual para consumir o mesmo
contrato sem mudar seu dry-run e documentar a variavel server-side.

**Verificacao:** testes com `fetch` simulado; nenhuma chave aparece no payload ou log.

## Tarefa 5 - Implementar preview de busca e dedupe

**Arquivos:** `src/app/api/prospecting/search/route.ts`,
`src/lib/prospectingSearch.ts`, `tests/prospecting-api.test.ts`

**Objetivo:** Buscar clinicas por cidade/UF/vertical e devolver candidatos revisaveis.

**Codigo:** Validar payload por allowlist, consultar Maps e Search, localizar perfil
sugerido, agregar evidencia, bloquear `data/nao-prospectar.json` e consultar Supabase
para marcar `new`, `existing` ou `blocked`. A rota e preview-only e nunca grava.

**Verificacao:** 400 para vertical invalida, 503 sem chave, dedupe deterministico e
resposta sem segredos.

## Tarefa 6 - Implementar importacao idempotente

**Arquivos:** `src/app/api/prospecting/import/route.ts`,
`src/lib/prospectingRepository.ts`, `tests/prospecting-api.test.ts`

**Objetivo:** Adicionar o canal ao mesmo deal ou criar exatamente um novo deal.

**Codigo:** Revalidar o candidato no servidor, reaproveitar dedupe do CRM, inserir
deal/contact somente quando necessario e fazer insert/update seguro da linha
`deal_id + instagram`. Resultado ambiguo permanece `review`; confirmado entra `ready`.

**Verificacao:** importar duas vezes retorna o mesmo deal/canal e nao duplica registros.

## Tarefa 7 - Registrar gestos, mensagens e proxima acao

**Arquivos:** `src/app/api/prospecting/actions/route.ts`,
`src/lib/prospectingRepository.ts`, `tests/prospecting-api.test.ts`

**Objetivo:** Tornar cada gesto auditavel e impedir falso envio.

**Codigo:** Aceitar allowlist `open`, `confirm_sent`, `register_reply`, `classify`,
`schedule`, `pause`, `opt_out`. `open` grava apenas `instagram_opened`.
`confirm_sent` exige conteudo, insere `messages(channel=instagram, provider=manual,
direction=outbound, status=sent)` e agenda o proximo toque. Resposta cria mensagem
inbound manual. Todas as mutacoes ocorrem server-side.

**Verificacao:** regressao prova que open/copy nao incrementam envios; opt-out remove
da fila e WhatsApp nao altera cadencia Instagram.

## Tarefa 8 - Expor fila e historico

**Arquivos:** `src/app/api/prospecting/route.ts`, `src/lib/prospectingRepository.ts`

**Objetivo:** Entregar dados prontos para a UI sem regra comercial no componente.

**Codigo:** GET por canal/status, com deal, canal, mensagens recentes, contagem de
toques, classificacao e proxima acao calculada. Ordenar responder/agora, vencidos,
aguardando, revisar e pausados de forma deterministica.

**Verificacao:** teste de ordenacao e resposta HTTP sem duplicar deal + canal.

## Tarefa 9 - Construir a central na aba Instagram

**Arquivos:** `src/app/instagram/page.tsx`,
`src/app/instagram/InstagramOverview.tsx`,
`src/app/instagram/InstagramProspecting.tsx`,
`src/app/instagram/InstagramFollowups.tsx`, `src/styles/hub.css`

**Objetivo:** Preservar analytics e adicionar Achados/Follow-ups com UX operacional.

**Codigo:** Criar tabs acessiveis, lista de achados curados fora do CRM, badges de
evidencia, copy editavel, confirmacao de envio e fila por secao. Nunca chamar endpoint
de envio externo. Exibir estados vazios/erros reais.

**Verificacao:** lint/typecheck e smoke manual dos tres modos em desktop/mobile.

## Tarefa 10 - Documentar operacao e fechar a story

**Arquivos:** `docs/RUNBOOK-prospeccao.md`,
`docs/stories/story-023-central-omnichannel-instagram.md`

**Objetivo:** Registrar configuracao, dry-run visual e limites da Meta.

**Codigo:** Documentar `SERPER_API_KEYS`, busca externa em lotes pequenos,
revisao/importacao, diferenca
entre abrir e confirmar envio, follow-up e opt-out. Atualizar checkboxes, Debug Log,
Completion Notes e File List somente com evidencia executada.

**Verificacao:** documentacao corresponde aos nomes/rotas reais.

## Tarefa 11 - Quality gates e smoke sem disparo externo

**Arquivos:** todos os arquivos da story.

**Objetivo:** Fechar com evidencia proporcional ao risco.

**Codigo:** Executar `npm.cmd run lint`, `npm.cmd run typecheck`, `npm.cmd test` e
`npm.cmd run build`. Subir localmente, confirmar identidade do CRM Erick e validar
Visao geral, Achados e Leads e follow-ups com rede externa de envio bloqueada.

**Verificacao:** todos os gates passam; nenhum DM/WhatsApp/e-mail real e enviado.
