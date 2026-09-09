import type { Metadata } from "next";
import Image from "next/image";
import { LoginForm } from "./LoginForm";
import "./login.css";

export const metadata: Metadata = {
  title: "Acesso administrativo | Mydrion CRM",
  description: "Acesso privado à operação comercial da Mydrion.",
};

export default function LoginPage() {
  return (
    <section className="login-screen">
      <div className="login-orbit login-orbit-one" aria-hidden="true" />
      <div className="login-orbit login-orbit-two" aria-hidden="true" />
      <div className="login-shell">
        <div className="login-brand">
          <Image
            src="/brand/mydrion-contract.svg"
            alt="Mydrion"
            width={1502}
            height={251}
            priority
          />
          <span>Mydrion CRM</span>
        </div>
        <div className="login-card">
          <div className="login-eyebrow"><span /> Acesso privado</div>
          <h1>Seu CRM, protegido.</h1>
          <p className="login-lead">
            Entre normalmente com seu e-mail administrativo e sua senha.
          </p>
          <LoginForm />
          <div className="login-security-note">
            <span aria-hidden="true">✓</span>
            A senha é validada pelo Supabase e nunca é armazenada pelo CRM.
          </div>
        </div>
        <p className="login-footer">Mydrion CRM · operação comercial</p>
      </div>
    </section>
  );
}
