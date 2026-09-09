# Mecanismo único: Pedido Pronto

> [!WARNING] RENOMEADO EM 02/09/2026: o mecanismo agora se chama **Pedido Pronto**.
> O nome anterior, "Ficha de Escopo", esta MORTO e nao pode voltar em copy, post, bio, roteiro ou proposta.
> O nome do arquivo foi mantido so para nao quebrar links existentes no vault.
> O teste `apps/mydrion-site/src/data/siteContent.test.ts` trava o termo antigo automaticamente no site.

Decidido em 02/08/2026. É o que separa a oferta de "mais uma landing page" e o
que sustenta cobrar mais.

## O que é

**O Pedido Pronto é a triagem técnica que acontece antes do contato chegar no
dono.** Antes de falar com você, o cliente informa:

- o serviço que precisa
- o equipamento ou a peça
- a medida e o material
- a urgência
- a foto ou o desenho, anexados

O pedido cai no WhatsApp já preenchido, em vez de virar ida e volta de mensagem
até descobrir o que a pessoa quer.

**Não é o visual da página.** Esse é o ponto inteiro: o visual é commodity, a
triagem não.

## Por que esse mecanismo e não outro

Saiu dos dados, não de brainstorm. É o ângulo que mais funcionou na prospecção
real e resolve a dor concreta do industrial: hora técnica virando atendimento e
cotação lenta. O comprador some enquanto você tenta descobrir a medida.

## Por que "Pedido Pronto"

O nome nomeia o **resultado que o dono quer** (o pedido chegando pronto), nao a
burocracia de preencher um formulario. "Ficha" nomeava o artefato e pedia
trabalho do cliente; "Pedido Pronto" nomeia o estado final e pede alivio.

Da pra dizer a frase inteira sem explicar nada: "o pedido chega pronto". Isso e
densidade: o simbolo diz o que ele e sem legenda.


## Onde entra, e onde NÃO entra

| Momento | Entra? | Por quê |
|---|---|---|
| **Msg 1** (abordagem fria) | **Não** | A msg 1 tem um trabalho só: ele saber quem fala em 3 segundos. Nome próprio sem contexto em DM fria lê como vendedor de curso. Ali fica o **resultado operacional**, não o mecanismo: "eu faço o pedido do cliente chegar no seu WhatsApp já com serviço, medida e prazo definidos". Ver "Por que a msg 1 mudou" abaixo. |
| **Msg 2** (depois do "quer ver?") | **Sim, é o lugar** | Ele já disse sim e está prestando atenção. Aqui tem espaço pra explicar. |
| **Follow-up M2** | Sim | Prova + mecanismo dá motivo novo pra responder. "Fiz uma página pra uma empresa do ramo" é o que todo mundo diz. |
| **Objeção de mensalidade** | **Não** | Ver "Preço" abaixo. O mensal atual é hospedagem e troca de texto/foto, então vender "a ficha evoluindo" por R$150 prometeria trabalho que não está no escopo. |
| **Página e proposta** | Sim | É o item que justifica o preço. |

## Por que a msg 1 mudou (14/08/2026)

A msg 1 dizia **"faço página de vendas pra indústria"**. O raciocínio original estava
certo pela metade: mecanismo em DM fria realmente não funciona, mas a alternativa
escolhida nomeava a **mercadoria**, e isso posiciona como fornecedor tático.

O dado que fechou a questão: **encaminhamento é 4 das 11 respostas do funil (36%)**.
Vertical Elétrica manda pro superior, Pressmix manda pra diretora, Provith manda pro
André, Vematech manda pra Tiele. Quem se anuncia como categoria de produto é
encaminhado pro setor de compras. É o próprio funil dizendo como a abordagem está
sendo lida.

Existe um terceiro caminho que a versão anterior não considerou: nem categoria
("página de vendas"), nem mecanismo abstrato ("Pedido Pronto"), mas o **resultado
operacional dele**, dito em 3 segundos e em palavra que ele usa todo dia:

