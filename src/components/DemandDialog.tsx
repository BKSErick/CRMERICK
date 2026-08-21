"use client";

import { FormEvent, useEffect, useRef, useState } from "react";

export type DemandDialogOption = { id: number; label: string };

export type DemandDialogState =
  | {
      mode: "prompt";
      title: string;
      label: string;
      defaultValue?: string;
      placeholder?: string;
      confirmLabel?: string;
      /** Select opcional (usado para amarrar a pasta raiz a um deal). */
      select?: { label: string; options: DemandDialogOption[]; defaultValue?: string; emptyLabel: string };
      onConfirm: (value: string, selected: string) => void;
    }
  | {
      /** So escolha, sem campo de texto: usado para mover pasta para outro lugar da arvore. */
      mode: "select";
      title: string;
      label: string;
      options: DemandDialogOption[];
      emptyLabel: string;
      defaultValue?: string;
      confirmLabel?: string;
      onConfirm: (value: string) => void;
    }
  | {
      mode: "confirm";
      title: string;
      message: string;
      confirmLabel?: string;
      destructive?: boolean;
      onConfirm: () => void;
    };

type DemandDialogProps = {
  state: DemandDialogState | null;
  onClose: () => void;
};

/**
 * Modal da aba Demandas. Usa <dialog> nativo: showModal ja entrega foco preso,
 * backdrop e fechar no Esc sem biblioteca.
 */
export function DemandDialog({ state, onClose }: DemandDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const [value, setValue] = useState("");
  const [selected, setSelected] = useState("");
  const [lastState, setLastState] = useState(state);

  // Cada abertura chega como um objeto novo: reinicia os campos durante a
  // renderizacao, sem effect, que e o padrao do React para estado derivado.
  if (state !== lastState) {
    setLastState(state);
    setValue(state?.mode === "prompt" ? state.defaultValue ?? "" : "");
    if (state?.mode === "prompt") setSelected(state.select?.defaultValue ?? "");
    else if (state?.mode === "select") setSelected(state.defaultValue ?? "");
    else setSelected("");
  }

  // O effect so sincroniza o DOM do <dialog>, que e um sistema externo.
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (state && !dialog.open) dialog.showModal();
    if (!state && dialog.open) dialog.close();
  }, [state]);

  if (!state) return <dialog className="demand-dialog" ref={ref} />;

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!state) return;
    if (state.mode === "prompt") {
      const trimmed = value.trim();
      if (!trimmed) return;
      state.onConfirm(trimmed, selected);
    } else if (state.mode === "select") {
      state.onConfirm(selected);
    } else {
      state.onConfirm();
    }
    onClose();
  }

  return (
    <dialog className="demand-dialog" onCancel={onClose} onClose={onClose} ref={ref}>
      <form className="demand-dialog-body" onSubmit={submit}>
        <h2>{state.title}</h2>

        {state.mode === "prompt" ? (
          <>
            <label>
              {state.label}
              <input
                autoFocus
                maxLength={120}
                onChange={(event) => setValue(event.target.value)}
                placeholder={state.placeholder}
                required
                value={value}
              />
            </label>
            {state.select ? (
              <label>
                {state.select.label}
                <select onChange={(event) => setSelected(event.target.value)} value={selected}>
                  <option value="">{state.select.emptyLabel}</option>
                  {state.select.options.map((option) => (
                    <option key={option.id} value={option.id}>{option.label}</option>
                  ))}
                </select>
              </label>
            ) : null}
          </>
        ) : state.mode === "select" ? (
          <label>
            {state.label}
            <select autoFocus onChange={(event) => setSelected(event.target.value)} value={selected}>
              <option value="">{state.emptyLabel}</option>
              {state.options.map((option) => (
                <option key={option.id} value={option.id}>{option.label}</option>
              ))}
            </select>
          </label>
        ) : (
          <p>{state.message}</p>
        )}

        <div className="demand-dialog-actions">
          <button className="topbar-btn" onClick={onClose} type="button">Cancelar</button>
          <button
            className={`topbar-btn ${state.mode === "confirm" && state.destructive ? "danger" : "primary"}`}
            type="submit"
          >
            {state.confirmLabel ?? (state.mode === "confirm" ? "Excluir" : "Criar")}
          </button>
        </div>
      </form>
    </dialog>
  );
}
