"use client";

import { useMemo, useState } from "react";
import { defaultLocalCRMConfig, localConfigKeys, type LocalCRMConfig } from "@/lib/localConfig";

type TestState =
  | { status: "idle"; message: string }
  | { status: "loading"; message: string }
  | { status: "success"; message: string }
  | { status: "error"; message: string };

const boolToStorage = (value: boolean) => (value ? "true" : "false");
const storageToBool = (value: string | null, fallback: boolean) => (value == null ? fallback : value === "true");

function readLocalConfig(): LocalCRMConfig {
  if (typeof window === "undefined") {
    return defaultLocalCRMConfig;
  }

  return {
    supabaseUrl: localStorage.getItem(localConfigKeys.supabaseUrl) ?? "",
    supabaseAnonKey: localStorage.getItem(localConfigKeys.supabaseAnonKey) ?? "",
    instagramAccessToken: localStorage.getItem(localConfigKeys.instagramAccessToken) ?? "",
    instagramBusinessAccountId: localStorage.getItem(localConfigKeys.instagramBusinessAccountId) ?? "",
    theme: (localStorage.getItem(localConfigKeys.theme) as LocalCRMConfig["theme"]) || "light",
    emailNotifications: storageToBool(
      localStorage.getItem(localConfigKeys.emailNotifications),
      defaultLocalCRMConfig.emailNotifications,
    ),
    pushNotifications: storageToBool(
      localStorage.getItem(localConfigKeys.pushNotifications),
      defaultLocalCRMConfig.pushNotifications,
    ),
  };
}

