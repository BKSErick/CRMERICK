# Design - Prospeccao aprovada com meta diaria de 40

## Decisao aprovada

- Instagram permanece integralmente manual.
- WhatsApp opera com meta de exatamente 40 envios confirmados por dia.
- O dia e dividido por meta acumulada: 20 confirmados ate o lote da manha e
  40 confirmados ate o lote da tarde.
- Nenhum lote envia sem aprovacao explicita e valida para a data.
- Falha de conexao ou duas falhas consecutivas continua interrompendo o processo;
  seguranca do numero prevalece sobre forcar a meta.

## Evidencia que motivou a correcao

- Consulta unica do PostgREST retornou 1.000 de 1.420 contatos.
- A fila calculada com leitura unica tinha 39 leads elegiveis; paginada, 194.
- Sete Lagoas possui 204 prospects, 114 com canal confirmado e zero com copy.
- Divinopolis ainda nao possui leads na base.
- Os 39 prospects de saude seguem no fluxo manual do Instagram.

## Arquitetura

1. Um helper REST pagina qualquer colecao Supabase em blocos de 1.000.
2. Envio, follow-up e verificacao de numeros usam o helper; nenhum `Range` alto
   e tratado como garantia de leitura completa.
3. A preparacao gera copies sem enviar e congela manifests com IDs candidatos.
4. A aprovacao grava um artefato local de uso unico ligado a data, slot e hash do
   manifest.
5. O dispatcher valida aprovacao, data, hash e consumo antes de chamar scripts
   com `--go` e IDs congelados.
6. O lote da manha recebe teto acumulado 20; o da tarde, teto acumulado 40.
7. Os scripts contam atividades confirmadas no banco e nunca ultrapassam o teto.
8. O dispatcher chama os scripts existentes e preserva integralmente janela
   comercial, intervalos aleatorios, pausas, teto horario, opt-out, canal confirmado
   e parada depois de duas falhas consecutivas.

## Operacao de 11/08/2026

- Preparar hoje as copies de Sete Lagoas sem disparo.
- Congelar dois manifests: `morning` e `afternoon`.
- Agendar verificacoes a partir de 09:05 e 14:05, repetidas a cada cinco minutos
  dentro de cada janela para aceitar o OK sem criar corrida operacional.
- Sem arquivo de aprovacao, a tarefa encerra sem contato externo.
- O operador pode aprovar um slot ou o dia inteiro com um unico comando.

## Fora de escopo

- Automatizar primeira mensagem no Instagram.
- Forcar envio apos falha de conexao, bloqueio ou ausencia de candidatos.
- Rodar Divinopolis antes de validar o primeiro dia com a nova fila.
