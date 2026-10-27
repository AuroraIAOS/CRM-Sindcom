import { Link } from "react-router-dom";
import { AlertTriangle } from "lucide-react";
import { KpiCard } from "@/components/shared/KpiCard";
import { formatarDataBR } from "@/lib/formatters";
import { mensagemErro } from "@/lib/mensagens";
import { useCaixasBrevoPendente, useConvencoesSemValorBase, useFunilCiclos } from "./api";
import { SeletorCiclo, useCicloSelecionado } from "./comum";
import { rotuloTipo } from "./rotulos";

/** `/boletos` — onde está cada boleto do ciclo e o que está travado. */
export function VisaoGeralPage() {
  const { ciclo, cicloId, lista, escolher, carregando, erro } = useCicloSelecionado();
  const funil = useFunilCiclos();
  const semBase = useConvencoesSemValorBase(cicloId);
  const brevo = useCaixasBrevoPendente();

  if (carregando || funil.isLoading) return <p className="text-texto-2">Carregando…</p>;
  const falha = erro ?? funil.error;
  if (falha) return <p className="text-estado-erro">{mensagemErro(falha)}</p>;

  const f = (funil.data ?? []).find((x) => x.ciclo_id === cicloId);
  const link = (tag: string) => `/boletos/status?ciclo=${cicloId}&tag=${tag}`;
  const n = (v: number | null | undefined) => v ?? 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-3xl font-semibold text-texto-1">Boletos</h1>
        <SeletorCiclo cicloId={cicloId} lista={lista} onEscolher={escolher} />
      </div>

      {!ciclo || !f ? (
        <p className="text-texto-2">
          Nenhum ciclo de boletos ainda. Crie o primeiro em{" "}
          <Link className="underline" to="/boletos/ciclos">
            Ciclos
          </Link>
          .
        </p>
      ) : (
        <>
          <p className="text-sm text-texto-2">
            {rotuloTipo(ciclo.tipo)} · {ciclo.nome} · vencimento {formatarDataBR(ciclo.data_vencimento)}
            {ciclo.prazo_resposta ? ` · resposta até ${formatarDataBR(ciclo.prazo_resposta)}` : ""}
            {ciclo.encerrado_em ? " · encerrado" : ""}
          </p>

          {(brevo.data?.length ?? 0) > 0 && (
            <Alerta>
              <strong>Atualize o contato na Brevo.</strong> O link de {brevo.data?.length}{" "}
              {brevo.data?.length === 1 ? "caixa foi trocado" : "caixas foram trocados"}, mas a lista da Brevo ainda
              tem o link antigo:{" "}
              {brevo.data
                ?.slice(0, 5)
                .map((c) => c.email)
                .join(", ")}
              {(brevo.data?.length ?? 0) > 5 ? "…" : ""}. Veja em{" "}
              <Link className="underline" to="/boletos/caixas">
                Caixas e links
              </Link>
              .
            </Alerta>
          )}

          {(semBase.data?.length ?? 0) > 0 && (
            <Alerta>
              <strong>Falta o valor-base</strong>, então estes boletos ficam sem valor:
              <ul className="mt-1 list-disc pl-5">
                {semBase.data?.map((c) => (
                  <li key={`${c.ciclo_id}-${c.convencao_id}`}>
                    {c.convencao_nome} · falta cadastrar a {rotuloTipo(c.tipo)} ({c.boletos}{" "}
                    {c.boletos === 1 ? "boleto" : "boletos"})
                  </li>
                ))}
              </ul>
              Cadastre em <Link className="underline" to="/convencoes">Convenções › Taxas</Link> e use “Recalcular
              valores” em Ciclos.
            </Alerta>
          )}

          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <KpiCard titulo="Total no ciclo" valor={n(f.total)} para={`/boletos/status?ciclo=${cicloId}`} />
            <KpiCard titulo="Aguardando dados" valor={n(f.aguardando_dados)} para={link("aguardando_dados")} />
            <KpiCard titulo="Fazer boleto" valor={n(f.fazer)} para={link("fazer")} />
            <KpiCard titulo="Enviar boleto" valor={n(f.enviar)} para={link("enviar")} />
            <KpiCard
              titulo="Enviados"
              valor={n(f.enviado)}
              detalhe="Inclui os atrasados"
              para={link("enviado")}
            />
            <KpiCard
              titulo="Atrasados"
              valor={n(f.atrasado)}
              destaque={n(f.atrasado) > 0 ? "erro" : "neutro"}
              para={link("atrasado")}
            />
            <KpiCard titulo="Pagos" valor={n(f.pago)} para={link("pago")} />
            <KpiCard
              titulo="Caixas completas"
              valor={`${n(f.caixas_completas)}/${n(f.caixas_total)}`}
              detalhe={`${n(f.caixas_avisadas)} avisadas · ${n(f.caixas_cobradas)} cobradas`}
              para={`/boletos/dados?ciclo=${cicloId}`}
            />
          </div>

          {(n(f.sem_email) > 0 || n(f.email_invalido) > 0 || n(f.sem_valor) > 0 || n(f.cancelado) > 0) && (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <KpiCard
                titulo="Sem e-mail"
                valor={n(f.sem_email)}
                detalhe="Contato manual"
                destaque={n(f.sem_email) > 0 ? "alerta" : "neutro"}
                para="/boletos/ciclos"
              />
              <KpiCard
                titulo="E-mail inválido"
                valor={n(f.email_invalido)}
                detalhe="Contato manual"
                destaque={n(f.email_invalido) > 0 ? "alerta" : "neutro"}
                para="/boletos/ciclos"
              />
              <KpiCard
                titulo="Sem valor"
                valor={n(f.sem_valor)}
                detalhe={`${n(f.sem_valor_base)} por falta de valor-base`}
                destaque={n(f.sem_valor) > 0 ? "alerta" : "neutro"}
              />
              <KpiCard titulo="Cancelados" valor={n(f.cancelado)} para={link("cancelado")} />
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Alerta({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-md border border-estado-alerta/40 bg-estado-alerta/10 p-3 text-sm text-texto-1">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-estado-alerta" />
      <div>{children}</div>
    </div>
  );
}
