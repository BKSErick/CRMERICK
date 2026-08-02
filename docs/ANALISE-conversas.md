# Análise de conversas por tipo de empresa

Como ler a prospecção por segmento em vez de lead a lead. Responde, para cada
tipo de empresa: nível de consciência, sofisticação de mercado, se a oferta está
clara, se o follow-up funciona (e quando não, por quê), até onde a conversa
chegou, amostra de clientes reais e que oferta aquele grupo demanda.

## Ordem de execução

```bash
node scripts/normalize-segments.mjs --go        # 1. agrupa por tipo de empresa
node scripts/classify-conversations.mjs --go    # 2. IA lê as threads e classifica
node scripts/analise-conversas.mjs --md         # 3. relatório
```

Todo script é dry-run por padrão. Só grava com `--go`.

O passo 1 só precisa rodar quando entra leva nova. O passo 2 roda depois de cada
rodada de disparo. O passo 3 roda sempre que você quiser ler o quadro.

## As dimensões

### Consciência (Schwartz, 1 a 5)

Onde o lead está em relação ao problema, não em relação a você.

| Nível | Significa | Como aparece na conversa |
|---|---|---|
| 1 | Inconsciente | Não acha que tem problema de captação |
| 2 | Consciente do problema | Reclama que chega pouca cotação, mas não liga isso à presença digital |
| 3 | Consciente da solução | Sabe que precisa de página melhor, não sabe de quem |
| 4 | Consciente do produto | Conhece landing page e agência, está comparando fornecedor |
| 5 | Totalmente consciente | Quer preço, prazo, proposta |

A abordagem muda por nível: em 2 você conecta o sintoma à causa; em 3 você mostra
o exemplo; em 4 você diferencia; em 5 você fecha.

### Sofisticação de mercado (Schwartz, 1 a 5)

Quanta promessa **aquele mercado** já ouviu. É do mercado, não do lead.

| Nível | Significa | O que ainda funciona |
|---|---|---|
| 1 | Virgem | Promessa direta e simples |
| 2 | Já ouviu alguma vez | Promessa ampliada |
| 3 | Já ouviu muita promessa | Só mecanismo específico |
| 4 | Ceticismo alto | Mecanismo já copiado, exige prova concreta |
| 5 | Saturado | Só identificação e prova real |

Um lead que diz "toda semana me oferecem site" é 4 ou 5, e nesse caso promessa
não funciona: só prova. É o sinal mais acionável do relatório, porque muda a
mensagem inteira e não só o CTA.

### Clareza da oferta

Julgada pela **reação do lead**, nunca pela qualidade da copy.

- `clara` — demonstrou entender ("quanto custa a página?", "manda o exemplo")
- `parcial` — entendeu que é sobre site, não o que exatamente é entregue
- `confusa` — perguntou "o que você faz?" ou confundiu com outra coisa
- `nao_avaliavel` — não respondeu o suficiente

`parcial` predominante num segmento é problema de copy, não de lead.

### Profundidade da conversa (0 a 5)

0 silêncio · 1 bot ou resposta reflexa · 2 respondeu sem engajar ·
3 engajou ou aceitou ver o exemplo · 4 discutiu o próprio negócio, abriu o link ·
5 falou de preço, prazo, reunião

### Demanda de oferta

O que o lead pediu: `pagina_nova`, `redesign`, `seo_geo`,
`formulario_orcamento`, `integracao_whatsapp`, `preco_apenas`, `outro`, `nenhuma`.

Segmento que pede consistentemente a mesma coisa é sinal de produto, não de lead
avulso.

### Travas (blocker)

`sem_resposta`, `gatekeeper_bot`, `preco`, `sem_urgencia`, `ja_tem_fornecedor`,
`decisor_ausente`, `canal_errado`, `audio_nao_transcrito`, `nao_travou`, `outro`.

É o campo que responde "por que o follow-up não está funcionando". Follow-up não
resolve `gatekeeper_bot` nem `decisor_ausente` — esses pedem outro canal ou outra
pessoa. Insistir ali é queimar lead.

## Os freios contra a IA inventar

A classificação é automática e por isso tem três travas:

1. **Faixa e vocabulário.** Nota fora de 1-5 ou valor fora da lista é rejeitado,
   não corrigido.
