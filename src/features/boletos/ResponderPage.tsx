import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { useParams } from "react-router-dom";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatarCnpj, formatarDataBR } from "@/lib/formatters";
import {
  useResponderLink,
  useSolicitacoesDoLink,
  type CicloDoLink,
  type ItemDoLink,
  type RespostaDoItem,
} from "./apiPublica";
import { ROTULO_TIPO, type TipoBoleto } from "./rotulos";

const MAX_QUANTIDADE = 99999;
const MAX_OBS = 300;

type Linha = { quantidade: string; incorreto: boolean; obs: string };

function linhaInicial(i: ItemDoLink): Linha {
  return {
    quantidade: i.quantidade === null ? "" : String(i.quantidade),
    incorreto: i.cnpj_confirmado === false,
    obs: i.cnpj_incorreto_obs ?? "",
  };
}

function quantidadeValida(texto: string): number | null {
  if (!/^\d{1,5}$/.test(texto.trim())) return null;
  const n = Number(texto);
  return n <= MAX_QUANTIDADE ? n : null;
}

/**
 * `/responder/:token` — a empresa informa o número de trabalhadores de cada CNPJ.
 * O CNPJ é SOMENTE LEITURA: deixar trocá-lo permitiria a quem tem um link
 * responder por empresa alheia. "Está incorreto" abre uma observação.
 * Nenhum valor de boleto aparece aqui, e nenhuma chamada passa por supabase-js.
 */