export default function ConfiguracoesPage() {
  const [config, setConfig] = useState<LocalCRMConfig>(readLocalConfig);
  const [savedAt, setSavedAt] = useState<string>("");
  const [testState, setTestState] = useState<TestState>({
    status: "idle",
    message: "Use o teste para validar as credenciais atuais do Instagram.",
  });

  const hasInstagramOverride = Boolean(config.instagramAccessToken || config.instagramBusinessAccountId);
  const hasSupabaseOverride = Boolean(config.supabaseUrl || config.supabaseAnonKey);

  const sourceCards = useMemo(
    () => [
      {
        name: "Supabase",
        status: hasSupabaseOverride ? "Override local" : "Env/legado",
        tone: hasSupabaseOverride ? "connected" : "pending",
        desc: hasSupabaseOverride
          ? "Credenciais locais serao priorizadas nos proximos clientes Supabase migrados."
          : "Sem override local salvo. A migracao usa configuracao de ambiente/legado.",
      },
      {
        name: "Instagram",
        status: hasInstagramOverride ? "Override local" : "Server env",
        tone: hasInstagramOverride ? "connected" : "pending",
        desc: hasInstagramOverride
          ? "Teste usa headers locais enviados para a API server-side."
          : "A API usa IG_ACCESS_TOKEN e IG_BUSINESS_ACCOUNT_ID do servidor.",
      },
      {
        name: "CRM Store",
        status: "Ativo",
        tone: "connected",
        desc: "Deals e contatos ja estao centralizados em Zustand para migracao incremental.",
      },
    ],
    [hasInstagramOverride, hasSupabaseOverride],
  );

  function updateConfig<K extends keyof LocalCRMConfig>(key: K, value: LocalCRMConfig[K]) {
    setConfig((current) => ({ ...current, [key]: value }));
  }

  function saveConfig() {
    localStorage.setItem(localConfigKeys.supabaseUrl, config.supabaseUrl.trim());
    localStorage.setItem(localConfigKeys.supabaseAnonKey, config.supabaseAnonKey.trim());
    localStorage.setItem(localConfigKeys.instagramAccessToken, config.instagramAccessToken.trim());
    localStorage.setItem(localConfigKeys.instagramBusinessAccountId, config.instagramBusinessAccountId.trim());
    localStorage.setItem(localConfigKeys.theme, config.theme);
    localStorage.setItem(localConfigKeys.emailNotifications, boolToStorage(config.emailNotifications));
    localStorage.setItem(localConfigKeys.pushNotifications, boolToStorage(config.pushNotifications));
    setSavedAt(new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }));
  }

  function clearConfig() {
    Object.values(localConfigKeys).forEach((key) => localStorage.removeItem(key));
    setConfig(defaultLocalCRMConfig);
    setSavedAt("");
    setTestState({ status: "idle", message: "Overrides locais limpos. A API volta a usar env do servidor." });
  }

  async function testInstagram() {
    setTestState({ status: "loading", message: "Testando conexao com Instagram..." });

    try {
      const headers = new Headers();
      if (config.instagramAccessToken.trim()) {
        headers.set("x-crm-ig-access-token", config.instagramAccessToken.trim());
      }
      if (config.instagramBusinessAccountId.trim()) {
        headers.set("x-crm-ig-business-account-id", config.instagramBusinessAccountId.trim());
      }

      const response = await fetch("/api/instagram", { headers });
      const body = await response.json();

      if (!response.ok || !body.ok) {
        throw new Error(body.error ?? "Falha ao testar Instagram.");
      }

      setTestState({
        status: "success",
        message: `Conectado como @${body.profile?.username ?? "perfil"} usando ${body.credentialSource}.`,
      });
    } catch (error) {
      setTestState({
        status: "error",
        message: error instanceof Error ? error.message : "Falha inesperada ao testar Instagram.",
      });
    }
  }

  return (
    <section>
      <div className="page-header">
        <div className="page-header-left">
          <h1>Configuracoes</h1>
          <div className="subtitle">
            Credenciais locais de teste, fontes de dados e preferencias do CRM. A producao segue usando variaveis de ambiente server-side.
          </div>
        </div>
        <div className="page-header-right">
          <div className="label">Status</div>
          <div className="value">{hasInstagramOverride || hasSupabaseOverride ? "Override" : "Env"}</div>
        </div>
      </div>

      <div className="settings-shell">
        <aside className="settings-panel">
          <a className="settings-panel-item active" href="#fontes">
            Fontes
          </a>
          <a className="settings-panel-item" href="#instagram">
            Instagram
          </a>
          <a className="settings-panel-item" href="#supabase">
            Supabase
          </a>
          <a className="settings-panel-item" href="#preferencias">
            Preferencias
          </a>
        </aside>

        <div className="settings-main">
          <div className="sources-grid" id="fontes">
            {sourceCards.map((source) => (
              <article className="source-card" key={source.name}>
                <div className="source-card-header">
                  <span className="source-card-name">{source.name}</span>
                  <span className={`source-status ${source.tone}`}>
                    <span className={`source-status-dot ${source.tone}`} />
                    {source.status}
                  </span>
                </div>
                <div className="source-card-desc">{source.desc}</div>
              </article>
            ))}
          </div>

          <article className="settings-card" id="instagram">
            <div className="settings-card-header">
              <div>
                <div className="settings-section-title">Instagram Graph API</div>
                <div className="settings-section-desc">
                  Salve token e account id locais apenas para teste. Sem override, `/api/instagram` usa env do servidor.
                </div>
              </div>
              <span className={`status-pill ${hasInstagramOverride ? "active" : "inactive"}`}>
                {hasInstagramOverride ? "Override local" : "Server env"}
              </span>
            </div>

            <label className="field-label" htmlFor="instagramBusinessAccountId">
              Business Account ID
            </label>
            <input
              className="settings-input"
              id="instagramBusinessAccountId"
              value={config.instagramBusinessAccountId}
              onChange={(event) => updateConfig("instagramBusinessAccountId", event.target.value)}
              placeholder="17841444737911156"
            />

            <label className="field-label" htmlFor="instagramAccessToken">
              Access token local
            </label>
            <input
              className="settings-input"
              id="instagramAccessToken"
              type="password"
              value={config.instagramAccessToken}
              onChange={(event) => updateConfig("instagramAccessToken", event.target.value)}
              placeholder="Token long-lived para teste local"
            />

            <div className={`connection-status ${testState.status}`}>{testState.message}</div>
            <button className="topbar-btn" type="button" onClick={testInstagram}>
              Testar Instagram
            </button>
          </article>

          <article className="settings-card" id="supabase">
            <div className="settings-card-header">
              <div>
                <div className="settings-section-title">Supabase</div>
                <div className="settings-section-desc">
                  Overrides locais preparados para os proximos clientes Supabase migrados para React.
                </div>
              </div>
              <span className={`status-pill ${hasSupabaseOverride ? "active" : "inactive"}`}>
                {hasSupabaseOverride ? "Override local" : "Sem override"}
              </span>
            </div>

            <label className="field-label" htmlFor="supabaseUrl">
              Supabase URL
            </label>
            <input
              className="settings-input"
              id="supabaseUrl"
              value={config.supabaseUrl}
              onChange={(event) => updateConfig("supabaseUrl", event.target.value)}
              placeholder="https://seu-projeto.supabase.co"
            />

            <label className="field-label" htmlFor="supabaseAnonKey">
              Publishable/anon key local
            </label>
            <input
              className="settings-input"
              id="supabaseAnonKey"
              type="password"
              value={config.supabaseAnonKey}
              onChange={(event) => updateConfig("supabaseAnonKey", event.target.value)}
              placeholder="Chave publica para teste local"
            />
          </article>

          <article className="settings-card" id="preferencias">
            <div className="settings-card-header">
              <div>
                <div className="settings-section-title">Preferencias</div>
                <div className="settings-section-desc">Preferencias locais salvas no mesmo pacote de configuracao.</div>
              </div>
            </div>

            <div className="pref-row">
              <div>
                <div className="pref-label">Tema</div>
                <div className="pref-desc">Preferencia visual local para proximas telas migradas.</div>
              </div>
              <select
                className="pref-select"
                value={config.theme}
                onChange={(event) => updateConfig("theme", event.target.value as LocalCRMConfig["theme"])}
              >
                <option value="light">Claro</option>
                <option value="dark">Escuro</option>
              </select>
            </div>

            <PreferenceToggle
              checked={config.emailNotifications}
              description="Receber resumos semanais e alertas importantes."
              label="Notificacoes por email"
              onChange={(value) => updateConfig("emailNotifications", value)}
            />
            <PreferenceToggle
              checked={config.pushNotifications}
              description="Alertas em tempo real no navegador."
              label="Notificacoes push"
              onChange={(value) => updateConfig("pushNotifications", value)}
            />
          </article>

          <div className="settings-actions">
            <button className="topbar-btn primary" type="button" onClick={saveConfig}>
              Salvar configuracoes
            </button>
            <button className="topbar-btn" type="button" onClick={clearConfig}>
              Limpar overrides
            </button>
            {savedAt ? <span className="settings-saved">Salvo as {savedAt}</span> : null}
          </div>
        </div>
      </div>
    </section>
  );
}

type PreferenceToggleProps = {
  checked: boolean;
  description: string;
  label: string;
  onChange: (value: boolean) => void;
};

function PreferenceToggle({ checked, description, label, onChange }: PreferenceToggleProps) {
  return (
    <div className="pref-row">
      <div>
        <div className="pref-label">{label}</div>
        <div className="pref-desc">{description}</div>
      </div>
      <label className="toggle">
        <input checked={checked} onChange={(event) => onChange(event.target.checked)} type="checkbox" />
        <span className="toggle-slider" />
      </label>
    </div>
  );
}
