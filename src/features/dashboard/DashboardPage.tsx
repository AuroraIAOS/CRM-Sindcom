import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Banknote,
  Camera,
  ClipboardCheck,
  Inbox,
  RefreshCw,
  Scale,
  TrendingUp,
  UserPlus,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { KpiCard } from "@/components/shared/KpiCard";
import { NivelBadge } from "@/components/shared/NivelBadge";
import { useAuth } from "@/lib/auth";
import { formatarMoeda } from "@/lib/formatters";
import { mensagemErro } from "@/lib/mensagens";
import {
  useAtualizarDashboard,
  useConversoesMensais,
  useKpis,
  useKpisJuridico,
  useTirarSnapshot,
} from "./api";
import {
  FunilNiveis,
  GraficoConversoes,
  GraficoEvolucaoNiveis,
  GraficoReceita,
  PainelParceiros,
} from "./graficos";
import { MapaMunicipios } from "./MapaMunicipios";
import { DicasList } from "./DicasList";

/**
 * `/dashboard` — specs/dashboard.md.
 *
 * O corte por papel é dupla camada (dashboard.md §3): esta tela não renderiza
 * o widget que o papel não pode ver, e a RLS nega por baixo se alguém tentar
 * na marra. A camada de tela não é decoração de segurança — ela existe porque
 * as views `security_invoker` respondem ZERO (não erro) para quem a RLS
 * filtra, e zero exibido como fato é pior que acesso negado. Ver o bloco de
 * atenção em `api.ts`.
 */
export function DashboardPage() {
  const { role } = useAuth();

  // Jurídico tem painel próprio: nenhuma view financeira, K1 por consulta direta.
  if (role === "juridico") return <DashboardJuridico />;

  return <DashboardGestao />;
}

// ---------------------------------------------------------------------------
// Admin · Presidente · Secretária
// ---------------------------------------------------------------------------