export function ResponderPage() {
  const { token = "" } = useParams();
  const consulta = useSolicitacoesDoLink(token);
  const enviar = useResponderLink(token);
  const [linhas, setLinhas] = useState<Record<string, Linha>>({});
  const [avisoLocal, setAvisoLocal] = useState<string | null>(null);

  useEffect(() => {
    if (!consulta.data) return;
    setLinhas((atual) => {
      const novo = { ...atual };
      for (const c of consulta.data) {
        for (const i of c.itens) if (!(i.boleto_id in novo)) novo[i.boleto_id] = linhaInicial(i);
      }
      return novo;
    });
  }, [consulta.data]);

  const nomes = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of consulta.data ?? []) for (const i of c.itens) m.set(i.boleto_id, i.razao_social);
    return m;
  }, [consulta.data]);

  if (consulta.isLoading) {
    return (
      <Moldura>
        <Cabecalho titulo="Informar trabalhadores" />
        <p className="flex items-center justify-center gap-2 text-texto-2">
          <Loader2 className="h-5 w-5 animate-spin" /> Carregando…
        </p>
      </Moldura>
    );
  }

  if (consulta.isError) {
    return (
      <Moldura>
        <Cabecalho titulo="Não reconhecemos este link" />
        <p className="text-texto-1">{(consulta.error as Error).message}</p>
        <p className="text-sm text-texto-2">
          Ligue para <strong>(35) 3526-3847</strong>, de segunda a sexta, das 08h às 11h e das 13h às 17h.
        </p>
      </Moldura>
    );
  }

  const ciclos = consulta.data ?? [];
  if (ciclos.length === 0) {
    return (
      <Moldura>
        <Cabecalho titulo="Informar trabalhadores" />
        <p className="text-texto-1">Nenhuma solicitação aberta no momento.</p>
        <p className="text-sm text-texto-2">
          Quando o sindicato abrir uma nova solicitação, você receberá um e-mail e este mesmo link voltará a
          funcionar.
        </p>
      </Moldura>
    );
  }

  const editaveis = ciclos.flatMap((c) => c.itens.filter((i) => i.editavel));

  function atualizar(id: string, parcial: Partial<Linha>) {
    setAvisoLocal(null);
    setLinhas((l) => ({ ...l, [id]: { ...(l[id] ?? { quantidade: "", incorreto: false, obs: "" }), ...parcial } }));
  }

  function montarRespostas(): RespostaDoItem[] | string {
    const respostas: RespostaDoItem[] = [];
    for (const i of editaveis) {
      const l = linhas[i.boleto_id];
      if (!l || l.quantidade.trim() === "") continue;
      const q = quantidadeValida(l.quantidade);
      if (q === null) {
        return `Número inválido para ${formatarCnpj(i.cnpj)}: use um número inteiro de 0 a ${MAX_QUANTIDADE}.`;
      }
      if (l.incorreto && !l.obs.trim()) return `Explique o que está incorreto no CNPJ ${formatarCnpj(i.cnpj)}.`;
      respostas.push({
        boleto_id: i.boleto_id,
        quantidade: q,
        cnpj_confirmado: !l.incorreto,
        ...(l.incorreto ? { cnpj_incorreto_obs: l.obs.trim() } : {}),
      });
    }
    if (respostas.length === 0) return "Preencha o número de trabalhadores de pelo menos um CNPJ.";
    return respostas;
  }

  function aoEnviar(e: FormEvent) {
    e.preventDefault();
    const r = montarRespostas();
    if (typeof r === "string") {
      setAvisoLocal(r);
      return;
    }
    setAvisoLocal(null);
    enviar.mutate(r);
  }

  const faltam = editaveis.filter((i) => (linhas[i.boleto_id]?.quantidade ?? "").trim() === "").length;

  return (
    <Moldura>
      <Cabecalho
        titulo="Informar trabalhadores"
        subtitulo="Sindicato dos Empregados no Comércio de Passos e Região"
      />

      {enviar.isSuccess && (
        <div className="flex flex-col gap-2" role="status">
          {enviar.data.gravadas > 0 && (
            <p className="flex items-start gap-2 rounded-md bg-estado-sucesso/10 p-3 text-estado-sucesso">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
              <span>
                {enviar.data.gravadas === 1
                  ? "Informação recebida. Obrigado!"
                  : `${enviar.data.gravadas} informações recebidas. Obrigado!`}{" "}
                Você pode corrigir um número enquanto o boleto ainda não tiver sido emitido.
              </span>
            </p>
          )}
          {enviar.data.recusadas.length > 0 && (
            <div className="rounded-md bg-estado-alerta/10 p-3 text-sm text-estado-alerta">
              <p className="font-medium">Não foi possível registrar:</p>
              <ul className="list-disc pl-5">
                {enviar.data.recusadas.map((r) => (
                  <li key={r.boleto_id}>
                    {nomes.get(r.boleto_id) ?? "CNPJ"} — {r.motivo}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <form onSubmit={aoEnviar} className="flex flex-col gap-6" noValidate>
        {ciclos.map((c) => (
          <SecaoCiclo key={c.ciclo_id} ciclo={c} linhas={linhas} aoMudar={atualizar} />
        ))}

        {(avisoLocal || enviar.isError) && (
          <p role="alert" className="rounded-md bg-estado-erro/10 p-3 text-sm text-estado-erro">
            {avisoLocal ?? (enviar.error as Error).message}
          </p>
        )}

        {editaveis.length > 0 ? (
          <div className="flex flex-col gap-2">
            <Button type="submit" size="lg" disabled={enviar.isPending}>
              {enviar.isPending ? "Enviando…" : "Enviar informações"}
            </Button>
            {faltam > 0 && (
              <span className="text-sm text-texto-2">
                {faltam === 1 ? "Falta 1 CNPJ a preencher." : `Faltam ${faltam} CNPJs a preencher.`} Você pode
                enviar agora e voltar depois por este mesmo link.
              </span>
            )}
          </div>
        ) : (
          <p className="text-sm text-texto-2">
            Todas as informações já foram registradas e não podem mais ser alteradas por aqui. Para corrigir
            algo, ligue para <strong>(35) 3526-3847</strong>.
          </p>
        )}
      </form>
    </Moldura>
  );
}

function SecaoCiclo({
  ciclo,
  linhas,
  aoMudar,
}: {
  ciclo: CicloDoLink;
  linhas: Record<string, Linha>;
  aoMudar: (id: string, parcial: Partial<Linha>) => void;
}) {
  const info = ROTULO_TIPO[ciclo.tipo as TipoBoleto];
  return (
    <section className="flex flex-col gap-3" aria-labelledby={`c-${ciclo.ciclo_id}`}>
      <div className="flex flex-col gap-1">
        <h2 id={`c-${ciclo.ciclo_id}`} className="text-lg font-semibold text-texto-1">
          {ciclo.nome}
        </h2>
        <p className="text-sm text-texto-2">
          Informe o número de <strong>{info?.campo ?? "trabalhadores"}</strong> em cada CNPJ abaixo.
          {ciclo.prazo_resposta ? ` Prazo: ${formatarDataBR(ciclo.prazo_resposta)}.` : ""}
        </p>
      </div>
      <ul className="flex flex-col gap-3">
        {ciclo.itens.map((i) => (
          <ItemCnpj key={i.boleto_id} item={i} linha={linhas[i.boleto_id]} aoMudar={aoMudar} />
        ))}
      </ul>
    </section>
  );
}

function ItemCnpj({
  item,
  linha,
  aoMudar,
}: {
  item: ItemDoLink;
  linha: Linha | undefined;
  aoMudar: (id: string, parcial: Partial<Linha>) => void;
}) {
  const id = item.boleto_id;
  const l = linha ?? linhaInicial(item);
  const invalido = l.quantidade.trim() !== "" && quantidadeValida(l.quantidade) === null;
  return (
    <li className="flex flex-col gap-2 rounded-md border p-3">
      <div className="flex flex-col">
        <span className="font-medium text-texto-1">{item.razao_social}</span>
        {item.nome_fantasia && item.nome_fantasia !== item.razao_social && (
          <span className="text-sm text-texto-2">{item.nome_fantasia}</span>
        )}
        <span className="text-sm text-texto-2">CNPJ {formatarCnpj(item.cnpj)}</span>
      </div>

      {item.editavel ? (
        <>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-texto-2">Número de trabalhadores</span>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="off"
              maxLength={5}
              value={l.quantidade}
              onChange={(e) => aoMudar(id, { quantidade: e.target.value.replace(/\D/g, "") })}
              aria-invalid={invalido}
              className="h-12 w-full rounded-md border bg-white px-3 text-lg text-texto-1 sm:w-40"
            />
          </label>
          <label className="flex items-start gap-2 text-sm text-texto-1">
            <input
              type="checkbox"
              checked={l.incorreto}
              onChange={(e) => aoMudar(id, { incorreto: e.target.checked })}
              className="mt-1 h-4 w-4"
            />
            <span>Este CNPJ está incorreto</span>
          </label>
          {l.incorreto && (
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-texto-2">O que está incorreto? (obrigatório)</span>
              <textarea
                value={l.obs}
                onChange={(e) => aoMudar(id, { obs: e.target.value })}
                rows={2}
                maxLength={MAX_OBS}
                className="rounded-md border bg-white p-2 text-sm text-texto-1"
              />
            </label>
          )}
        </>
      ) : (
        <p className="text-sm text-texto-2">
          {item.quantidade !== null
            ? `Informado: ${item.quantidade}. Já em processamento no sindicato.`
            : "Sem alteração possível no momento."}
        </p>
      )}
    </li>
  );
}

function Moldura({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-fundo-1 p-4">
      <div className="mx-auto flex max-w-xl flex-col gap-5 rounded-lg bg-white p-4 shadow-sm sm:p-6">
        {children}
      </div>
      <p className="mx-auto mt-4 max-w-xl text-center text-xs text-texto-2">
        Sindicato dos Empregados no Comércio de Passos e Região ·{" "}
        <a className="underline" href="https://sindcompassos.org">
          sindcompassos.org
        </a>
      </p>
    </div>
  );
}

function Cabecalho({ titulo, subtitulo }: { titulo: string; subtitulo?: string }) {
  return (
    <header className="flex flex-col items-center gap-3 border-b pb-5 text-center">
      <img
        src={`${import.meta.env.BASE_URL}assets/brand/logo_horizontal_colorido.png`}
        alt="Sindicato dos Empregados no Comércio de Passos e Região"
        className="max-w-[220px]"
      />
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold text-texto-1">{titulo}</h1>
        {subtitulo && <p className="text-texto-2">{subtitulo}</p>}
      </div>
    </header>
  );
}
