import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { NivelBadge } from "@/components/shared/NivelBadge";
import { AlertTriangle, Download, Info } from "lucide-react";
import { formatarCpf, formatarDataBR } from "@/lib/formatters";
import { mensagemErro } from "@/lib/mensagens";
import { exportarCsv, type ColunaCsv } from "@/lib/csv";
import { cn } from "@/lib/utils";
import {
  ROTULO_SITUACAO,
  useConvencoesParaCartas,
  useVisaoAnualCartas,
  type CartasFiltros,
  type SituacaoCarta,
  type TrabalhadorCarta,
} from "./api";

/**
 * `/cartas` — visão anual de cartas de oposição (specs/frontend.md §2.2).
 *
 * A tela existe para tornar visível o descolamento entre "entregou a carta" e
 * "mudou de nível". Mostrar só entregou/faltou esconderia o balde 4 (Ouro com
 * carta), que é justamente o único que exige ação humana.
 */

const CORES_SITUACAO: Record<SituacaoCarta, string> = {
  regride_bronze: "bg-nivel-bronze-bg text-nivel-bronze-fg",
  mantem_prata: "bg-nivel-prata-bg text-nivel-prata-fg",
  ouro_renovado: "bg-nivel-ouro-bg text-nivel-ouro-fg",
  ouro_pendente: "bg-estado-alerta/15 text-estado-alerta",
};

const ORDEM_SITUACAO: SituacaoCarta[] = [
  "regride_bronze",
  "mantem_prata",
  "ouro_renovado",
  "ouro_pendente",
];

/** O CSV precisa mostrar o MESMO rótulo da tela — exportar o valor cru do enum
 *  (`prata`) onde o usuário lê um selo "Prata" é a divergência tela×arquivo do
 *  `orientacoes.md` §4.4, em versão pequena. */
const ROTULO_NIVEL = { bronze: "Bronze", prata: "Prata", ouro: "Ouro" } as const;

const COLUNAS_CSV: ColunaCsv<TrabalhadorCarta>[] = [
  { titulo: "Trabalhador", valor: (l) => l.trabalhador },
  { titulo: "CPF", valor: (l) => formatarCpf(l.cpf) },
  { titulo: "Nível atual", valor: (l) => (l.nivel ? ROTULO_NIVEL[l.nivel] : "") },
  { titulo: "Convenção", valor: (l) => l.convencao },
  { titulo: "Ano-base", valor: (l) => l.ano_base },
  { titulo: "Entregou carta", valor: (l) => (l.carta_id ? "Sim" : "Não") },
  { titulo: "Data de entrega", valor: (l) => formatarDataBR(l.data_entrega) },
  { titulo: "Situação", valor: (l) => ROTULO_SITUACAO[l.situacao] },
  { titulo: "Muda de nível", valor: (l) => (l.mudaDeNivel ? "Sim" : "Não") },
  { titulo: "Estabelecimento(s)", valor: (l) => l.estabelecimentos.join(" · ") },
  { titulo: "Empresa(s)", valor: (l) => l.empresas.join(" · ") },
];

