"use client";

import { FormEvent, useState } from "react";

async function readJson(response: Response) {
  return response.json().catch(() => ({})) as Promise<{ ok?: boolean; error?: string }>;
}

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [message, setMessage] = useState("");

  async function requestLink(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const params = new URLSearchParams(window.location.search);
      const response = await fetch("/api/auth/request", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, next: params.get("next") ?? "/" }),
      });
      const body = await readJson(response);
      if (!response.ok || !body.ok) throw new Error(body.error ?? "Nao foi possivel enviar o link.");
      setSent(true);
      setMessage("Link enviado. Abra o e-mail neste navegador para entrar no CRM.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Nao foi possivel enviar o link.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="login-form" onSubmit={requestLink}>
      <label htmlFor="admin-email">E-mail administrativo</label>
      <input
        autoComplete="email"
        id="admin-email"
        onChange={(event) => { setEmail(event.target.value); setSent(false); }}
        placeholder="seu@email.com"
        required
        type="email"
        value={email}
      />
      <button disabled={busy || !email.trim()} type="submit">
        {busy ? "Enviando..." : sent ? "Reenviar link de acesso" : "Receber link de acesso"}
      </button>
      {message ? <p className="login-message" role="status">{message}</p> : null}
    </form>
  );
}
