"use client";

import { useEffect, useState } from "react";
import {
  CONTRACT_STATUS_LABELS,
  CONTRACT_TEMPLATES,
  formatContractCurrency,
  type ClientContract,
  type ContractStatus,
} from "@/lib/clientContracts";
import type { ClientWithTotals } from "@/lib/clients";
import { ContractDialog } from "@/components/ContractDialog";

type Props = { client: ClientWithTotals; onClientChanged: () => void };

async function json<T>(response: Response): Promise<T> {
  const body = await response.json();
  if (!response.ok || body.ok === false) throw new Error(body.error ?? "Nao foi possivel carregar os contratos.");
  return body as T;
}

export function ClientContracts({ client, onClientChanged }: Props) {
  const [contracts, setContracts] = useState<ClientContract[]>([]);
  const [selected, setSelected] = useState<ClientContract | null | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetch(`/api/client-contracts?clientId=${client.id}`, { cache: "no-store" })
      .then((response) => json<{ contracts: ClientContract[] }>(response))
      .then((body) => {
        if (!active) return;
        setContracts(body.contracts);
        setError(null);
      })
      .catch((caught) => {
        if (active) setError(caught instanceof Error ? caught.message : String(caught));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [client.id]);

  function merge(contract: ClientContract) {
    setContracts((current) => [contract, ...current.filter((item) => item.id !== contract.id)]);
    setSelected(contract); onClientChanged();
  }

  async function changeStatus(contract: ClientContract, status: ContractStatus) {
    setBusyId(contract.id); setError(null);
    try {
      const body = await json<{ contract: ClientContract }>(await fetch(`/api/client-contracts?id=${contract.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "status", status }),
      }));
      merge(body.contract);
    } catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); }
    finally { setBusyId(null); }
  }

  return (
    <div className="client-contracts">
      <div className="demand-section-heading">
        <div><span>Contratos</span><small>Rascunhos, PDFs e status por cliente</small></div>
        <button className="topbar-btn primary" onClick={() => setSelected(null)} type="button">+ Novo contrato</button>
      </div>
      {error ? <div className="demands-notice">{error}</div> : null}
      {loading ? <p className="muted-copy">Carregando contratos...</p> : contracts.length === 0 ? <p className="muted-copy">Nenhum contrato criado para este cliente.</p> : (
        <div className="contract-list">
          {contracts.map((contract) => (
            <article key={contract.id}>
              <button className="contract-list-main" onClick={() => setSelected(contract)} type="button">
                <span><strong>{contract.title}</strong><small>{contract.contractNumber} · {CONTRACT_TEMPLATES[contract.templateKey].label}</small></span>
                <span><strong>{formatContractCurrency(contract.draft.value)}</strong><small className={`contract-status contract-status-${contract.status}`}>{CONTRACT_STATUS_LABELS[contract.status]}</small></span>
              </button>
              <div className="contract-list-actions">
                {contract.status !== "draft" ? <a className="topbar-btn" href={`/api/client-contracts/${contract.id}/pdf`}>PDF</a> : null}
                {contract.status === "generated" ? <button disabled={busyId === contract.id} onClick={() => void changeStatus(contract, "sent")} type="button">Marcar enviado</button> : null}
                {contract.status === "sent" ? <button disabled={busyId === contract.id} onClick={() => void changeStatus(contract, "signed")} type="button">Marcar assinado</button> : null}
                {contract.status === "generated" || contract.status === "sent" ? <button disabled={busyId === contract.id} onClick={() => void changeStatus(contract, "draft")} type="button">Voltar a rascunho</button> : null}
                {contract.status !== "signed" && contract.status !== "cancelled" ? <button disabled={busyId === contract.id} onClick={() => void changeStatus(contract, "cancelled")} type="button">Cancelar</button> : null}
              </div>
            </article>
          ))}
        </div>
      )}
      {selected !== undefined ? <ContractDialog client={client} contract={selected} onClose={() => setSelected(undefined)} onSaved={merge} /> : null}
    </div>
  );
}