export function ListaCartasPage() {
  const convencoes = useConvencoesParaCartas();

  const anosDisponiveis = useMemo(() => {
    const anos = new Set<number>((convencoes.data ?? []).map((c) => c.ano_base));
    return [...anos].sort((a, b) => b - a);
  }, [convencoes.data]);

  const [anoBase, setAnoBase] = useState<number | null>(null);
  const [convencaoId, setConvencaoId] = useState<string>("todas");
  const [situacao, setSituacao] = useState<SituacaoCarta | "todas">("todas");
  const [busca, setBusca] = useState("");
  const [exportando, setExportando] = useState(false);

  // Default: o ano-base mais recente entre as CCTs cadastradas.
  const anoEfetivo = anoBase ?? anosDisponiveis[0] ?? null;

  const filtros: CartasFiltros = useMemo(
    () => ({ anoBase: anoEfetivo, convencaoId, situacao, busca }),
    [anoEfetivo, convencaoId, situacao, busca],
  );

  const visao = useVisaoAnualCartas(filtros);

  const convencoesDoAno = (convencoes.data ?? []).filter(
    (c) => anoEfetivo === null || c.ano_base === anoEfetivo,
  );

  function exportar() {
    setExportando(true);
    try {
      // Exporta EXATAMENTE a lista já agregada da tela — nunca uma segunda
      // consulta (orientacoes.md §4.4). Este CSV vira lista de reclassificação.
      exportarCsv(
        `cartas-oposicao-${anoEfetivo ?? "todas"}`,
        visao.data?.linhas ?? [],
        COLUNAS_CSV,
      );
    } finally {
      setExportando(false);
    }
  }

  const totais = visao.data?.totais;
  const pendentes = totais?.ouro_pendente ?? 0;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-3xl font-semibold text-texto-1">Cartas de oposição</h1>
        <p className="text-sm text-texto-2">
          Quem entregou e quem falta, por ano-base da convenção. A oposição é{" "}
          <strong>anual</strong>: quem está Bronze por carta de um ano anterior e não entrega
          neste ano volta a Prata.
        </p>
      </div>

      {(visao.isError || convencoes.isError) && (
        <p className="text-sm text-estado-erro">
          {mensagemErro(visao.error ?? convencoes.error)}
        </p>
      )}

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={anoEfetivo === null ? "todas" : String(anoEfetivo)}
          onValueChange={(v) => setAnoBase(v === "todas" ? null : Number(v))}
        >
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Ano-base" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todos os anos</SelectItem>
            {anosDisponiveis.map((a) => (
              <SelectItem key={a} value={String(a)}>
                Ano-base {a}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={convencaoId} onValueChange={setConvencaoId}>
          <SelectTrigger className="w-72">
            <SelectValue placeholder="Convenção" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas as CCTs</SelectItem>
            {convencoesDoAno.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.nome}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={situacao}
          onValueChange={(v) => setSituacao(v as SituacaoCarta | "todas")}
        >
          <SelectTrigger className="w-56">
            <SelectValue placeholder="Situação" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas as situações</SelectItem>
            {ORDEM_SITUACAO.map((s) => (
              <SelectItem key={s} value={s}>
                {ROTULO_SITUACAO[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Input
          placeholder="Buscar por nome ou CPF…"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="w-56"
        />

        <Button
          variant="outline"
          size="sm"
          onClick={exportar}
          disabled={exportando || !visao.data}
          className="ml-auto"
        >
          <Download className="mr-2 h-4 w-4" />
          {exportando ? "Exportando…" : "Exportar CSV"}
        </Button>
      </div>

      {/* Prazo em aberto: a contagem é parcial e precisa dizer isso. */}
      {visao.data?.parcial && (
        <p className="flex items-start gap-2 rounded-md bg-estado-alerta/10 p-3 text-sm text-estado-alerta">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            <strong>Contagem parcial.</strong> Há convenção com prazo de oposição ainda aberto —
            quem ainda não entregou pode entregar. Os números só ficam definitivos após o prazo:{" "}
            {visao.data.prazos
              .filter((p) => !p.encerrado)
              .map((p) => `${p.convencao} (até ${formatarDataBR(p.dataLimite)})`)
              .join(" · ")}
            .
          </span>
        </p>
      )}

      {/* Os 4 baldes */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {ORDEM_SITUACAO.map((s) => (
          <Card key={s} className="flex flex-col gap-1 p-4">
            <span className="text-sm text-texto-2">{ROTULO_SITUACAO[s]}</span>
            <span className="text-3xl font-semibold text-texto-1">
              {visao.isLoading ? "—" : (totais?.[s] ?? 0)}
            </span>
          </Card>
        ))}
      </div>

      {pendentes > 0 && (
        <p className="flex items-start gap-2 rounded-md bg-estado-alerta/10 p-3 text-sm text-estado-alerta">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            <strong>
              {pendentes} trabalhador(es) Ouro entregou/entregaram carta e NÃO regride(m)
              automaticamente.
            </strong>{" "}
            A adesão ao convênio tem fidelidade mínima de 1 ano e precisa ser cancelada
            formalmente antes da regressão de nível. Até lá, a mensalidade continua sendo cobrada
            e os benefícios seguem ativos. Filtre por "{ROTULO_SITUACAO.ouro_pendente}" para ver a
            lista.
          </span>
        </p>
      )}

      {/* Lista nominal */}
      <Card className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Trabalhador</TableHead>
              <TableHead>Nível atual</TableHead>
              <TableHead>Convenção</TableHead>
              <TableHead>Carta</TableHead>
              <TableHead>Situação ao fim do prazo</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visao.isLoading ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center text-texto-2">
                  Carregando…
                </TableCell>
              </TableRow>
            ) : (visao.data?.linhas.length ?? 0) === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center text-texto-2">
                  Nenhum trabalhador no recorte selecionado. Verifique se a convenção tem
                  estabelecimentos com vínculos ativos.
                </TableCell>
              </TableRow>
            ) : (
              visao.data?.linhas.map((l) => (
                <TableRow key={`${l.trabalhador_id}-${l.convencao_id}`}>
                  <TableCell>
                    <Link
                      to={`/trabalhadores/${l.trabalhador_id}`}
                      className="flex flex-col hover:underline"
                    >
                      <span className="text-texto-1">{l.trabalhador}</span>
                      <span className="text-xs text-texto-2">{formatarCpf(l.cpf)}</span>
                    </Link>
                  </TableCell>
                  <TableCell>{l.nivel && <NivelBadge nivel={l.nivel} />}</TableCell>
                  <TableCell className="text-sm text-texto-2">{l.convencao}</TableCell>
                  <TableCell className="text-sm">
                    {l.carta_id ? formatarDataBR(l.data_entrega) : "—"}
                  </TableCell>
                  <TableCell>
                    <span
                      className={cn(
                        "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium",
                        CORES_SITUACAO[l.situacao],
                      )}
                    >
                      {ROTULO_SITUACAO[l.situacao]}
                    </span>
                    {l.mudaDeNivel && (
                      <span className="ml-2 text-xs text-texto-2">(muda de nível)</span>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      {visao.data && visao.data.linhas.length > 0 && (
        <p className="text-sm text-texto-2">
          {visao.data.totalPessoas} trabalhador(es) no recorte ·{" "}
          <strong>{visao.data.totalMudam}</strong> mudaria(m) de nível se a organização interna
          fosse executada agora.
        </p>
      )}
    </div>
  );
}
