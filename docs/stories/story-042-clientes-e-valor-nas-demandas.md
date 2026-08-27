# Story 042 — Cadastro de Clientes e valor na demanda

**Status:** Ready for Review
**Data:** 2026-08-27
**Origem:** pedido direto do Erick, olhando a aba Demandas em uso.

## Contexto

Ate aqui "cliente" era o deal marcado como ganho. Isso deixava dois buracos na operacao:

1. **Sem valor na demanda.** O valor do primeiro fechamento fica no deal (`deals.value`).
   Todo servico seguinte do mesmo cliente vira demanda — e a demanda nao tinha preco.
   Fechar o mes exigia lembrar de cabeca quanto cada entrega valia.
2. **Sem cadastro de cliente.** Nao havia onde guardar CNPJ, razao social e endereco para
   emitir nota, nem como registrar quem nunca passou pelo pipeline. A aba Carteira era
   uma lista de leitura (JSON do vault + deals), sem cadastro e sem numero.

## Decisoes tomadas com o Erick

- **Clientes substitui a Carteira.** Uma lista so. `/carteira` redireciona para `/clientes`.
- **Valor + regime:** cada demanda tem valor em R$ e cobranca **Pontual** ou **Mensal**.
- **Competencia e campo proprio** (`billing_month`, AAAA-MM), escolhido na mao, com o mes
  do prazo como default no cadastro.

## Acceptance Criteria

- [x] Tabela `public.clients` (CNPJ so em digito, indice unico parcial, RLS ligada sem
      policy publica) com dados fiscais: razao social, IE, IM, endereco, e-mail, telefone.
- [x] Deal em `stage = won` vira cliente sozinho por tres caminhos: backfill na migration,
      `ensureClientForDeal` no `PATCH /api/deals` (aparece no mesmo instante em que o card
      e arrastado) e sincronizacao idempotente a cada leitura de `/api/clients`.
- [x] O seletor de cliente da demanda le **a aba Clientes**, nunca os deals direto.
- [x] `client_demands` ganha `client_id`, `value`, `billing_type`, `billing_month` e
      `billing_until`; demandas existentes foram religadas ao cliente do proprio deal.
- [x] Demanda pode nascer de um cliente cadastrado na mao, sem deal nenhum. So leitura
      passou a ser a demanda **orfa** (sem cliente E sem deal), nao a sem deal.
- [x] Aba **Clientes**: lista com CNPJ, origem, demandas abertas/total, valor do mes e
      recorrente; filtro por status, busca, seletor de mes e botao **+ Novo cliente**.
- [x] Painel do cliente: cadastro fiscal editavel, totais do mes (valor, recorrente,
      abertas, total contratado) e as demandas dele com competencia e valor.
- [x] CNPJ validado por digito verificador no cadastro; CNPJ repetido devolve 409 com
      mensagem, nao erro cru do banco.
- [x] Cliente com demanda nao pode ser excluido (o historico de cobranca iria junto) —
      o caminho e marcar **Encerrado**. Cliente vindo do pipeline idem: voltaria no sync.
- [x] Aba Demandas: coluna **Valor**, soma por grupo do dia e total do que esta na tela.
- [x] Formulario de nova demanda com Valor, Cobranca e Mes de cobranca; criando de dentro
      da pasta do cliente, o cliente ja vem escolhido (deal da pasta -> demandas de la ->
      nome da pasta).
- [x] Lista de clientes vazia no formulario tenta recarregar sozinha ao abrir o painel e
      oferece o botao de nova tentativa: a carga inicial roda uma vez so e, se ela falhar,
      o seletor ficava vazio ate um F5.
- [x] Workspace da demanda edita valor, regime, competencia e fim da recorrencia, com a
      frase do que sera cobrado escrita por extenso.
- [x] Importacao da Carteira antiga (`content/carteira.json`) existe, mas so sob demanda
      (`POST /api/clients` com `importCarteira: true`) — automatica, ressuscitaria cliente apagado.

## Parte 2 — venda parcelada

Pedido do Erick no mesmo dia: servico vendido em 3x (CRM da Jotta, ERP do Tulio) precisa
saber **quais meses** vao ser pagos e **o que ja entrou**. Pontual e mensal nao davam conta.

