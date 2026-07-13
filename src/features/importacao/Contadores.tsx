import type { LinhaPreview } from "./parsers";
import { contarPorStatus } from "./parsers";

export function Contadores<T>({ preview }: { preview: LinhaPreview<T>[] }) {
  const c = contarPorStatus(preview);
  const itens = [
    { rotulo: "Total", valor: c.total },
    { rotulo: "Inserir", valor: c.inserir, cor: "text-estado-sucesso" },
    { rotulo: "Atualizar", valor: c.atualizar, cor: "text-estado-alerta" },
    { rotulo: "Avisos", valor: c.avisos, cor: "text-estado-alerta" },
    { rotulo: "Rejeitadas", valor: c.rejeitadas, cor: "text-estado-erro" },
  ];
  return (
    <div className="flex flex-wrap gap-4">
      {itens.map((i) => (
        <div key={i.rotulo} className="rounded-md border bg-card px-4 py-2">
          <p className="text-xs uppercase tracking-wide text-texto-2">{i.rotulo}</p>
          <p className={`text-xl font-bold ${i.cor ?? "text-texto-1"}`}>{i.valor}</p>
        </div>
      ))}
    </div>
  );
}
