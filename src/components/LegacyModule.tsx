import fs from "node:fs";
import path from "node:path";

// Renderiza uma tela de conteúdo estático migrada do shell legado. Lê modules/{module}.html
// em BUILD TIME (Server Component em rota estática), extrai o <style> próprio + o inner do
// <main>, e injeta. O layout Next já provê Sidebar/Topbar e o hub.css é global, então o
// visual fica idêntico ao shell antigo — sem window.parent nem command palette.
//
// ⚠️ Só use para telas de CONTEÚDO estático. Telas geradas por JS (ex.: calendar) precisam
// de port React próprio; a injeção estática renderizaria containers vazios ou dados demo.

type LegacyModuleProps = {
  module: string;
  fallbackTitle: string;
};

function loadLegacyModule(moduleName: string): { style: string; content: string } {
  try {
    const html = fs.readFileSync(path.join(process.cwd(), "modules", `${moduleName}.html`), "utf8");
    const style = html.match(/<style>([\s\S]*?)<\/style>/i)?.[1]?.trim() ?? "";
    const content = html.match(/<main[^>]*>([\s\S]*?)<\/main>/i)?.[1]?.trim() ?? "";
    return { style, content };
  } catch {
    return { style: "", content: "" };
  }
}

export function LegacyModule({ module, fallbackTitle }: LegacyModuleProps) {
  const { style, content } = loadLegacyModule(module);

  if (!content) {
    return (
      <section className="page-header">
        <div className="page-header-left">
          <h1>{fallbackTitle}</h1>
          <div className="subtitle">Nao foi possivel carregar o conteudo legado deste modulo.</div>
        </div>
      </section>
    );
  }

  return (
    <>
      {style ? <style dangerouslySetInnerHTML={{ __html: style }} /> : null}
      <div className={`legacy-module legacy-${module}`} dangerouslySetInnerHTML={{ __html: content }} />
    </>
  );
}
