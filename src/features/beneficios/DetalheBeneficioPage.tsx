import { useParams, Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/shared/StatusBadge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatarDataBR, formatarMoeda } from "@/lib/formatters";
import { mensagemErro } from "@/lib/mensagens";
import { useBeneficio, useHistoricoSolicitacoesBeneficio, useUtilizacaoBeneficio90d } from "./api";

const ROTULO_NIVEL = { bronze: "Bronze", prata: "Prata", ouro: "Ouro" } as const;

export function DetalheBeneficioPage() {
  const { id } = useParams<{ id: string }>();
  const beneficio = useBeneficio(id);
  const historico = useHistoricoSolicitacoesBeneficio(id);
  const utilizacao = useUtilizacaoBeneficio90d(id);

  if (beneficio.isLoading) return <p className="text-texto-2">Carregando benefício…</p>;
  if (beneficio.isError) return <p className="text-estado-erro">{mensagemErro(beneficio.error)}</p>;
  if (!beneficio.data) return null;

  const b = beneficio.data;
  const economia =
    b.valor_particular != null && b.valor_convenio != null
      ? b.valor_particular - b.valor_convenio
      : null;
  const economiaPercentual =
    economia != null && b.valor_particular ? Math.round((economia / b.valor_particular) * 100) : null;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Link to="/beneficios" className="text-sm text-realce hover:underline">
          ← Voltar ao catálogo
        </Link>
        <h1 className="text-3xl font-semibold text-texto-1">{b.nome}</h1>
        <p className="text-sm text-texto-2">
          Parceiro:{" "}
          {b.parceiro ? (
            <Link to="/parceiros" className="text-realce hover:underline">
              {b.parceiro.nome}
            </Link>
          ) : (
            "—"
          )}
        </p>
      </div>

      <Card className="flex flex-col gap-4 p-6">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-texto-2">Categoria</dt>
            <dd>{b.categoria ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-texto-2">Nível mínimo</dt>
            <dd>{ROTULO_NIVEL[b.nivel_minimo]}</dd>
          </div>
          <div>
            <dt className="text-texto-2">Ativo</dt>
            <dd>{b.ativo ? "Sim" : "Não"}</dd>
          </div>
          <div>
            <dt className="text-texto-2">Cadastrado em</dt>
            <dd>{formatarDataBR(b.created_at)}</dd>
          </div>
        </dl>

        <div className="grid grid-cols-1 gap-4 rounded-md border border-black/10 p-4 sm:grid-cols-3">
          <div>
            <p className="text-xs text-texto-2">Valor particular</p>
            <p className="text-lg font-semibold text-texto-1">
              {formatarMoeda(b.valor_particular) || "—"}
            </p>
          </div>
          <div>
            <p className="text-xs text-texto-2">Valor convênio</p>
            <p className="text-lg font-semibold text-texto-1">
              {formatarMoeda(b.valor_convenio) || "—"}
            </p>
          </div>
          <div>
            <p className="text-xs text-texto-2">Economia do filiado</p>
            <p className="text-lg font-semibold text-estado-sucesso">
              {economia != null
                ? `${formatarMoeda(economia)}${economiaPercentual != null ? ` (${economiaPercentual}%)` : ""}`
                : "—"}
            </p>
          </div>
        </div>

        {b.descricao && (
          <div>
            <p className="text-xs text-texto-2">Descrição</p>
            <p className="text-sm text-texto-1">{b.descricao}</p>
          </div>
        )}
        {b.condicoes && (
          <div>
            <p className="text-xs text-texto-2">Condições</p>
            <p className="text-sm text-texto-1">{b.condicoes}</p>
          </div>
        )}
      </Card>

      <Card className="flex flex-col gap-2 p-6">
        <h2 className="text-lg font-semibold text-texto-1">Utilização (últimos 90 dias)</h2>
        {utilizacao.isLoading && <p className="text-texto-2">Carregando…</p>}
        {utilizacao.data && (
          <p className="text-sm text-texto-2">
            <span className="font-semibold text-texto-1">{utilizacao.data.total}</span> solicitações
            registradas, das quais{" "}
            <span className="font-semibold text-texto-1">{utilizacao.data.executadas}</span> executadas.
          </p>
        )}
      </Card>

      <Card className="flex flex-col gap-3 p-6">
        <h2 className="text-lg font-semibold text-texto-1">Histórico de solicitações</h2>
        {historico.isLoading && <p className="text-texto-2">Carregando…</p>}
        {historico.isError && <p className="text-estado-erro">{mensagemErro(historico.error)}</p>}
        {historico.data && historico.data.length === 0 && (
          <p className="text-sm text-texto-2">Nenhuma solicitação registrada para este benefício.</p>
        )}
        {historico.data && historico.data.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Guia</TableHead>
                <TableHead>Interessado</TableHead>
                <TableHead>Data</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Valor convênio</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {historico.data.map((s) => (
                <TableRow key={s.id}>
                  <TableCell>{s.numero_guia}</TableCell>
                  <TableCell>{s.beneficiado?.nome ?? s.trabalhador?.nome ?? "—"}</TableCell>
                  <TableCell>{formatarDataBR(s.data_agendada)}</TableCell>
                  <TableCell><StatusBadge status={s.status} /></TableCell>
                  <TableCell>{formatarMoeda(s.valor_convenio) || "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
