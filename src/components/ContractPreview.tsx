import {
  formatContractCurrency,
  type ClientContract,
  type ContractDocumentSnapshot,
} from "@/lib/clientContracts";

type ContractPreviewProps = {
  document: ContractDocumentSnapshot;
  contract: ClientContract | null;
  busy?: boolean;
  onGenerate?: () => void;
};

function shortDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(new Date(`${value}T12:00:00Z`));
}

export function ContractPreview({ document, contract, busy = false, onGenerate }: ContractPreviewProps) {
  const generated = Boolean(contract && contract.status !== "draft" && contract.documentSnapshot);
  return (
    <section className="contract-preview" aria-label="Previa do contrato">
      <div className="contract-preview-actions">
        <div>
          <strong>Previa do documento</strong>
          <small>{contract?.contractNumber ?? "Numero reservado ao salvar"}</small>
        </div>
        {generated && contract ? (
          <a className="topbar-btn primary" href={`/api/client-contracts/${contract.id}/pdf`}>
            Baixar PDF
          </a>
        ) : onGenerate ? (
          <button className="topbar-btn primary" disabled={busy} onClick={onGenerate} type="button">
            {busy ? "Gerando..." : "Gerar PDF"}
          </button>
        ) : null}
      </div>

      <article className="contract-preview-page">
        <header className="contract-paper-brand">
          <span className="contract-brand-mark">M</span>
          <strong>MYDRION</strong>
          <small>{contract?.contractNumber ?? "RASCUNHO"}</small>
        </header>
        <h2>CONTRATO DE PRESTACAO DE SERVICOS</h2>
        <p className="contract-paper-subtitle">{document.title}</p>
        <p><strong>CONTRATANTE:</strong> {document.client.legalName}, CNPJ/CPF {document.client.document}, representada por {document.client.representativeName}.</p>
        <p><strong>CONTRATADA:</strong> {document.provider.legalName}, CNPJ {document.provider.document}, atuando sob a marca {document.provider.brandName}.</p>
        {document.sections.map((section, index) => (
          <section key={`${section.title}-${index}`}>
            <h3>{index + 1}. {section.title}</h3>
            {section.paragraphs.map((paragraph, paragraphIndex) => <p key={paragraphIndex}>{paragraph}</p>)}
          </section>
        ))}
        {document.notes ? <section><h3>OBSERVACOES ESPECIFICAS</h3><p>{document.notes}</p></section> : null}
        <p className="contract-paper-date">{document.signingCity}, {shortDate(document.signingDate)}.</p>
        <div className="contract-signatures">
          <div><span /> <strong>{document.provider.brandName}</strong><small>CONTRATADA</small></div>
          <div><span /> <strong>{document.client.representativeName}</strong><small>CONTRATANTE</small></div>
        </div>
        <footer>{formatContractCurrency(document.value)} · Documento sujeito a revisao antes do uso externo.</footer>
      </article>
    </section>
  );
}
