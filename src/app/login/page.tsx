import type { Metadata } from "next";
import { LoginForm } from "./LoginForm";
import "./login.css";

export const metadata: Metadata = {
  title: "Acesso administrativo | CRM Erick",
  description: "Acesso privado ao CRM Erick.",
};

export default function LoginPage() {
  return (
    <section className="login-screen">
      <div className="login-orbit login-orbit-one" aria-hidden="true" />
      <div className="login-orbit login-orbit-two" aria-hidden="true" />
      <div className="login-shell">
        <div className="login-brand">
          <span className="login-brand-mark">H</span>
          <span>Hub Operacional</span>
        </div>
        <div className="login-card">
          <div className="login-eyebrow"><span /> Acesso privado</div>
          <h1>Seu CRM, protegido.</h1>
          <p className="login-lead">
            Entre com o e-mail administrativo. Voce recebera um link seguro do Supabase para liberar esta sessao.
          </p>
          <LoginForm />
          <div className="login-security-note">
            <span aria-hidden="true">✓</span>
            Sem senha salva no navegador. A sessao e assinada e expira automaticamente.
          </div>
        </div>
        <p className="login-footer">CRM Erick · ambiente administrativo</p>
      </div>
    </section>
  );
}