function DashboardGestao() {
  const { role } = useAuth();
  const kpis = useKpis();
  const conversoes = useConversoesMensais();
  const atualizar = useAtualizarDashboard();
  const [atualizando, setAtualizando] = useState(false);

  const ehAdmin = role === "admin";
  // K5 (dashboard.md §3): Admin vê as duas filas; Secretária só aprovações;
  // Presidente não vê nenhuma — `fila_admin_pendente` é contado sob a RLS de
  // quem consulta, e ele leria 0 sem que isso signifique fila vazia.
  const veFilaAdmin = ehAdmin;
  const veAprovacoes = ehAdmin || role === "secretaria";

  const d = kpis.data;
  const mrr = Number(d?.mrr_mensalidades ?? 0) + Number(d?.mrr_contribuicoes ?? 0);

  /**
   * K2 — tendência de novos cadastros: compara os 30 dias corridos com o mês
   * anterior fechado (`v_dash_conversoes_mensais.novos_cadastros`), como manda
   * a spec. Sem mês anterior na base, não há tendência — e a UI diz isso em
   * vez de exibir "+100%", que seria um número inventado.
   */
  const tendenciaNovos = useMemo(() => {
    const serie = conversoes.data ?? [];
    if (serie.length < 2) return { variacao: null, descricao: "sem base de comparação ainda" };
    const anterior = Number(serie[serie.length - 2]?.novos_cadastros ?? 0);
    const atual = Number(d?.novos_30d ?? 0);
    if (anterior === 0) return { variacao: null, descricao: "mês anterior sem cadastros" };
    return {
      variacao: ((atual - anterior) / anterior) * 100,
      descricao: "vs. mês anterior",
    };
  }, [conversoes.data, d?.novos_30d]);

  async function handleAtualizar() {
    setAtualizando(true);
    await atualizar();
    setAtualizando(false);
    toast.success("Dashboard atualizado.");
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="font-titulo text-3xl text-texto-1">Dashboard</h1>
          <p className="text-sm text-texto-2">
            Todo número desta tela sai de uma view do banco — nenhum é estimado.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {ehAdmin ? <BotaoSnapshot /> : null}
          <Button variant="outline" size="sm" onClick={() => void handleAtualizar()} disabled={atualizando}>
            <RefreshCw className={`mr-2 h-4 w-4 ${atualizando ? "animate-spin" : ""}`} aria-hidden />
            Atualizar
          </Button>
        </div>
      </div>

      {kpis.error ? (
        <Card className="border-l-4 border-l-estado-erro">
          <CardContent className="p-4 text-sm text-texto-1">
            Não foi possível carregar os indicadores: {mensagemErro(kpis.error)}
          </CardContent>
        </Card>
      ) : null}

      {/* ---- Linha 1 · KPIs ------------------------------------------------ */}
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          titulo="Trabalhadores"
          valor={kpis.isPending ? "—" : (d?.total_trabalhadores ?? 0)}
          icone={<Users className="h-4 w-4" aria-hidden />}
          detalhe={
            <span className="mt-1 flex flex-wrap items-center gap-1">
              <Link to="/trabalhadores?nivel=bronze">
                <NivelBadge nivel="bronze" /> <span className="tabular-nums">{d?.bronze ?? 0}</span>
              </Link>
              <Link to="/trabalhadores?nivel=prata">
                <NivelBadge nivel="prata" /> <span className="tabular-nums">{d?.prata ?? 0}</span>
              </Link>
              <Link to="/trabalhadores?nivel=ouro">
                <NivelBadge nivel="ouro" /> <span className="tabular-nums">{d?.ouro ?? 0}</span>
              </Link>
            </span>
          }
        />

        <KpiCard
          titulo="Novos cadastros (30 dias)"
          valor={kpis.isPending ? "—" : (d?.novos_30d ?? 0)}
          icone={<UserPlus className="h-4 w-4" aria-hidden />}
          tendencia={tendenciaNovos}
        />

        <KpiCard
          titulo="MRR"
          valor={kpis.isPending ? "—" : formatarMoeda(mrr)}
          icone={<TrendingUp className="h-4 w-4" aria-hidden />}
          detalhe={
            // A fórmula fica visível de propósito (dashboard.md §2/K3):
            // número auditável, não mágico.
            <span>
              {formatarMoeda(d?.mrr_mensalidades ?? 0)} de mensalidades (mensal real) +{" "}
              {formatarMoeda(d?.mrr_contribuicoes ?? 0)} de contribuições (anuidade ÷ 12)
            </span>
          }
        />

        <KpiCard
          titulo="Inadimplência"
          valor={
            kpis.isPending ? (
              "—"
            ) : (
              <span className="flex flex-col gap-0 text-2xl">
                <span>
                  {d?.guias_em_atraso ?? 0}{" "}
                  <span className="text-sm font-normal text-texto-2">guia(s) de empresa</span>
                </span>
                <span>
                  {d?.boletos_inadimplentes ?? 0}{" "}
                  <span className="text-sm font-normal text-texto-2">boleto(s) individual(is)</span>
                </span>
              </span>
            )
          }
          icone={<Banknote className="h-4 w-4" aria-hidden />}
          destaque={
            (d?.guias_em_atraso ?? 0) + (d?.boletos_inadimplentes ?? 0) > 0 ? "erro" : "neutro"
          }
          detalhe={
            // A assimetria empresa × boleto é intencional e precisa aparecer
            // (dashboard.md §2/K4, política de 03/07).
            <span>
              {formatarMoeda(d?.valor_guias_em_atraso ?? 0)} em guias ·{" "}
              {formatarMoeda(d?.valor_boletos_inadimplentes ?? 0)} em boletos
            </span>
          }
        />
      </section>

      {veAprovacoes || veFilaAdmin ? (
        <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {veAprovacoes ? (
            <KpiCard
              titulo="Cadastros pendentes"
              valor={kpis.isPending ? "—" : (d?.cadastros_pendentes ?? 0)}
              icone={<ClipboardCheck className="h-4 w-4" aria-hidden />}
              detalhe="Aguardando aprovação"
              para="/aprovacoes"
              destaque={(d?.cadastros_pendentes ?? 0) > 0 ? "alerta" : "neutro"}
            />
          ) : null}
          {veFilaAdmin ? (
            <KpiCard
              titulo="Fila do Admin"
              valor={kpis.isPending ? "—" : (d?.fila_admin_pendente ?? 0)}
              icone={<Inbox className="h-4 w-4" aria-hidden />}
              detalhe="Solicitações estruturais aguardando decisão"
              para="/fila-admin"
              destaque={(d?.fila_admin_pendente ?? 0) > 0 ? "alerta" : "neutro"}
            />
          ) : null}
        </section>
      ) : null}

      {/* ---- Linha 2 · Gráficos -------------------------------------------- */}
      <section className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        <GraficoEvolucaoNiveis />
        <GraficoConversoes />
        <GraficoReceita />
        <FunilNiveis kpis={d} carregando={kpis.isPending} />
      </section>

      {/* ---- Linha 3 · Mapa e dicas ---------------------------------------- */}
      <section className="grid grid-cols-1 gap-3 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <MapaMunicipios />
        </div>
        <DicasList />
      </section>

      <section>
        <PainelParceiros />
      </section>
    </div>
  );
}

