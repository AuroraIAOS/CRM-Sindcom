import { useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { mensagemErro } from "@/lib/mensagens";

function moeda(v: number | null) {
  if (v == null) return "—";
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/**
 * Página pública do QR Code (sem login). Lê via RPC fn_dados_guia_publica
 * (token uuid = credencial de leitura) e faz check-in via fn_registrar_checkin
 * (PIN = credencial de escrita). Nenhum acesso direto a tabelas.
 */
export function GuiaPublicaPage() {
  const { token = "" } = useParams();
  const [pin, setPin] = useState("");
  const [justificativa, setJustificativa] = useState("");
  const [resultado, setResultado] = useState<string | null>(null);
  const [erroCheckin, setErroCheckin] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const guia = useQuery({
    queryKey: ["guia-publica", token],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("fn_dados_guia_publica", { p_token: token });
      if (error) throw error;
      return data?.[0] ?? null;
    },
    retry: false,
  });

  async function checkin(atendido: boolean) {
    setErroCheckin(null);
    setEnviando(true);
    const { data, error } = await supabase.rpc("fn_registrar_checkin", {
      p_token: token,
      p_pin: pin,
      p_atendido: atendido,
      p_justificativa: justificativa || undefined,
    });
    setEnviando(false);
    if (error) {
      setErroCheckin(mensagemErro(error));
      return;
    }
    const r = data as { resultado?: string } | null;
    setResultado(r?.resultado === "executada" ? "Atendimento confirmado. Obrigado!" : "Recusa registrada.");
    void guia.refetch();
  }

  return (
    <div className="mx-auto flex min-h-full max-w-md flex-col gap-4 p-4">
      {guia.isLoading && <p className="text-texto-2">Carregando guia…</p>}

      {guia.isError && (
        <p className="text-estado-erro">Não foi possível carregar esta guia.</p>
      )}

      {!guia.isLoading && !guia.isError && !guia.data && (
        <p className="text-estado-erro">Guia não encontrada.</p>
      )}

      {guia.data && (
        <div className="flex flex-col gap-3 rounded-lg bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-semibold">Guia {guia.data.numero_guia}</h1>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="text-texto-2">Interessado</dt><dd>{guia.data.interessado}</dd>
            <dt className="text-texto-2">Parceiro</dt><dd>{guia.data.parceiro}</dd>
            <dt className="text-texto-2">Serviço</dt><dd>{guia.data.servico}</dd>
            <dt className="text-texto-2">Data</dt><dd>{guia.data.data_agendada}</dd>
            <dt className="text-texto-2">Particular</dt><dd>{moeda(guia.data.valor_particular)}</dd>
            <dt className="text-texto-2">Convênio</dt><dd>{moeda(guia.data.valor_convenio)}</dd>
            <dt className="text-texto-2">Status</dt><dd className="font-bold">{guia.data.status}</dd>
          </dl>

          {resultado ? (
            <p className="rounded-md bg-estado-sucesso/10 p-3 text-sm text-estado-sucesso">{resultado}</p>
          ) : (
            guia.data.status === "solicitada" || guia.data.status === "pendente_confirmacao" ? (
              <div className="mt-2 flex flex-col gap-2 border-t border-black/10 pt-3">
                <label className="flex flex-col gap-1 text-sm">
                  Senha do recepcionista (PIN)
                  <input
                    type="password"
                    inputMode="numeric"
                    value={pin}
                    onChange={(e) => setPin(e.target.value)}
                    className="rounded-md border border-black/15 px-3 py-2 outline-none focus:border-realce"
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  Observação (opcional)
                  <input
                    value={justificativa}
                    onChange={(e) => setJustificativa(e.target.value)}
                    className="rounded-md border border-black/15 px-3 py-2 outline-none focus:border-realce"
                  />
                </label>
                {erroCheckin && <p className="text-sm text-estado-erro">{erroCheckin}</p>}
                <div className="flex gap-2">
                  <button
                    disabled={enviando || !pin}
                    onClick={() => void checkin(true)}
                    className="flex-1 rounded-md bg-estado-sucesso px-4 py-2 font-bold text-white disabled:opacity-60"
                  >
                    Atendido
                  </button>
                  <button
                    disabled={enviando || !pin}
                    onClick={() => void checkin(false)}
                    className="flex-1 rounded-md border border-estado-erro px-4 py-2 font-bold text-estado-erro disabled:opacity-60"
                  >
                    Recusado
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-texto-2">Esta guia já foi processada.</p>
            )
          )}
        </div>
      )}
    </div>
  );
}
