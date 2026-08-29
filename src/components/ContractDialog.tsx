"use client";

import { FormEvent, useMemo, useState } from "react";
import {
  CONTRACT_TEMPLATES,
  buildContractDocument,
  type ClientContract,
  type ContractDraft,
  type ContractTemplateKey,
} from "@/lib/clientContracts";
import { CONTRACT_PROVIDER } from "@/lib/contractProvider";
import type { ClientWithTotals } from "@/lib/clients";
import { ContractPreview } from "@/components/ContractPreview";

type ContractDialogProps = {
  client: ClientWithTotals;
  contract?: ClientContract | null;
  onClose: () => void;
  onSaved: (contract: ClientContract) => void;
};

function today() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
}

function initialDraft(client: ClientWithTotals, contract?: ClientContract | null): ContractDraft {
  if (contract?.draft) return contract.draft;
  const template = CONTRACT_TEMPLATES.general_services;
  return {
    clientId: client.id,
    templateKey: "general_services",
    title: template.defaultTitle,
    object: template.defaultObject,
    scope: [...template.defaultScope],
    value: 0,
    paymentTerms: "Pagamento conforme as condicoes comerciais aprovadas entre as partes.",
    startsOn: null,
    endsOn: null,
    signingCity: client.city || CONTRACT_PROVIDER.city,
    signingDate: today(),
    representativeName: client.representativeName,
    representativeDocument: client.representativeDocument,
    notes: "",
  };
}

async function json<T>(response: Response): Promise<T> {
  const body = await response.json();
  if (!response.ok || body.ok === false) throw new Error(body.error ?? "Nao foi possivel salvar o contrato.");
  return body as T;
}

