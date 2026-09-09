# Auditoria do fluxo novo — mensagens de 01 e 02/09/2026

> Leitura das 29 saídas de prospecção + 25 entradas registradas em `activities` desde 01/09.
> Complementa `DIAGNOSTICO-fundo-de-funil-2026-09-02.md`.

## 0. Correção da leitura anterior

No diagnóstico eu disse "copy v3 tem 420 textos gravados e **0 disparos**". Errado.
A v3 **está no ar desde 01/09 às 12:00**. O que me enganou: disparo automático grava só
em `activities` (`Disparo automatico para X [copy-2026-08-31.1/A]`), sem o texto, e não
escreve em `messages` — só o webhook escreve lá. Medi pela tabela errada.

**Números reais da v3 (01/09 12:00 → 02/09 12:55):**

| | |
|---|---:|
| Disparos | 19 (17 variante A, 2 variante B) |
| Deals únicos | 19 |
| Responderam algo | 6 (32%) |
| Resposta humana | 3 (16%) |

n=19. Não conclui nada ainda — mas as duas respostas de texto **responderam exatamente a
pergunta de reconhecimento**, que é o que a v3 foi desenhada pra provocar. A msg 1 está
funcionando. O problema desceu um degrau: agora está na resposta ao "sim".

⚠️ **A/B está desbalanceado: 17 A contra 2 B.** Do jeito que está, não vai dar pra ler o
experimento. `copyAssignmentForLead` usa `detectVariantFromCopy` no `copy_text` já gravado
antes de cair no bucket — como a maioria da fila foi gerada com abertura "Oi, tudo bem?",
quase tudo é forçado pra A. Ou corrige a atribuição, ou aceita que a v3 não tem braço B.

## 1. O CTA novo — veredito

Antigo: *"Pra X seria a mesma ideia. Faz sentido pra vocês?"*
Novo (Mult Tech, 02/09): *"Posso te mostrar uma ideia aplicada ao caso de vocês?"*

**Melhorou, mas não resolve.** Pede permissão pra fazer algo, em vez de pedir opinião —
isso é um degrau acima. Só que carrega três defeitos que mantêm o vazamento:

1. **Pede um segundo "sim" de quem já deu o primeiro.** O lead da Mult Tech já tinha dito
   "precisamos sim olhar tudo antes de orçar". Isso *é* o sim. Perguntar de novo reabre a
   porta pro não e adiciona uma rodada de espera.
2. **"Uma ideia" não é entregável.** O lead não sabe o que vai receber nem quando.
   Time Delay e Effort continuam iguais aos das 43 conversas que sumiram.
3. **Não tem data.** Mesma falha de modo das 32 que evaporaram depois do exemplo.

**Regra que sai disso:** depois que o lead reconhece a fricção, a próxima mensagem não
faz pergunta de permissão. Ela entrega, marca data e pede um insumo pequeno.
O CTA de call continua proibido — nada aqui pede reunião.

## 2. Os três padrões de resposta e a continuação certa

### R1 — Lead CONFIRMA a fricção (caso #1212 Mult Tech)
Lead: *"Precisamos sim olhar tudo antes de orçar"*.
Foi respondido com explicação + pedido de permissão. Devia ter sido entrega com data.

> Isso mesmo, é esse o problema que eu resolvo. O que fiz na Jotta e na Metalthec foi
> pôr um filtro na frente: o cliente informa material, medida, quantidade e prazo antes
> de chegar em vocês. https://sitejotta.vercel.app/
>
> Vou montar a versão da Mult Tech e te mando pronta **quinta**. Investimento é R$997,
> pagamento só depois que você olhar. Do seu lado eu preciso de 2 coisas: os serviços que
> vocês atendem e 3 fotos de trabalho. Me manda que eu começo hoje.

Por que assim: entregável com nome, data, preço na mesa e esforço reduzido a dois itens.
É a estrutura que fechou a GM Solução e a única que fez a Instrumentech mandar material.

⚠️ Leitura fina do caso: elétrica e segurança eletrônica **precisa mesmo de visita
técnica**. Não brigue com isso — o custo dessa empresa não é troca de mensagem, é
**deslocamento de graça pra orçar**. Vale trocar o ângulo:
*"A visita continua sendo necessária. O que a página faz é você só pegar a estrada quando
o pedido já vale a viagem."* Isso é dinheiro na conta dele, não conveniência.

