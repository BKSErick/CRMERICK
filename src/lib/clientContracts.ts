import { formatCnpj } from "./clients.ts";
import type { ContractPartySnapshot } from "./contractProvider.ts";

export const CONTRACT_STATUSES = ["draft", "generated", "sent", "signed", "cancelled"] as const;
export type ContractStatus = (typeof CONTRACT_STATUSES)[number];

export const CONTRACT_STATUS_LABELS: Record<ContractStatus, string> = {
  draft: "Rascunho",
  generated: "Gerado",
  sent: "Enviado",
  signed: "Assinado",
  cancelled: "Cancelado",
};

export const CONTRACT_TEMPLATES = {
  general_services: {
    label: "Prestacao de servicos geral",
    version: 1,
    defaultTitle: "Prestacao de servicos",
    defaultObject: "Prestacao dos servicos descritos no escopo deste instrumento.",
    defaultScope: ["Servico definido em briefing e proposta aprovados pelas partes"],
  },
  visual_identity: {
    label: "Identidade visual",
    version: 1,
    defaultTitle: "Criacao de identidade visual",
    defaultObject: "Criacao e desenvolvimento de identidade visual para a CONTRATANTE.",
    defaultScope: ["Marca principal", "Aplicacoes acordadas", "Manual de uso da marca", "Arquivos finais aprovados"],
  },
  social_media: {
    label: "Gestao de redes sociais",
    version: 1,
    defaultTitle: "Gestao de redes sociais",
    defaultObject: "Planejamento, criacao e gestao de conteudo para os canais definidos no escopo.",
    defaultScope: ["Planejamento editorial", "Criacao de conteudos", "Publicacao nos canais acordados", "Acompanhamento mensal"],
  },
  mydrion_technology: {
    label: "Site, sistema ou automacao Mydrion",
    version: 1,
    defaultTitle: "Desenvolvimento de solucao digital",
    defaultObject: "Concepcao e desenvolvimento de site, sistema ou automacao sob medida.",
    defaultScope: ["Descoberta e especificacao", "Implementacao do escopo aprovado", "Homologacao e aceite", "Entrega tecnica"],
  },
} as const;

export type ContractTemplateKey = keyof typeof CONTRACT_TEMPLATES;

export type ContractDraft = {
  clientId: number;
  templateKey: ContractTemplateKey;
  title: string;
  object: string;
  scope: string[];
  value: number;
  paymentTerms: string;
  startsOn: string | null;
  endsOn: string | null;
  signingCity: string;
  signingDate: string;
  representativeName: string;
  representativeDocument: string;
  notes: string;
};

export type ContractClientSnapshot = {
  id: number;
  name: string;
  legalName: string;
  document: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
  representativeName: string;
  representativeDocument: string;
};

export type ContractSection = { title: string; paragraphs: string[] };

export type ContractDocumentSnapshot = {
  templateKey: ContractTemplateKey;
  templateVersion: number;
  title: string;
  object: string;
  scope: string[];
  value: number;
  paymentTerms: string;
  startsOn: string | null;
  endsOn: string | null;
  signingCity: string;
  signingDate: string;
  notes: string;
  client: ContractClientSnapshot;
  provider: ContractPartySnapshot;
  sections: ContractSection[];
};

