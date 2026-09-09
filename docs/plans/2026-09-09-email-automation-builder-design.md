# Design - Editor visual de automacoes de e-mail

**Data:** 2026-09-09
**Status:** Aprovado para rascunho e simulacao segura

## Objetivo

Adicionar ao CRM Eric uma area `Automacoes` inspirada na experiencia visual do
Brevo, na qual o operador conecta gatilhos, regras e acoes em um canvas, salva
versoes do fluxo e executa testes deterministas sem enviar mensagens reais.

## Limite de autoridade

- O editor opera apenas nos estados `draft`, `validated` e `archived`.
- Nao existe estado ativo, endpoint de ativacao, worker ou agendamento nesta entrega.
- `Enviar e-mail` permanece visivel no catalogo, mas bloqueado e impossivel de
  adicionar ou executar.
- O teste do fluxo apenas calcula uma trilha de simulacao. Ele nao chama Brevo,
  ImprovMX, Gmail, webhooks ou qualquer outro servico externo.
- As acoes seguras preservam o contrato da Story 027: tarefa, alerta, rascunho e
  pedido de confirmacao continuam separadas da execucao real.

## Experiencia

`Automacoes` entra na navegacao principal e abre uma lista com busca, filtros de
status e cards de rascunho. `Criar automacao` cria um fluxo inicial e abre o editor.

O editor possui:

- cabecalho com nome, estado, salvar, testar e sair;
- paleta lateral dividida entre gatilhos, regras e acoes;
- canvas central com conexoes, zoom, pan, controles e minimapa;
- inspetor lateral para editar o node selecionado;
- painel de teste com erros de validacao e trilha node a node.

O layout usa os tokens existentes do CRM, com nodes coloridos por categoria e
mensagens explicitas para recursos bloqueados. Em telas estreitas, paleta e inspetor
viram paineis sobrepostos e o canvas continua navegavel.

## Catalogo V1

### Gatilhos

- contato adicionado manualmente;
- contato criado;
- e-mail recebido;
- etapa do deal alterada.

### Regras

- contato possui e-mail;
- etapa e igual a um valor;
- campo comparado com um valor.

### Acoes seguras

- aguardar, apenas na simulacao;
- criar ou atualizar tarefa;
- criar alerta;
- criar rascunho de e-mail;
- solicitar confirmacao humana.

### Acao bloqueada

- enviar e-mail: exibida para deixar a fronteira de produto clara, sem permitir
  inclusao no grafo e sem executor.

## Grafo e validacao

Cada automacao persiste `nodes`, `edges` e `viewport` em JSONB. Antes de salvar ou
testar, o servidor valida:

- identificadores unicos e tipos suportados;
- exatamente um gatilho;
- arestas com origem e destino existentes;
- ausencia de ciclos;
- todos os nodes alcancaveis a partir do gatilho;
- configuracao minima de cada tipo;
- ausencia de qualquer acao bloqueada.

O simulador percorre o grafo de modo deterministico e retorna uma trilha com estado,
mensagem e dados resolvidos por node. Regras podem seguir ou interromper um ramo;
acoes apenas descrevem o que fariam.

## Persistencia

`email_automations` armazena identidade, nome, descricao, estado, grafo atual,
versao e timestamps. `email_automation_revisions` preserva uma fotografia imutavel
por versao. `email_automation_test_runs` registra entrada, trilha e resultado do
teste, inclusive para auditoria de falhas.

As tabelas usam RLS deny-by-default e sao acessadas apenas pelo backend autenticado
com service role. Arquivamento e reversivel; nao ha exclusao fisica na interface.

## APIs

- `GET/POST /api/email-automations`: lista e cria rascunhos.
- `GET/PATCH /api/email-automations/[id]`: consulta, salva nova versao e arquiva.
- `POST /api/email-automations/test`: valida e simula uma versao do grafo.

Todas exigem sessao administrativa. O backend nao oferece rota de ativacao ou envio.

## Validacao e rollout

O desenvolvimento segue RED-GREEN-REFACTOR para contrato do grafo, schema, rotas e
UI. Depois dos testes, serao executados lint, typecheck, build e smoke visual. A
migration remota e o deploy serao feitos de forma isolada e verificados separadamente
do estado do Git.

