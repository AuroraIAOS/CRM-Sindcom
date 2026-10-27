import { useSearchParams } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCiclos } from "./api";
import { rotuloTipo, TAG, type TomTag } from "./rotulos";

/** Botões de escrita só para Admin e Secretaria. A segurança real é a RLS. */
export function usePodeOperarBoletos(): boolean {
  const { role } = useAuth();
  return role === "admin" || role === "secretaria";
}

/** O ciclo escolhido vive na URL (`?ciclo=`), então as 5 telas compartilham a escolha. */
export function useCicloSelecionado() {
  const [params, setParams] = useSearchParams();
  const ciclos = useCiclos();
  const lista = ciclos.data ?? [];
  const daUrl = params.get("ciclo");
  const padrao = lista.find((c) => !c.encerrado_em) ?? lista[0];
  const ciclo = lista.find((c) => c.id === daUrl) ?? padrao;

  function escolher(id: string) {
    const novo = new URLSearchParams(params);
    novo.set("ciclo", id);
    setParams(novo, { replace: true });
  }

  return { ciclo, cicloId: ciclo?.id, lista, escolher, carregando: ciclos.isLoading, erro: ciclos.error };
}

export function SeletorCiclo({
  cicloId,
  lista,
  onEscolher,
}: {
  cicloId: string | undefined;
  lista: Array<{ id: string; nome: string; tipo: string; encerrado_em: string | null }>;
  onEscolher: (id: string) => void;
}) {
  if (lista.length === 0) return null;
  return (
    <Select value={cicloId} onValueChange={onEscolher}>
      <SelectTrigger className="w-full sm:w-80" aria-label="Ciclo">
        <SelectValue placeholder="Escolha o ciclo" />
      </SelectTrigger>
      <SelectContent>
        {lista.map((c) => (
          <SelectItem key={c.id} value={c.id}>
            {rotuloTipo(c.tipo)} · {c.nome}
            {c.encerrado_em ? " (encerrado)" : ""}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

const TOM_CLASSE: Record<TomTag, string> = {
  neutro: "bg-estado-neutro/10 text-estado-neutro",
  alerta: "bg-estado-alerta/10 text-estado-alerta",
  erro: "bg-estado-erro/10 text-estado-erro",
  ok: "bg-estado-sucesso/10 text-estado-sucesso",
  info: "bg-realce/10 text-realce",
};

export function TagBoleto({ tag }: { tag: string | null | undefined }) {
  const info = (tag && TAG[tag]) || { rotulo: tag ?? "—", tom: "neutro" as TomTag };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold",
        TOM_CLASSE[info.tom],
      )}
    >
      {info.rotulo}
    </span>
  );
}

export const ROTULO_CONTATO: Record<string, string> = {
  sem_email: "Sem e-mail",
  email_invalido: "E-mail inválido",
  a_avisar: "A avisar",
  aviso_enviado: "Aviso enviado",
  cobranca_enviada: "Cobrança enviada",
  respondeu: "Respondeu",
};