export type ClientContract = {
  id: number;
  contractNumber: string;
  clientId: number | null;
  templateKey: ContractTemplateKey;
  templateVersion: number;
  status: ContractStatus;
  title: string;
  draft: ContractDraft;
  clientSnapshot: ContractClientSnapshot | null;
  providerSnapshot: ContractPartySnapshot | null;
  documentSnapshot: ContractDocumentSnapshot | null;
  generatedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type ClientSource = {
  id: number;
  name: string;
  legalName?: string;
  cnpj?: string | null;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  representativeName?: string;
  representativeDocument?: string;
};

function isDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T12:00:00Z`));
}

function requiredText(value: unknown, label: string, max: number) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) throw new Error(`${label} e obrigatorio.`);
  if (text.length > max) throw new Error(`${label} deve ter no maximo ${max} caracteres.`);
  return text;
}

export function isContractTemplateKey(value: unknown): value is ContractTemplateKey {
  return typeof value === "string" && Object.hasOwn(CONTRACT_TEMPLATES, value);
}

export function isContractStatus(value: unknown): value is ContractStatus {
  return typeof value === "string" && (CONTRACT_STATUSES as readonly string[]).includes(value);
}

export function validateContractDraft(value: unknown): ContractDraft {
  const input = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const clientId = Number(input.clientId);
  if (!Number.isSafeInteger(clientId) || clientId <= 0) throw new Error("Cliente valido e obrigatorio.");
  if (!isContractTemplateKey(input.templateKey)) throw new Error("Modelo de contrato invalido.");
  const amount = Number(input.value);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("O valor do contrato deve ser maior que zero.");
  const scope = Array.isArray(input.scope)
    ? input.scope.map((item) => typeof item === "string" ? item.trim() : "").filter(Boolean)
    : [];
  if (scope.length === 0) throw new Error("Informe ao menos um item de escopo.");
  if (scope.length > 50 || scope.some((item) => item.length > 1000)) throw new Error("O escopo excede o limite permitido.");
  const startsOn = input.startsOn == null || input.startsOn === "" ? null : input.startsOn;
  const endsOn = input.endsOn == null || input.endsOn === "" ? null : input.endsOn;
  if (startsOn !== null && !isDate(startsOn)) throw new Error("Data de inicio invalida.");
  if (endsOn !== null && !isDate(endsOn)) throw new Error("Data de termino invalida.");
  if (startsOn && endsOn && endsOn < startsOn) throw new Error("A data de termino deve ser posterior ao inicio.");
  if (!isDate(input.signingDate)) throw new Error("Data de assinatura invalida.");
  return {
    clientId,
    templateKey: input.templateKey,
    title: requiredText(input.title, "Titulo", 240),
    object: requiredText(input.object, "Objeto", 5000),
    scope,
    value: Math.round(amount * 100) / 100,
    paymentTerms: requiredText(input.paymentTerms, "Condicoes de pagamento", 3000),
    startsOn,
    endsOn,
    signingCity: requiredText(input.signingCity, "Cidade de assinatura", 120),
    signingDate: input.signingDate,
    representativeName: requiredText(input.representativeName, "Representante do cliente", 240),
    representativeDocument: requiredText(input.representativeDocument, "Documento do representante", 40),
    notes: typeof input.notes === "string" ? input.notes.trim().slice(0, 5000) : "",
  };
}

const TRANSITIONS: Record<ContractStatus, readonly ContractStatus[]> = {
  draft: ["generated", "cancelled"],
  generated: ["draft", "sent", "cancelled"],
  sent: ["draft", "signed", "cancelled"],
  signed: [],
  cancelled: [],
};

export function assertContractTransition(from: ContractStatus, to: ContractStatus) {
  if (from === to) return;
  if (!TRANSITIONS[from].includes(to)) throw new Error(`Transicao de contrato invalida: ${from} -> ${to}.`);
}

export function formatContractCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" })
    .format(value)
    .replace(/\u00a0/g, " ");
}

function formatDate(value: string | null) {
  if (!value) return "a definir";
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(new Date(`${value}T12:00:00Z`));
}

function specificSections(templateKey: ContractTemplateKey): ContractSection[] {
  if (templateKey === "visual_identity") return [
    { title: "APROVACAO E REVISOES", paragraphs: ["As etapas serao apresentadas para aprovacao. Alteracoes permanecem limitadas ao briefing e ao numero expressamente combinado no escopo; pedidos novos serao orcados separadamente."] },
    { title: "ARQUIVOS E USO DA MARCA", paragraphs: ["Os arquivos finais previstos no escopo serao entregues apos o aceite e a regularizacao dos pagamentos. Materiais de processo e alternativas nao aprovadas permanecem fora da entrega."] },
  ];
  if (templateKey === "social_media") return [
    { title: "CANAIS, CONTEUDO E APROVACAO", paragraphs: ["Os canais, formatos e volumes validos sao os listados no escopo. A CONTRATANTE responde pela veracidade das informacoes e deve aprovar os materiais no prazo combinado."] },
    { title: "MIDIA E PLATAFORMAS", paragraphs: ["Investimentos em anuncios, licencas e custos cobrados por plataformas nao estao incluidos no valor, salvo previsao expressa no escopo."] },
  ];
  if (templateKey === "mydrion_technology") return [
    { title: "HOMOLOGACAO E ACEITE", paragraphs: ["A CONTRATANTE testara as entregas no ambiente indicado e registrara ajustes objetivos relacionados ao escopo. Ausencia de manifestacao no prazo comercial combinado permite o prosseguimento para a etapa seguinte."] },
    { title: "ACESSOS, INFRAESTRUTURA E TERCEIROS", paragraphs: ["Dominio, hospedagem, contas, APIs, licencas e servicos de terceiros so integram o valor quando descritos no escopo. A CONTRATANTE deve fornecer acessos validos sem compartilhar credenciais pessoais desnecessarias."] },
    { title: "PROPRIEDADE INTELECTUAL", paragraphs: ["Com o pagamento integral, a CONTRATANTE recebe os direitos de uso das entregas especificas produzidas para o projeto. Componentes preexistentes, bibliotecas, metodos, ferramentas e codigo de terceiros permanecem sujeitos as respectivas titularidades e licencas."] },
  ];
  return [
    { title: "APROVACAO E ACEITE", paragraphs: ["As entregas serao submetidas a aprovacao conforme o cronograma. Solicitacoes fora do objeto ou do escopo exigem novo acordo comercial."] },
  ];
}

export function buildContractDocument(
  draftValue: ContractDraft,
  clientValue: ClientSource,
  providerValue: ContractPartySnapshot,
): ContractDocumentSnapshot {
  const draft = validateContractDraft(draftValue);
  const template = CONTRACT_TEMPLATES[draft.templateKey];
  const client: ContractClientSnapshot = {
    id: clientValue.id,
    name: clientValue.name,
    legalName: clientValue.legalName?.trim() || clientValue.name,
    document: formatCnpj(clientValue.cnpj) || "nao informado",
    email: clientValue.email?.trim() || "nao informado",
    phone: clientValue.phone?.trim() || "nao informado",
    address: clientValue.address?.trim() || "nao informado",
    city: clientValue.city?.trim() || "nao informado",
    state: clientValue.state?.trim() || "",
    zipCode: clientValue.zipCode?.trim() || "",
    representativeName: draft.representativeName,
    representativeDocument: draft.representativeDocument,
  };
  const provider = { ...providerValue };
  const vigencia = draft.startsOn || draft.endsOn
    ? `A prestacao inicia em ${formatDate(draft.startsOn)} e termina em ${formatDate(draft.endsOn)}.`
    : "A vigencia e o cronograma seguirao as datas aprovadas entre as partes.";
  const sections: ContractSection[] = [
    { title: "OBJETO", paragraphs: [draft.object, `Escopo:\n${draft.scope.map((item, index) => `${index + 1}. ${item}`).join("\n")}`] },
    { title: "VIGENCIA E CRONOGRAMA", paragraphs: [vigencia, "Prazos dependem do fornecimento tempestivo de informacoes, materiais, acessos e aprovacoes pela CONTRATANTE."] },
    { title: "REMUNERACAO E PAGAMENTO", paragraphs: [`O valor total e ${formatContractCurrency(draft.value)}. ${draft.paymentTerms}`, "Custos de terceiros e itens fora do escopo somente serao cobrados mediante aprovacao previa."] },
    { title: "OBRIGACOES DA CONTRATADA", paragraphs: ["Executar o escopo com diligencia profissional, informar impedimentos relevantes e preservar as informacoes recebidas para a execucao do trabalho."] },
    { title: "OBRIGACOES DA CONTRATANTE", paragraphs: ["Fornecer informacoes, materiais, acessos e aprovacoes necessarios; efetuar os pagamentos nas condicoes acordadas; e responder pela licitude dos conteudos e dados fornecidos."] },
    ...specificSections(draft.templateKey),
    { title: "CONFIDENCIALIDADE E DADOS", paragraphs: ["As partes devem limitar o uso de informacoes confidenciais e dados pessoais ao necessario para executar este contrato, adotando medidas razoaveis de seguranca."] },
    { title: "RESCISAO", paragraphs: ["O descumprimento relevante pode ensejar rescisao apos notificacao e oportunidade razoavel de regularizacao. Permanecem devidos os valores proporcionais ao trabalho executado e aos compromissos ja assumidos."] },
    { title: "DISPOSICOES GERAIS", paragraphs: [`Alteracoes de escopo ou condicoes dependem de registro escrito entre as partes. Fica eleito o foro de ${provider.city} - ${provider.state}, ressalvadas as hipoteses legais de competencia obrigatoria.`] },
  ];
  return {
    templateKey: draft.templateKey,
    templateVersion: template.version,
    title: draft.title,
    object: draft.object,
    scope: [...draft.scope],
    value: draft.value,
    paymentTerms: draft.paymentTerms,
    startsOn: draft.startsOn,
    endsOn: draft.endsOn,
    signingCity: draft.signingCity,
    signingDate: draft.signingDate,
    notes: draft.notes,
    client,
    provider,
    sections,
  };
}

function objectOrNull<T>(value: unknown): T | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as T : null;
}

export function mapClientContract(value: unknown): ClientContract {
  const row = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const draft = objectOrNull<ContractDraft>(row.draft_payload ?? row.draft) ?? {} as ContractDraft;
  return {
    id: Number(row.id) || 0,
    contractNumber: typeof (row.contract_number ?? row.contractNumber) === "string" ? String(row.contract_number ?? row.contractNumber) : "",
    clientId: row.client_id == null && row.clientId == null ? null : Number(row.client_id ?? row.clientId),
    templateKey: isContractTemplateKey(row.template_key ?? row.templateKey) ? (row.template_key ?? row.templateKey) as ContractTemplateKey : "general_services",
    templateVersion: Number(row.template_version ?? row.templateVersion) || 1,
    status: isContractStatus(row.status) ? row.status : "draft",
    title: typeof row.title === "string" ? row.title : "Contrato",
    draft,
    clientSnapshot: objectOrNull(row.client_snapshot ?? row.clientSnapshot),
    providerSnapshot: objectOrNull(row.provider_snapshot ?? row.providerSnapshot),
    documentSnapshot: objectOrNull(row.document_snapshot ?? row.documentSnapshot),
    generatedAt: typeof (row.generated_at ?? row.generatedAt) === "string" ? String(row.generated_at ?? row.generatedAt) : null,
    createdAt: typeof (row.created_at ?? row.createdAt) === "string" ? String(row.created_at ?? row.createdAt) : "",
    updatedAt: typeof (row.updated_at ?? row.updatedAt) === "string" ? String(row.updated_at ?? row.updatedAt) : "",
  };
}
