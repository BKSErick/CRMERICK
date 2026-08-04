"use client";

import { FormEvent, useState } from "react";

async function readJson(response: Response) {
  return response.json().catch(() => ({})) as Promise<{ ok?: boolean; error?: string; next?: string }>;
}

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function login(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const params = new URLSearchParams(window.location.search);
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password, next: params.get("next") ?? "/" }),
      });
      const body = await readJson(response);
      if (!response.ok || !body.ok) throw new Error(body.error ?? "E-mail ou senha invalidos.");
      window.location.assign(body.next ?? "/");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "E-mail ou senha invalidos.");
      setBusy(false);
    }
  }

  return (
    <form className="login-form" onSubmit={login}>
      <label htmlFor="admin-email">E-mail administrativo</label>
      <input
        autoComplete="email"
        id="admin-email"
        onChange={(event) => setEmail(event.target.value)}
        placeholder="seu@email.com"
        required
        type="email"
        value={email}
      />
      <label htmlFor="admin-password">Senha</label>
      <input
        autoComplete="current-password"
        id="admin-password"
        minLength={8}
        onChange={(event) => setPassword(event.target.value)}
        placeholder="Sua senha"
        required
        type="password"
        value={password}
      />
      <button disabled={busy || !email.trim() || !password} type="submit">
        {busy ? "Entrando..." : "Entrar no CRM"}
      </button>
      {message ? <p className="login-message" role="alert">{message}</p> : null}
    </form>
  );
}
