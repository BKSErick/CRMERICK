import assert from "node:assert/strict";
import test from "node:test";

import { avaliarCanal, consultarPerfil, nomeBateComEmpresa, pareceEmpresa } from "../scripts/lib/canalWhatsapp.mjs";

// Casos reais dos lotes de 14/09/2026 (manha + tarde). Os dois "false" sao os dois
// numeros errados do dia: a copy da Steel chegou na G6 Embalagens.
const CONFEREM: Array<[string, string]> = [
  ["Medição Vale do Aço", "Laboratório Medição Vale do Aço: Calibração, Manutenção, Balanças, Metrologia em MG"],
  ["Plurimaquinas", "Plurimaquinas Comércio e Manutenção de Máquinas"],
  ["Televendas Felt", "Felt Estação"],
  ["Frio Bel Refrigeração", "Frio Bel Refrigeração"],
  ["Serralheria Nova Esperança", "Serralheria Nova Esperança"],
  ["Imc Indústria Metalúrgica Cunha Ltda.", "IMC - Indústria Metalúrgica Cunha Ltda."],
  ["Cátia | Metalúrgica Rovaris", "Metalúrgica Rovaris Ltda"],
  ["Sonelma", "Sonelma Indústria Metalúrgica Ltda"],
  ["WS INDUSTRIAL", "WS INDUSTRIAL"],
  ["Mac Freios atendimento", "Mac Freios Peças e Serviços"],
  ["Comercial - RB INDUSTRIAL", "RB INDUSTRIAL"],
  ["Eliane Cunha | Fiofort", "Fiofort Metalúrgica Estamparia"],
  ["deltausinagemindustrial", "Delta Usinagem e Manutenção Ltda"],
  ["Fernanda Ceitel Distribuidora", "Distribuidora Ceitel - Sete Lagoas"],
  ["Lopes Segurança e Telecom", "Lopes Segurança e Telecom | Segurança Eletrônica"],
  ["STEEL USINAGEM", "Steel Usinagem"],
];

const DIVERGEM: Array<[string, string]> = [
  ["G6 Embalagens", "Steel Usinagem"],
  ["Omega Tech", "Consertech Assistência Técnica e Acessórios"],
];

test("nomeBateComEmpresa aceita os 16 perfis que batem com a empresa", () => {
  for (const [nome, empresa] of CONFEREM) {
    assert.equal(nomeBateComEmpresa(nome, empresa), true, `${nome} x ${empresa}`);
  }
});

test("nomeBateComEmpresa retem os perfis de outra empresa", () => {
  for (const [nome, empresa] of DIVERGEM) {
    assert.equal(nomeBateComEmpresa(nome, empresa), false, `${nome} x ${empresa}`);
  }
});

test("nomeBateComEmpresa sem nome no perfil devolve null (nao sabe)", () => {
  assert.equal(nomeBateComEmpresa("", "Steel Usinagem"), null);
  assert.equal(nomeBateComEmpresa(undefined, "Steel Usinagem"), null);
});

test("sufixo societario e preposicao nao contam como token em comum", () => {
  assert.equal(nomeBateComEmpresa("Comercial Ltda", "Steel Usinagem Ltda"), false);
  assert.equal(nomeBateComEmpresa("Industria e Comercio", "Steel Usinagem"), false);
});

// Auditoria de 14/09/2026 sobre 292 cards ja abordados: 41 perfis sem nada em comum com
// a empresa, mas 31 eram nome de pessoa (celular do dono). So perfil com cara de OUTRA
// empresa pode reter, senao a fila morre.
const OUTRA_EMPRESA: Array<[string, string]> = [
  ["G6 Embalagens", "Steel Usinagem"],
  ["Omega Tech", "Consertech Assistência Técnica e Acessórios"],
  ["Zacardi Engenharia Industrial", "Toscana Indústria Metalúrgica"],
  ["Compras Vtruck", "Metalúrgica Metalmaq"],
  ["Little House", "Lithe Indústria Metalúrgica"],
  ["HM Vendas", "Serluc"],
  ["Borghezan Acabamentos em Metais", "Mac Metalúrgica Eireli"],
];

