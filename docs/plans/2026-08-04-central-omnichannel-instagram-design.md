# Design - Central Omnichannel com Prospeccao Instagram

## Problema

O CRM Erick ja opera descoberta de empresas pelo Serper, prospeccao industrial por
WhatsApp e uma camada deterministica de follow-up. A aba Instagram, entretanto,
serve apenas para metricas da conta do Erick. Nao existe uma fila operacional para
descobrir empresas adequadas ao canal, revisar a abordagem, confirmar o envio manual
e acompanhar os proximos toques no mesmo historico do deal.

## Decisao aprovada

Construir uma central de prospeccao com dominio omnichannel, inicialmente exposta na
aba Instagram. A central reutiliza `deals`, `messages`, `activities`, classificacao
de respostas e cadencia. O canal e uma dimensao da oportunidade, nunca uma copia do
deal ou uma nova etapa do pipeline.

A nova busca nao atacara o segmento industrial pelo Instagram. Industrial continua
priorizado nos canais atuais. A descoberta Instagram sera direcionada a:

- clinicas odontologicas e dentistas;
- clinicas de estetica e servicos esteticos;
- empresas com presenca visual relevante e sinais verificaveis de operacao/demanda.

Os leads que ja existem no CRM permanecem no fluxo atual. Se uma busca nova encontrar
uma empresa ja cadastrada, a central associa o canal Instagram ao deal existente e
nunca cria uma oportunidade duplicada.

## Alternativas consideradas

### Lista Instagram separada

Descartada porque fragmentaria historico, score e pipeline e criaria duplicidade com
empresas ja presentes no CRM.

### Fila Instagram sobre `deals` sem dominio de canal

Descartada porque timestamps e cadencia globais misturariam WhatsApp e Instagram.
Um envio em um canal poderia adiar ou antecipar incorretamente o follow-up do outro.

### Central omnichannel com estado por deal + canal

Aprovada. Mantem uma unica oportunidade comercial e um estado operacional isolado
para cada canal. Permite Instagram manual agora, WhatsApp sincronizado pela Uazapi e
adapters futuros de email/LinkedIn/Meta sem reescrever o nucleo.

## Jornada principal

1. Erick solicita comigo uma pesquisa pequena por cidade, UF e vertical
   (`Odontologia` ou `Estetica`).
2. A busca usa Serper Maps e Search fora da interface do CRM, com revisao de
   identidade, demanda e aderencia antes da importacao.
3. Somente os achados aprovados sao enviados ao CRM e deduplicados contra os deals
   existentes.
4. Na aba `Achados`, cada resultado mostra a evidencia disponivel: empresa, cidade, rating, avaliacoes,
   site, perfil sugerido, origem do perfil e confianca de correspondencia.
5. Erick revisa o perfil. Resultado sem evidencia suficiente permanece `Revisar` e
   nao recebe copy pronta como se fosse confirmado.
6. Ao adicionar a fila, o sistema cria um novo deal ou associa o canal ao deal ja
   existente.
7. O CRM gera uma DM curta a partir apenas de fatos observados.
8. `Abrir Instagram` registra somente abertura. `Confirmar envio` grava a mensagem
   real e inicia a cadencia do canal.
9. Follow-ups aparecem por vencimento, com historico e proximo toque separados por
   canal.
10. Respostas podem ser registradas/classificadas manualmente. Uma futura permissao
    oficial de inbox Meta podera alimentar o mesmo contrato por webhook.

## Interface

A rota `/instagram` preserva a visao analitica existente e recebe tres modos:

- `Visao geral`: perfil, alcance, demografia e posts atuais;
- `Achados`: lista somente os perfis pesquisados, revisados e enviados ao CRM;
- `Leads e follow-ups`: mensagens enviadas, classificacao, proxima acao e historico.

O card operacional exibe:

- empresa, vertical e cidade;
- perfil Instagram sugerido e evidencia da correspondencia;
- rating e quantidade de avaliacoes do Google;
- status do canal;
- ultima saida/entrada e proxima acao;
- copy editavel;
- acoes `Abrir perfil`, `Copiar`, `Confirmar envio`, `Registrar resposta`,
  `Classificar` e `Agendar`.

## Descoberta e qualificacao

O endpoint server-side recebe somente verticais permitidas e expande consultas a
partir de configuracao versionada. A busca combina Serper Maps para empresas e Serper
Search para localizar perfis publicos associados.

Um perfil nao e declarado ativo apenas por existir. O sistema guarda sinais e deixa
explicito quando a atividade nao pode ser confirmada. A aprovacao humana do match
prevalece. Chaves Serper ficam somente no servidor por `SERPER_API_KEYS` e nunca sao
retornadas ao navegador.

A deduplicacao reaproveita as regras existentes por Maps CID, telefone, nome e
dominio. `instagram.com` nao vira chave global de dominio; o username normalizado e
usado apenas como identidade do canal.

## Modelo operacional

Adicionar `prospecting_channels`, com uma linha por `deal_id + channel`:

- identidade e URL do canal;
- origem e confianca do match;
- status operacional;
- timestamps de abertura, ultima entrada e ultima saida;
- proxima acao, data e observacao;
- classificacao e origem da classificacao;
- opt-out e metadados de evidencia.

`messages` continua como fonte do conteudo real e ja suporta `channel = instagram`.
`activities` continua como trilha auditavel de gestos. Abertura e envio usam tipos
distintos; abrir o perfil nunca conta como mensagem enviada.

## Estados e cadencia

Estados iniciais do canal:

- `review`: perfil precisa de validacao;
- `ready`: perfil confirmado e copy pronta;
- `opened`: Instagram aberto, envio ainda nao confirmado;
- `contacted`: ao menos uma saida confirmada;
- `replied`: resposta registrada;
- `paused`: adiado manualmente;
- `opted_out`: sem novos contatos.

Instagram sem resposta reutiliza a cadencia aprovada D+2, D+5 e D+10. Resposta
humana, encaminhamento, objecao e perdido reutilizam a classificacao atual. Toda
regra e calculada por `deal + channel`; atividade WhatsApp nao altera o relogio do
Instagram.

## Copy e seguranca comercial

- Nenhuma DM fria e enviada automaticamente.
- Todo lote e toda copy ficam visiveis antes de qualquer gesto externo.
- A primeira mensagem nao leva link.
- A copy nao aponta falha do site ou perfil e nao humilha o prospect.
- Nao inventa demanda, numeros, especialidades, procedimentos ou resultados.
- Clientes/cases da lista `data/nao-prospectar.json` continuam bloqueados.
- Opt-out encerra a cadencia daquele canal.
- Perfil ambiguo ou empresa homonima exige revisao.

## Integracao Meta

A V1 usa abertura manual do perfil e confirmacao explicita do envio. O CRM nao usa
API privada, automacao de navegador ou scraping autenticado. O contrato de dominio
aceita futuramente eventos oficiais de inbox, desde que a conta obtenha as permissoes
necessarias e o usuario tenha iniciado/interagido com a conversa conforme as regras
da Meta.

## Validacao

- TDD para consultas permitidas, match, dedupe, estados, confirmacao e cadencia.
- Teste de regressao garantindo que `opened` nao conta como `sent`.
- Teste garantindo isolamento entre WhatsApp e Instagram.
- Teste de API sem segredo e com payload invalido.
- Lint, typecheck, suite completa e build.
- Smoke visual local dos tres modos da aba.
- Nenhum disparo externo real durante validacao.