> "Eu faço o pedido do cliente chegar no seu WhatsApp já com serviço, medida e prazo definidos."

Mantém a velocidade de reconhecimento, mantém a linguagem industrial e tira a palavra
de fornecedor. A Pedido Pronto continua **fora** da msg 1: ela entra na msg 2, onde
já há permissão pra explicar.

⚠️ Isso invalida a comparação com os 124 disparos anteriores. O experimento foi para
`wa-opening-2026-08-v2` e a copy para `copy-2026-08-14.1`. **Filtre por `experiment_id`
ao ler taxa de resposta**, senão o número mistura duas copies com cara de dado único.

Os prefixos `"Oi, tudo bem?"` (A) e `"Fala!"` (B) foram preservados de propósito:
`detectVariantFromCopy()` em `src/lib/salesPlaybook.mjs` infere a variante a partir
deles.

## Onde vive no código

- `MECANISMO` e `mensagemExemplo()` em `src/lib/followup.ts` (msg 2 dinâmica, link
  por segmento)
- `READY_MESSAGES` em `src/app/comando/page.tsx` (versão copiável, com `[EMPRESA]`)
- Follow-up M2 em `followupMessage()`
- Aberturas da msg 1 em `content/sales-playbook.json` (`openings` e `localOpenings`)

⚠️ A **abordagem do decisor indicado** vive em **três** arquivos e eles têm que mudar
juntos: `src/lib/followup.ts` (`mensagemDecisorIndicado`), `scripts/extract-referrals.mjs`
(duplicada porque o script roda em Node puro e não importa `.ts`) e
`src/app/comando/page.tsx` (`READY_MESSAGES`). **Mudou numa, mude nas outras duas.**

Link do case por segmento: Metalthec para usinagem e caldeiraria, Jotta para o
resto. **Regra anti-invenção:** o link citado tem que ser o que será realmente
enviado.

## Preço (definido em 02/08/2026)

**R$1.000 pela página + R$150/mês.**

O mensal cobre **hospedagem e troca de texto e foto**. Mudança maior (página
nova, função nova) é combinada e cobrada à parte, sempre antes de executar.

É preço de **entrada**, escolhido de propósito para começar a fechar e subir
depois.

Consequência que a copy precisa respeitar: o mensal **não** pode ser vendido como
"o Pedido Pronto evoluindo". Isso prometeria trabalho contínuo que não está no
escopo de R$150, e o atrito apareceria na primeira cobrança extra. A mensagem de
objeção descreve o escopo real, palavra por palavra.

✅ **Âncora validada em 14/08/2026: primeira página fechada a R$997.** Deixa de ser
hipótese de preço e passa a ser preço praticado. O deal de R$3.000 do Jotta continua
sendo CRM em 3 parcelas, produto diferente, e não entra nessa conta.

Ressalva de leitura: a âncora veio de **cliente pequeno**, então ela prova que a faixa
fecha, não que ela é o teto. O teto se descobre subindo com cliente maior, não
reinterpretando essa venda.

**Regra de negociação a partir daqui: nunca desça o preço, desça o escopo.** Se o lead
não paga a tabela, tira-se item da entrega e mantém-se o número. Desconto vira
referência e o mercado industrial da região conversa entre si.

O **HM Usinagem** (negotiation a R$600, 40% abaixo da tabela) foi **descartado em
14/08 por estar fora do ICP**, e por isso não virou âncora. Foi a decisão correta:
lead fora de ICP que fecha barato contamina a tabela por meses.

## Quando revisar

Depois dos ~400 disparos com a msg 1 nova. A sofisticação de mercado medida hoje
é 2.0 a 2.3, mas com n=11 e um caso contrário dentro dela (LS Usinagens, que
respondeu "já tenho uma empresa que faz todo esse trabalho pra mim", sofisticação
4). Se o volume confirmar sofisticação 3+, o mecanismo precisa subir na conversa,
não descer.

Ver `docs/ANALISE-conversas.md` para a leitura por segmento.