const PESSOA: Array<[string, string]> = [
  ["Ney", "VS Manutenções Industriais"],
  ["Everton Luciano", "Tim Manutenção Assistência técnica"],
  ["Diego Cruz", "MA Manutenção e Automação em Caxias do Sul"],
  ["José Martins", "JMT Industrial"],
  ["william paulista", "Thermo Ar"],
  ["moisesgeraldodefaria10", "Serralheria art fe"],
  ["Cristiano Espindola", "CrisMatec Assistência especializada"],
];

test("pareceEmpresa separa perfil de empresa de perfil de pessoa", () => {
  for (const [nome] of OUTRA_EMPRESA) assert.equal(pareceEmpresa(nome), true, nome);
  for (const [nome] of PESSOA) assert.equal(pareceEmpresa(nome), false, nome);
  // Sobrenome que comeca com palavra de ramo nao pode virar empresa.
  assert.equal(pareceEmpresa("Acosta"), false);
  assert.equal(pareceEmpresa("Casagrande"), false);
});

test("avaliarCanal: outra empresa fica retida, pessoa passa como perfil_pessoal", () => {
  for (const [nome, empresa] of OUTRA_EMPRESA) {
    const r = avaliarCanal({ existe: true, nome, verificado: "", erro: false }, empresa);
    assert.equal(r.ok, false, `${nome} x ${empresa}`);
    assert.equal(r.motivo, "nome_divergente");
  }
  for (const [nome, empresa] of PESSOA) {
    const r = avaliarCanal({ existe: true, nome, verificado: "", erro: false }, empresa);
    assert.equal(r.ok, true, `${nome} x ${empresa}`);
    assert.equal(r.motivo, "perfil_pessoal");
  }
});

test("avaliarCanal: numero inexistente e perfil divergente ficam retidos, resto segue", () => {
  assert.deepEqual(avaliarCanal({ existe: false, nome: "", verificado: "", erro: false }, "Steel Usinagem"), {
    ok: false,
    motivo: "nao_existe",
  });
  assert.equal(avaliarCanal({ existe: true, nome: "G6 Embalagens", verificado: "", erro: false }, "Steel Usinagem").ok, false);
  assert.equal(avaliarCanal({ existe: true, nome: "", verificado: "STEEL USINAGEM", erro: false }, "Steel Usinagem").motivo, "nome_confere");
  assert.equal(avaliarCanal({ existe: true, nome: "", verificado: "", erro: false }, "Steel Usinagem").motivo, "sem_nome");
  // Falha de consulta nao bloqueia: rede caindo nao e prova de numero errado.
  assert.deepEqual(avaliarCanal({ existe: null, nome: "", verificado: "", erro: true }, "Steel Usinagem"), {
    ok: true,
    motivo: "consulta_falhou",
    nome: "",
  });
});

test("consultarPerfil le check + details da Uazapi e tolera falha", async () => {
  const chamadas: string[] = [];
  const fetchImpl = async (url: string, init: { body: string }) => {
    chamadas.push(url.replace(/^.*\/chat/, "/chat"));
    if (url.endsWith("/chat/check")) {
      return { ok: true, json: async () => [{ query: JSON.parse(init.body).numbers[0], isInWhatsapp: true, verifiedName: "" }] };
    }
    return { ok: true, json: async () => ({ wa_name: "G6 Embalagens" }) };
  };
  const perfil = await consultarPerfil("551135060774", { base: "https://x", token: "t", fetchImpl: fetchImpl as unknown as typeof fetch });
  assert.deepEqual(perfil, { existe: true, nome: "G6 Embalagens", verificado: "", erro: false });
  assert.deepEqual(chamadas, ["/chat/check", "/chat/details"]);

  const caiu = await consultarPerfil("551135060774", {
    base: "https://x",
    token: "t",
    fetchImpl: (async () => {
      throw new Error("ECONNRESET");
    }) as unknown as typeof fetch,
  });
  assert.deepEqual(caiu, { existe: null, nome: "", verificado: "", erro: true });
});
