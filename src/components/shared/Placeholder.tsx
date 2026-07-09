/**
 * Stub de tela para a Fase 0. As telas reais chegam na Fase 1+ (nenhuma antes
 * da suíte RLS 100% verde). Serve para provar o roteamento e a navegação.
 */
export function Placeholder({ titulo }: { titulo: string }) {
  return (
    <div className="flex flex-col gap-2">
      <h1 className="text-3xl font-semibold text-texto-1">{titulo}</h1>
      <p className="text-texto-2">
        Tela em construção — chega na Fase 1. A fundação (auth, RLS, navegação
        por papel) é a entrega da Fase 0.
      </p>
    </div>
  );
}
