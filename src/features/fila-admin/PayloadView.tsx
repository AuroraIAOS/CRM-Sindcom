import type { Json } from "@/lib/database.types";
import { formatarCpf, formatarDataBR } from "@/lib/formatters";

/** Rótulos amigáveis para os campos de trabalhadores (o alvo do 01.4). */
const ROTULOS: Record<string, string> = {
  cpf: "CPF",
  nome: "Nome",
  data_nascimento: "Nascimento",
  telefone_whatsapp: "Telefone",
  email: "E-mail",
  municipio_id: "Município (id)",
  recolhe_contribuicao_sindical: "Recolhe contribuição",
  recolhe_mensalidade_convenio: "Recolhe mensalidade",
  forma_pagamento_preferida: "Forma de pagamento",
  status_cadastro: "Status",
  origem_cadastro: "Origem",
};

/** Nível derivado das flags — mostra ao Admin o que ele está aprovando. */
function nivelPrevisto(p: Record<string, unknown>): string | null {
  const contrib = p.recolhe_contribuicao_sindical;
  const mens = p.recolhe_mensalidade_convenio;
  if (typeof contrib !== "boolean") return null;
  if (contrib && mens) return "Ouro";
  if (contrib) return "Prata";
  return "Bronze";
}

function formatarValor(chave: string, valor: unknown): string {
  if (valor === null || valor === undefined || valor === "") return "—";
  if (typeof valor === "boolean") return valor ? "Sim" : "Não";
  if (chave === "cpf") return formatarCpf(String(valor));
  if (chave === "data_nascimento") return formatarDataBR(String(valor));
  return String(valor);
}

export function PayloadView({ payload }: { payload: Json | null }) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return <p className="text-sm text-texto-2">Sem dados de payload.</p>;
  }
  const obj = payload as Record<string, unknown>;
  const nivel = nivelPrevisto(obj);
  const entradas = Object.entries(obj).filter(([, v]) => v !== null && v !== undefined && v !== "");

  return (
    <div className="flex flex-col gap-2">
      {nivel && (
        <p className="text-sm">
          <span className="text-texto-2">Nível resultante:</span>{" "}
          <span className="font-bold">{nivel}</span>
        </p>
      )}
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        {entradas.map(([chave, valor]) => (
          <div key={chave} className="contents">
            <dt className="text-texto-2">{ROTULOS[chave] ?? chave}</dt>
            <dd>{formatarValor(chave, valor)}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