### R2 — Lead NEGA a premissa (caso #1155 I&C Refrigeração)
Lead: *"Geralmente consegue confirmar sim."*
Foi respondido com um segundo problema ("sua reputação está dividida entre Google e
Instagram") + link mandado sem ninguém pedir + **nenhuma pergunta no fim**.

Três erros num bloco só: discute com a realidade que o dono acabou de afirmar, queima o
link (que é a carta única) e devolve a conversa sem próximo passo. Essa thread morre igual
às outras 32.

Continuação certa: não discutir, não pivotar de problema, não mandar link. Uma pergunta
que puxa fato:

> Boa, então essa parte já tá resolvida aí. Só pra eu entender uma coisa: dos clientes que
> chamam vocês, quantos já chegam dizendo o aparelho e o defeito, e quantos você tem que
> ir puxando por mensagem?

Se a resposta for "chegam certinho", **encerre** — não é lead. I&C é conserto de
eletrodoméstico residencial (`is_icp=false`); custou 3 mensagens do teto do número.

### R3 — Lead adia ("vou avaliar", "tô corrido") — caso #397 Jam Mecânica
Lead: *"Deixa eu avaliar, estou com o tempo corrido, tocando duas obras."*
Resposta enviada: *"...Quando estiver mais tranquilo e quiser avaliar, **é só me chamar**."*

Isso entrega o follow-up pro lead. Ele não vai chamar. Mesmo padrão do #1052 Usimon
("é só me dar um alô por aqui") — 19 dias de silêncio desde então.

> Tranquilo, toca as obras. Só não vou te deixar cair no esquecimento: **te chamo dia 15**,
> depois que Ouro Branco estiver andando. Se antes disso aparecer um orçamento que te
> tomou tempo demais pra montar, me manda que eu te mostro como ficaria.

A data é sua, não dele. E vai pro `next_action` do card.

## 3. Defeitos operacionais achados nas saídas de 01/09

| # | O quê | Ação |
|---|---|---|
| `#465` LS Soluções | *"Vi o site de vocês e **identifiquei alguns pontos**..."* — aponta falha no site do lead, que é justamente o que a doutrina proíbe (pega o ego do dono). E foi enviada com um `]` solto no fim. | não reusar esse texto |
| `#1477` Day, `#1478` Jose Geraldo, `#1479` Creusa Gomes | "recebi a notificação do picpay e quero conhecer as soluções" — **não são leads**, é spam de crédito. Day respondeu "quero refinanciar meu contrato CLT". Viraram deal `prospect` e comeram 3 saídas do teto do número. | `is_prospect=false` nos três |
| `#1145` MG Compressores | resposta ao bot foi escrita na mão e ficou boa, mas o template `followups.bot` do playbook existe e continua com 0 disparos automáticos | ligar o disparo |
| `#1461` Túlio Gustavo | está em `stage=lost` e é entrega ativa de ERP com reunião marcada dia 09 | corrigir estágio |
| M3 de 01/09 | 10 breakups entre 17:05 e 19:33; o segundo já trouxe resposta viva (Jam Mecânica) | M3 funciona, manter |

## 4. O que muda no código

1. `mensagemExemplo()` em `src/lib/followup.ts` — trocar o fecho. Hoje ainda termina em
   "Te mostro em 15 min (...) amanhã de manhã ou à tarde?", reprovado em 12/08 e nunca
   reescrito. O novo fecho é entrega + data + preço + insumo (§2, R1). Sem call.
2. Criar as respostas R2 (nega a premissa) e R3 (adia) como mensagens prontas no Comando —
   hoje as duas são improvisadas na hora e as duas erram do mesmo jeito.
3. Corrigir a atribuição A/B (§0) antes de ler qualquer taxa da v3.
4. Ligar `followups.bot` no disparo automático.

## 5. Métrica

Continua uma só: **exemplo enviado → preço falado**, hoje 20% (11/54).
Com preço entrando junto com o exemplo, essa passagem deixa de existir como etapa — o
número a acompanhar vira **"recebeu proposta → respondeu alguma coisa"**.
