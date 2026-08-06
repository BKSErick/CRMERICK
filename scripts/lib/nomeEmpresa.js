/**
 * Nome comercial curto, para usar no meio de uma frase escrita pro dono ler.
 *
 * A razao social do Maps vem gigante ("PG Solucoes Metalicas. Paviloes metalicos
 * industriais, comerciais. Reforma de industrial, telhas zipadas") e repetir inteiro
 * soa robotico. Cortar em 4 palavras resolve isso e cria dois defeitos que ja foram
 * pro lead:
 *
 *   "Vi a CrisMatec Assistencia especializada em no Google"   (parou na preposicao)
 *   "olhar como a By Tico Usinagem e aparece pra quem procura" (idem, no follow-up)
 *
 * A regra vivia copiada em tres arquivos e so um foi corrigido na primeira vez. Mora
 * aqui agora: quem precisa do nome curto importa daqui.
 */

// Preposicao e conjuncao nao podem terminar o corte.
const PRESO_NO_FIM = /\s+(?:de|da|do|das|dos|e|em|para|pra|com|no|na|nos|nas|a|o|as|os|&)$/i;
// Separador de nome comercial. O ponto so corta quando fecha palavra de 4+ letras
// ("PG Solucoes Metalicas. Paviloes"); abreviacao curta nao pode virar corte, senao
// "J.O. Servicos Industriais" sai como "J.O" e "Agemec Ind. Mecanica" como "Agemec Ind".
const SEPARADOR = /[|\-–,;:]|(?<=[A-Za-zÀ-ÿ]{4})\.\s/;
// Ponto de abreviatura de palavra ("Gaspec Ltda.") sai; ponto de sigla ("S.A.") fica.
const PONTO_FINAL = /(?<=[A-Za-zÀ-ÿ]{2})\.$/;

function nomeCurto(empresa) {
  const bruto = String(empresa || "").trim();
  const curto = bruto
    .split(SEPARADOR)[0]
    .trim()
    .split(/\s+/)
    .slice(0, 4)
    .join(" ")
    .replace(PRESO_NO_FIM, "")
    .replace(PONTO_FINAL, "")
    .trim();
  // Nome que sumiu no corte (so separadores, por exemplo) volta inteiro: melhor
  // longo que vazio no meio da frase.
  return curto || bruto;
}

module.exports = { nomeCurto };
