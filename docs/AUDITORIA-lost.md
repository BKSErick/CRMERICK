# Auditoria dos deals em `lost` — 2026-08-18

Total em lost: **519**
Sem motivo e sem data de perda registrados: **517**
Nunca receberam uma mensagem: **502**
Marcados is_icp=true: **373**

## Recuperaveis

ICP + nunca contatado + sem motivo de perda: **361**
Desses, com telefone no contato: **361**
Desses, com WhatsApp ja confirmado (whatsapp_jid): **0**
Desses, sem segmento canonico: **248** (sem segment o lead fica invisivel para a fila de disparo)

Para virarem fila de disparo faltam DOIS passos, nessa ordem:
1. `node scripts/uazapi-check-numbers.mjs --go` — nenhum deles passou pelo check, por isso o whatsapp_jid esta zerado.
2. preencher `deals.segment` canonico nos 248 sem segmento.
So depois disso vale mover de `lost` para `prospect`.

## Distribuicoes

**Origem da classificacao ICP:** regra=517, (vazio)=2
**Motivo da perda:** (vazio)=517, no_response=2
**Segmento:** =346, caldeiraria=47, usinagem=29, manutencao=26, climatizacao=14, automacao=7, odontologia=6, estetica=5

## Amostra dos recuperaveis com telefone (ate 40)

- #758 Serralheria e Metalúrgica IRMAC — segmento (vazio), score 4
- #509 Master Abc Limpezas Técnicas Comercial Manutenção — segmento (vazio), score 3
- #359 Indústria Metalúrgica Fanandri — segmento (vazio), score 2
- #153 Danfer Indústria Metalúrgica — segmento Corte a Laser, Guilhotina, Dobra CNC, Oxicorte e Calandra, score 4
- #932 Xavier Montagens Industrial e serviços de manutenção e caldeiraria — segmento (vazio), score 3
- #64 BANDEIRANTES ESTRUTURAS METÁLICAS — segmento (vazio), score 3
- #530 Metal Leste Caldeiraria e Instalações Industriais — segmento (vazio), score 1
- #363 Indústria Metalúrgica Santa Paula — segmento (vazio), score 3
- #325 HDC Máquinas e Equipamentos — segmento Manutenção e Fabricação de Bombas de Vácuo, score 2
- #507 Martins Usinagem Ltda. — segmento (vazio), score 3
- #61 Automação Industrial — segmento (vazio), score 1
- #128 COMAI — segmento Manutenção Industrial, score 1
- #283 FS Caldeiraria e Montagem Industrial — segmento (vazio), score 3
- #1176 Casa do Mecânico Ltda — segmento usinagem, score 70
- #185 Eletric Smart — segmento Elétrica, Automação, Projetos e Serviços, score 4
- #1184 Souza Motores Ltda. — segmento manutencao, score 70
- #1187 Petrolub - Industria de Lubrificantes — segmento manutencao, score 70
- #192 Elétrica Nau — segmento (vazio), score 4
- #1026 Tornearia Alayfa — segmento usinagem, score 56
- #285 Fundição Altivo — segmento Fundição de Ferro, score 1
- #1210 AI-Automação Industrial — segmento manutencao, score 68
- #294 GD Manutenção e Montagem — segmento (vazio), score 60
- #675 Prontidão Usinagem — segmento (vazio), score 3
- #394 J Mill Metalúrgica — segmento (vazio), score 3
- #436 Krieger Metalúrgica Indústria Comércio Ltda — segmento (vazio), score 1
- #63 Baccega Manutenção Industrial — segmento (vazio), score 3
- #537 Metalfisa MetaLúrgica — segmento (vazio), score 3
- #696 Rematec Indústria Metalúrgica — segmento (vazio), score 4
- #726 RS Caldeiraria e Usinagem — segmento (vazio), score 2
- #740 Schmidt Mecânica Industrial Manutenção e Fabricação de Maquinas em Geral — segmento (vazio), score 1
- #840 Tornearia Rodrigues Comércio e Usinagem de Peças — segmento (vazio), score 3
- #886 Usinagem Mecânica Absoluta — segmento (vazio), score 1
- #921 W-Tec Industrial — segmento (vazio), score 3
- #1240 Indussel Instalações Indústria e Caldeiraria — segmento caldeiraria, score 62
- #1243 Edu Maquinas — segmento manutencao, score 62
- #472 Lujetec Automação Industrial | Adequação NR12 | Eficiência Energética em Motores Industriais — segmento (vazio), score 1
- #578 Metalúrgica Varginha — segmento (vazio), score 3
- #1161 USINAGEM PAULO CACHORRO — segmento usinagem, score 76
- #583 METALWAC INDUSTRIA METALURGICA — segmento (vazio), score 3
- #1029 Aliança Indústria Mec e Manutenção Industrial Ltda — segmento caldeiraria, score 56

> Nenhum registro foi alterado por este script. Devolver lead para `prospect` e decisao manual.