- [x] Terceiro regime **Parcelado** em `billing_type`.
- [x] Tabela `client_demand_installments`: uma linha por parcela (numero, mes, valor,
      `paid_at`). Linha propria porque a parcela pode cair fora da sequencia (entrada +
      30/60) e a baixa e individual.
- [x] `buildInstallments` divide o total em N meses consecutivos e joga a sobra de centavos
      na **primeira** parcela (1000 em 3x = 333,34 + 333,33 + 333,33; a soma bate o total).
- [x] No parcelado o mes vale **a parcela**, nao o total: `demandValueInMonth` soma as
      parcelas daquele mes. Duas parcelas no mesmo mes somam.
- [x] `POST /api/demands/installments` gera/refaz; `PATCH` edita mes, valor ou baixa de UMA
      parcela; `DELETE` desfaz o parcelamento. Trocar o regime para pontual/mensal apaga as
      parcelas — mantidas, seguiriam somando no mes de uma demanda que nao e mais parcelada.
- [x] Card da demanda lista as parcelas com mes, valor, "Pago em dd/mm" e botao de baixa;
      o formulario de nova demanda ja nasce parcelado quando escolhido.
- [x] Cliente ganha **Recebido no mes** (`monthPaidValue`) ao lado do valor do mes.

## Parte 3 — pago/em aberto nos tres regimes

A baixa nascera so no parcelado. Pontual a vista e mensal ficavam sem resposta para
"ja entrou?". A tabela de parcelas virou tabela de **cobrancas**, que e o que ela sempre foi.

- [x] `client_demand_installments` -> `client_demand_charges` (migration copia as linhas
      e derruba a antiga). Uma cobranca = mes + valor + baixa.
- [x] **Pontual**: uma cobranca, na competencia. **Parcelado**: N cobrancas geradas de uma
      vez. **Mensal**: uma cobranca por mes, criada no ato da baixa e apagada ao desfazer —
      materializar mes futuro seria inventar cobranca que ainda nao existe.
- [x] `PATCH /api/demands/charges` aceita duas formas: `{ id, ... }` edita uma parcela;
      `{ demandId, month, paid }` da ou desfaz a baixa do mes (recusa demanda parcelada,
      que tem baixa por parcela).
- [x] Card da demanda mostra **Pagamento** com os meses passiveis de baixa: um no pontual,
      os meses ja vencidos no mensal (max 12, do mais novo para o mais antigo). Mes futuro
      nao aparece.
- [x] Em pontual e mensal o recebido acompanha o **preco atual** da demanda, nao o valor
      congelado na cobranca — mudar o valor depois da baixa nao deixa o recebido mentindo.
- [x] Painel do cliente ganha coluna **Pagamento** (Pago / Em aberto / parcial) no mes
      selecionado.

## Regras de cobranca (onde a conta acontece)

`src/lib/clientDemands.ts`:

- Competencia = `billing_month` -> mes do prazo -> mes de criacao.
- **Pontual** entra so na sua competencia. **Mensal** entra em todo mes a partir dela,
  ate `billing_until` (nulo = segue rodando). **Parcelado** entra pelo mes de cada parcela.
- **Cancelada** nao fatura em mes nenhum. **Entregue** continua faturando: o trabalho foi feito.
- Mes calculado em `America/Sao_Paulo` — prazo 31/08 23:59 nao vaza para setembro.

## Arquivos

- `scripts/migrations/20260827_clientes_e_valor_das_demandas.sql` (aplicada em producao 27/08)
- `scripts/migrations/20260827_parcelamento_de_demandas.sql` (aplicada em producao 27/08)
- `src/app/api/demands/installments/route.ts`
- `src/lib/clients.ts`, `src/lib/clientsServer.ts`, `src/app/api/clients/route.ts`
- `src/app/clientes/page.tsx`, `src/components/ClientWorkspace.tsx`
- `src/lib/clientDemands.ts`, `src/lib/demandServer.ts`, `src/lib/demandFolders.ts`
- `src/app/api/demands/route.ts`, `src/app/demandas/page.tsx`
- `src/components/DemandOverview.tsx`, `src/components/DemandWorkspace.tsx`
- `src/lib/navigation.ts`, `src/app/carteira/page.tsx`, `src/app/globals.css`
- Testes: `tests/demand-billing.test.ts`, `tests/clients.test.ts`, `tests/clients-ui.test.ts`

## Gates

`npm run typecheck`, `npm run lint` e `npm test` (313 testes) verdes em 27/08/2026.