/**
 * Snapshot manual — o cron tira a fotografia no dia 1 às 04h. O botão existe
 * para não esperar o mês virar quando se quer inaugurar o histórico do G1.
 * Só Admin: `fn_guarda_job()` barra os demais no banco.
 */
function BotaoSnapshot() {
  const snapshot = useTirarSnapshot();

  async function handleSnapshot() {
    try {
      await snapshot.mutateAsync();
      toast.success("Fotografia da base registrada — ela alimenta a evolução por nível.");
    } catch (erro) {
      toast.error(mensagemErro(erro));
    }
  }

  return (
    <Button variant="outline" size="sm" onClick={() => void handleSnapshot()} disabled={snapshot.isPending}>
      <Camera className="mr-2 h-4 w-4" aria-hidden />
      Tirar fotografia
    </Button>
  );
}

// ---------------------------------------------------------------------------
// Jurídico — painel próprio (dashboard.md §3, nota ¹)
// ---------------------------------------------------------------------------

function DashboardJuridico() {
  const { data, isPending, error } = useKpisJuridico();

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="font-titulo text-3xl text-texto-1">Dashboard</h1>
        <p className="text-sm text-texto-2">
          Visão do Jurídico: composição da base e seus atendimentos. Indicadores financeiros não
          aparecem aqui porque não estão no seu acesso — e mostrá-los zerados seria informação falsa.
        </p>
      </div>

      {error ? (
        <Card className="border-l-4 border-l-estado-erro">
          <CardContent className="p-4 text-sm">{mensagemErro(error)}</CardContent>
        </Card>
      ) : null}

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <KpiCard
          titulo="Trabalhadores"
          valor={isPending ? "—" : (data?.total ?? 0)}
          icone={<Users className="h-4 w-4" aria-hidden />}
          detalhe={
            <span className="mt-1 flex flex-wrap items-center gap-1">
              <NivelBadge nivel="bronze" /> <span className="tabular-nums">{data?.bronze ?? 0}</span>
              <NivelBadge nivel="prata" /> <span className="tabular-nums">{data?.prata ?? 0}</span>
              <NivelBadge nivel="ouro" /> <span className="tabular-nums">{data?.ouro ?? 0}</span>
            </span>
          }
        />
        <KpiCard
          titulo="Meus atendimentos (30 dias)"
          valor={isPending ? "—" : (data?.atendimentos30d ?? 0)}
          icone={<Scale className="h-4 w-4" aria-hidden />}
          detalhe="Registrados no período"
          para="/juridico"
        />
      </section>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="font-titulo text-base text-texto-1">Acesso rápido</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2 pb-4">
          <Button asChild variant="outline" size="sm">
            <Link to="/juridico">
              <Scale className="mr-2 h-4 w-4" aria-hidden />
              Atendimentos jurídicos
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link to="/trabalhadores">
              <Users className="mr-2 h-4 w-4" aria-hidden />
              Trabalhadores
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
