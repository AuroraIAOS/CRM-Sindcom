/**
 * Placeholder de fundação (Passo 1). Prova a aplicação dos tokens de design.
 * Substituído pelo roteador (AppShell + RoleGate) no Passo 3.
 */
export default function App() {
  return (
    <div className="flex min-h-full flex-col items-center justify-center gap-4 p-8 text-center">
      <img
        src="/assets/brand/logo_horizontal_colorido.png"
        alt="Sindcom"
        className="max-w-[280px]"
      />
      <h1 className="text-4xl font-semibold text-texto-1">CRM Sindcom</h1>
      <p className="max-w-md text-texto-2">
        Fundação inicializada. <em>"Sozinho o peso é maior."</em>
      </p>
      <span className="rounded-md bg-realce px-4 py-2 text-sm font-bold text-white">
        Passo 1 — scaffold em construção
      </span>
    </div>
  );
}