export function ContractDialog({ client, contract: initialContract, onClose, onSaved }: ContractDialogProps) {
  const [contract, setContract] = useState<ClientContract | null>(initialContract ?? null);
  const [draft, setDraft] = useState(() => initialDraft(client, initialContract));
  const [scopeText, setScopeText] = useState(() => initialDraft(client, initialContract).scope.join("\n"));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const missingClientData = [
    ["razao social", client.legalName],
    ["CNPJ", client.cnpj],
    ["endereco", client.address],
    ["cidade", client.city],
    ["UF", client.state],
    ["e-mail", client.email],
  ].filter(([, value]) => !value).map(([label]) => label);

  const document = useMemo(() => {
    if (contract?.status !== "draft" && contract?.documentSnapshot) return contract.documentSnapshot;
    try { return buildContractDocument({ ...draft, scope: scopeText.split("\n").map((item) => item.trim()).filter(Boolean) }, client, CONTRACT_PROVIDER); }
    catch { return null; }
  }, [client, contract, draft, scopeText]);

  function chooseTemplate(templateKey: ContractTemplateKey) {
    const template = CONTRACT_TEMPLATES[templateKey];
    setDraft((current) => ({ ...current, templateKey, title: template.defaultTitle, object: template.defaultObject, scope: [...template.defaultScope] }));
    setScopeText(template.defaultScope.join("\n"));
  }

  function currentDraft(): ContractDraft {
    return { ...draft, scope: scopeText.split("\n").map((item) => item.trim()).filter(Boolean) };
  }

  async function saveDraft(event?: FormEvent) {
    event?.preventDefault();
    setBusy(true); setError(null);
    try {
      const response = contract
        ? await fetch(`/api/client-contracts?id=${contract.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "save", draft: currentDraft() }) })
        : await fetch("/api/client-contracts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(currentDraft()) });
      const body = await json<{ contract: ClientContract }>(response);
      setContract(body.contract); onSaved(body.contract);
      return body.contract;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      return null;
    } finally { setBusy(false); }
  }

  async function generate() {
    setBusy(true); setError(null);
    try {
      let saved = contract;
      if (!saved) {
        const created = await json<{ contract: ClientContract }>(await fetch("/api/client-contracts", {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(currentDraft()),
        }));
        saved = created.contract;
      }
      const generated = await json<{ contract: ClientContract }>(await fetch(`/api/client-contracts?id=${saved.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "generate", draft: currentDraft() }),
      }));
      setContract(generated.contract); onSaved(generated.contract);
    } catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); }
    finally { setBusy(false); }
  }

  const editable = !contract || contract.status === "draft";
  return (
    <div className="demand-workspace-overlay contract-dialog-overlay" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}>
      <div className="contract-dialog" role="dialog" aria-modal="true" aria-label="Contrato do cliente">
        <header><div><small>Clientes / {client.name}</small><h2>{contract?.contractNumber ?? "Novo contrato"}</h2></div><button className="deal-header-btn" onClick={onClose} type="button">Fechar</button></header>
        {error ? <div className="demands-notice">{error}</div> : null}
        {missingClientData.length > 0 ? (
          <div className="demands-notice contract-data-warning">
            Dados cadastrais ausentes: {missingClientData.join(", ")}. Complete o cadastro do cliente antes do uso externo.
          </div>
        ) : null}
        <div className="contract-dialog-grid">
          {editable ? (
            <form className="contract-form" onSubmit={saveDraft}>
              <label className="contract-field-wide">Tipo de contrato
                <select value={draft.templateKey} onChange={(event) => chooseTemplate(event.target.value as ContractTemplateKey)}>
                  {Object.entries(CONTRACT_TEMPLATES).map(([key, template]) => <option key={key} value={key}>{template.label}</option>)}
                </select>
              </label>
              <label className="contract-field-wide">Titulo<input required maxLength={240} value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></label>
              <label className="contract-field-wide">Objeto<textarea required maxLength={5000} rows={4} value={draft.object} onChange={(event) => setDraft({ ...draft, object: event.target.value })} /></label>
              <label className="contract-field-wide">Escopo e entregaveis <small>Um item por linha</small><textarea required rows={7} value={scopeText} onChange={(event) => setScopeText(event.target.value)} /></label>
              <label>Valor (R$)<input required min="0.01" step="0.01" type="number" value={draft.value || ""} onChange={(event) => setDraft({ ...draft, value: Number(event.target.value) })} /></label>
              <label>Data do contrato<input required type="date" value={draft.signingDate} onChange={(event) => setDraft({ ...draft, signingDate: event.target.value })} /></label>
              <label className="contract-field-wide">Condicoes de pagamento<textarea required rows={3} maxLength={3000} value={draft.paymentTerms} onChange={(event) => setDraft({ ...draft, paymentTerms: event.target.value })} /></label>
              <label>Inicio<input type="date" value={draft.startsOn ?? ""} onChange={(event) => setDraft({ ...draft, startsOn: event.target.value || null })} /></label>
              <label>Termino<input type="date" value={draft.endsOn ?? ""} onChange={(event) => setDraft({ ...draft, endsOn: event.target.value || null })} /></label>
              <label>Representante do cliente<input required maxLength={240} value={draft.representativeName} onChange={(event) => setDraft({ ...draft, representativeName: event.target.value })} /></label>
              <label>CPF/documento<input required maxLength={40} value={draft.representativeDocument} onChange={(event) => setDraft({ ...draft, representativeDocument: event.target.value })} /></label>
              <label>Cidade de assinatura<input required maxLength={120} value={draft.signingCity} onChange={(event) => setDraft({ ...draft, signingCity: event.target.value })} /></label>
              <label className="contract-field-wide">Observacoes especificas<textarea rows={3} maxLength={5000} value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} /></label>
              <div className="contract-form-actions contract-field-wide"><button className="topbar-btn" disabled={busy} type="submit">{busy ? "Salvando..." : "Salvar rascunho"}</button></div>
            </form>
          ) : null}
          {document ? <ContractPreview busy={busy} contract={contract} document={document} onGenerate={editable ? generate : undefined} /> : <div className="demands-empty">Preencha valor, escopo, representante e condicoes para liberar a previa.</div>}
        </div>
      </div>
    </div>
  );
}
