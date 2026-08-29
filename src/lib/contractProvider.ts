export type ContractPartySnapshot = {
  brandName: string;
  legalName: string;
  document: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
  email: string;
};

/**
 * Dados confirmados nos comprovantes cadastrais fornecidos pelo Erick. Mydrion e
 * a marca do documento; a parte juridica continua sendo a empresa individual.
 * Dados bancarios dos contratos antigos nao fazem parte desta fonte.
 */
export const CONTRACT_PROVIDER: Readonly<ContractPartySnapshot> = Object.freeze({
  brandName: "Mydrion",
  legalName: "43.630.898 ERICK MOREIRA SENA SILVEIRA",
  document: "43.630.898/0001-94",
  address: "Rua Campestre, 156, apto 301, Sao Jorge",
  city: "Joao Monlevade",
  state: "MG",
  zipCode: "35.930-237",
  email: "contato.ericksenadesign@gmail.com",
});
