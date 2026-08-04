import "../../login/login.css";

export default function AuthCallbackPage() {
  return (
    <section className="login-screen" aria-live="polite">
      <div className="login-card">
        <div className="login-eyebrow"><span /> Acesso privado</div>
        <h1>Validando acesso...</h1>
        <p className="login-lead">Aguarde enquanto o Supabase confirma sua sessao.</p>
      </div>
    </section>
  );
}
