# Plano de implementacao - Uazapi -> CRM Erick

## Tarefa 1: Formalizar a story

**Arquivo:** `docs/stories/story-020-uazapi-whatsapp-ingestao.md`

**Objetivo:** Registrar requisitos, limites, riscos, tarefas, testes e File List antes do codigo.

**Verificacao:** A story deve estar `Ready for Dev` e conter acceptance criteria testaveis.

## Tarefa 2: Criar o contrato puro do webhook em TDD

**Arquivos:** `tests/uazapi-webhook.test.ts`, `src/lib/uazapiWebhook.ts`

**Objetivo:** Normalizar o payload oficial, identificar direcao e telefone, rejeitar grupos/API e validar o segredo sem depender de Next.js ou Supabase.

**Verificacao:** Primeiro executar o teste sem a implementacao e confirmar RED; depois implementar e confirmar GREEN.

## Tarefa 3: Preparar persistencia idempotente

**Arquivos:** `scripts/migrations/20260729_uazapi_messages.sql`, `scripts/supabase-schema.sql`

**Objetivo:** Adicionar metadados minimos da Uazapi e um indice unico por provedor + mensagem.

**Verificacao:** SQL aditivo, repetivel e sem remover/renomear colunas existentes.

## Tarefa 4: Implementar a rota de ingestao

**Arquivo:** `src/app/api/webhooks/uazapi/route.ts`

**Objetivo:** Validar, normalizar, resolver/criar contato e deal, persistir a mensagem, criar atividade e enriquecer texto com IA best-effort.

**Verificacao:** Casos de segredo invalido, evento ignorado, primeira mensagem e duplicata cobertos por teste; falha de IA nao pode perder mensagem.

## Tarefa 5: Criar configurador CLI

**Arquivo:** `scripts/configure-uazapi-webhook.mjs`

**Objetivo:** Configurar o evento `messages` na instancia usando somente variaveis de ambiente e filtros seguros.

**Verificacao:** Modo `--dry-run` mostra URL sem segredo/token e payload sem credenciais; modo real confirma HTTP 200.

## Tarefa 6: Documentar ambiente

**Arquivos:** `.env.example`, `package.json`

**Objetivo:** Declarar variaveis e comandos de teste/configuracao sem gravar segredos.

**Verificacao:** Nenhum token real aparece no diff.

## Tarefa 7: Validar e conectar

**Objetivo:** Rodar teste direcionado, lint, TypeScript, build, aplicar migration, publicar e configurar webhook.

**Verificacao:** Mensagem real individual registrada uma unica vez e visivel na timeline do deal.