2. **Evidência tem que ser fala do lead.** Toda classificação carrega uma citação,
   e o script confere se ela realmente aparece numa mensagem `received`. Na
   primeira rodada o modelo classificou a Elétrica GB citando *"Faz sentido pro
   momento de vocês?"*, que é frase do Erick. Quando o modelo troca quem falou o
   quê, ele leu a conversa invertida e a nota não vale nada. Por isso isso
   invalida a classificação inteira, não só o campo.
3. **Autoresponder não é conversa.** "Responderemos em breve" não entra.

O que é rejeitado fica sem `classified_at` e aparece no fim do relatório como
pendência de auditoria manual.

**A classificação varia entre rodadas.** Mesmo com temperature 0.1, rodar de novo
muda alguns casos de fronteira (`gatekeeper_bot` ↔ `decisor_ausente`). Trate nota
individual como indicativo e o padrão do segmento como o sinal. É outra razão pra
auditar os casos que você conhece.

## Honestidade estatística

Toda taxa aparece com o `n` do lado. Célula abaixo de 8 leads sai marcada com `~`
e tem a taxa **suavizada** contra a média geral (média bayesiana, mesma regra do
`lead-winning-profile.mjs`, que importa de `lib/analise-comum.mjs`).

Sem isso, "climatização converte 50%" (1 resposta em 2 leads) vira doutrina e o
scoring passa a priorizar ruído. O relatório existe pra decidir onde investir a
próxima leva, não pra confortar.

Leads que não são prospecção fria (Jotta e Metalthec, que são clientes; contatos
pessoais; ex-sócio) ficam **fora de todas as taxas** — inflariam a resposta com
conversa que já era quente antes da abordagem.

## Decisor indicado (a fila que vem antes do disparo frio)

Encaminhamento é a resposta mais comum do funil: 4 das 11 conversas reais
(Vertical Elétrica → Jean, Pressmix → Cristiane, Provith → André, Vematech →
Tiele). São os melhores leads que existem, porque já passaram o gatekeeper e
chegam com indicação interna.

```bash
node scripts/extract-referrals.mjs              # dry-run
node scripts/extract-referrals.mjs --mensagens  # abordagem pronta de cada um
node scripts/extract-referrals.mjs --go         # grava no deal de ORIGEM
```

O contato indicado fica em `deals.referred_name` / `referred_phone` /
`referred_by`, **no deal original**. Isso é o ponto: sem isso o decisor vira lead
novo e o histórico, o segmento e a copy se perdem.

O sinal usado é o vCard (`message_type=ContactMessage`), que é determinístico e
não depende de IA. O texto livre entra só como segundo critério, para marcar
"prometeu passar e não passou" (esses aparecem separados, para você cobrar o
número).

⚠️ A detecção por texto livre não pegava **nenhum** dos quatro casos reais até
02/08: "poderia entrar em contato com" não casava com o padrão `entre em contato
com`, e "vou te passar o contato" não existia na lista. Corrigido em
`src/lib/followup.ts`. As regras estão duplicadas em `scripts/extract-referrals.mjs`
porque o script roda em Node puro e não importa `.ts`: **mudou numa, mude na
outra.**

## Threads órfãs

Quando a resposta chega de um número que não casa com nenhum deal, o webhook cria
uma linha `WhatsApp NNNN` sem empresa. O relatório conta e avisa, mas não religa
sozinho. Religar antes da leva grande: cada órfã é uma resposta que não entra na
taxa do segmento certo, e o segmento aparece pior do que é.

Hoje são 3 e nenhuma tem resposta dentro. Vale reconferir quando o volume subir.

## Limites conhecidos

- **Áudio não é transcrito.** Lead que responde só por áudio entra com
  `blocker=audio_nao_transcrito` em vez de sumir. O Jota Y é o caso típico.
- `sender_phone` está nulo em boa parte das mensagens, o que impede conferir de
  quem veio a resposta em 43 dos 62 casos atuais.
- Segmento fica `null` quando o nome é de pessoa ("Lucas Rodrigues") e não há
  categoria. São ~190 leads, e o balde "(sem classificação)" é proposital: melhor
  honesto do que empurrar o lead pro grupo errado e sujar a taxa dele.