import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChartCard } from "@/components/shared/ChartCard";
import { formatarMoeda } from "@/lib/formatters";
import { COR_EIXO, COR_ESTADO, COR_GRADE, COR_MARCA, COR_NIVEL } from "./cores";
import {
  useConversoesMensais,
  useEvolucaoNiveis,
  useReceitaMensal,
  useTopParceiros,
  type Kpis,
} from "./api";

/**
 * Gráficos G1–G5 do dashboard (specs/dashboard.md §2, linha 2).
 * Todo número aqui vem de uma view — nenhum é calculado "para preencher".
 */

const MESES_CURTOS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/**
 * "2026-07-01" → "jul/26". Fatia a string em vez de usar `new Date`, que
 * interpretaria a data como UTC e voltaria um dia em UTC-3
 * (orientacoes.md §4.2).
 */
function rotuloMes(iso: string | null): string {
  if (!iso) return "";
  const [ano, mes] = iso.slice(0, 7).split("-");
  return `${MESES_CURTOS[Number(mes) - 1]}/${ano.slice(2)}`;
}

const EIXO = { stroke: COR_EIXO, fontSize: 12 } as const;

/** Tooltip com a moldura da identidade, reaproveitada por todos os gráficos. */
const ESTILO_TOOLTIP = {
  contentStyle: {
    borderRadius: 8,
    border: `1px solid ${COR_GRADE}`,
    fontSize: 12,
    fontFamily: "Lato, sans-serif",
  },
  labelStyle: { color: COR_MARCA.texto1, fontWeight: 700 },
} as const;

// ---------------------------------------------------------------------------
// G1 — Evolução por nível (12 meses), a partir dos snapshots mensais
// ---------------------------------------------------------------------------

export function GraficoEvolucaoNiveis({ habilitado = true }: { habilitado?: boolean }) {
  const { data, isPending, error } = useEvolucaoNiveis(habilitado);

  // A view devolve uma linha por (data_ref, nível) — o gráfico quer uma linha
  // por data com as três séries lado a lado.
  const { serie, datas } = useMemo(() => {
    const porData = new Map<string, { mes: string; bronze: number; prata: number; ouro: number }>();
    for (const l of data ?? []) {
      if (!l.data_ref || !l.nivel) continue;
      const atual = porData.get(l.data_ref) ?? {
        mes: rotuloMes(l.data_ref),
        bronze: 0,
        prata: 0,
        ouro: 0,
      };
      atual[l.nivel] = l.qtd_trabalhadores ?? 0;
      porData.set(l.data_ref, atual);
    }
    const datas = [...porData.keys()].sort();
    return { serie: datas.map((d) => porData.get(d)!), datas };
  }, [data]);

  // Uma fotografia só não faz história: com 1 snapshot não há evolução a
  // desenhar, e dizer isso é mais honesto que um gráfico de um ponto.
  const primeira = datas[0];
  const semHistorico = serie.length < 2;

  return (
    <ChartCard
      titulo="Evolução por nível (12 meses)"
      descricao="Fotografia mensal da base — job automático no dia 1, às 04h"
      carregando={isPending}
      erro={error}
      vazio={semHistorico}
      mensagemVazio={
        primeira
          ? `Histórico em construção — primeira fotografia em ${rotuloMes(primeira)}. O gráfico aparece a partir da segunda.`
          : "Histórico em construção — nenhuma fotografia tirada ainda. O job mensal roda no dia 1, às 04h."
      }
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={serie} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
          <CartesianGrid stroke={COR_GRADE} strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="mes" {...EIXO} />
          {/* Eixo Y começa em 0 — exigência da spec: não distorcer a base. */}
          <YAxis domain={[0, "auto"]} allowDecimals={false} {...EIXO} />
          <Tooltip {...ESTILO_TOOLTIP} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Line type="monotone" dataKey="bronze" name="Bronze" stroke={COR_NIVEL.bronze} strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="prata" name="Prata" stroke={COR_NIVEL.prata} strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="ouro" name="Ouro" stroke={COR_NIVEL.ouro} strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

// ---------------------------------------------------------------------------
// G2 — Conversões mensais: barras empilhadas + linha de regressões
// ---------------------------------------------------------------------------

export function GraficoConversoes({ habilitado = true }: { habilitado?: boolean }) {
  const { data, isPending, error } = useConversoesMensais(habilitado);

  const serie = useMemo(
    () =>
      (data ?? []).map((l) => ({
        mes: rotuloMes(l.mes),
        bronze_prata: l.bronze_para_prata ?? 0,
        prata_ouro: l.prata_para_ouro ?? 0,
        bronze_ouro: l.bronze_para_ouro ?? 0,
        regressoes: l.regressoes ?? 0,
      })),
    [data],
  );

  return (
    <ChartCard
      titulo="Conversões mensais"
      descricao="Subidas de nível empilhadas; a linha vermelha é a regressão (churn)"
      carregando={isPending}
      erro={error}
      vazio={serie.length === 0}
      mensagemVazio="Nenhuma mudança de nível registrada ainda."
    >
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={serie} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
          <CartesianGrid stroke={COR_GRADE} strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="mes" {...EIXO} />
          <YAxis allowDecimals={false} {...EIXO} />
          <Tooltip {...ESTILO_TOOLTIP} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar stackId="conv" dataKey="bronze_prata" name="Bronze → Prata" fill={COR_NIVEL.prata} />
          <Bar stackId="conv" dataKey="prata_ouro" name="Prata → Ouro" fill={COR_NIVEL.ouro} />
          <Bar stackId="conv" dataKey="bronze_ouro" name="Bronze → Ouro" fill={COR_NIVEL.bronze} />
          <Line
            type="monotone"
            dataKey="regressoes"
            name="Regressões"
            stroke={COR_ESTADO.erro}
            strokeWidth={2}
            dot={{ r: 3 }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

// ---------------------------------------------------------------------------
// G3 — Receita mensal (área empilhada), com filtro por tipo de fatura
// ---------------------------------------------------------------------------

const TIPOS_RECEITA = [
  { valor: "todos", label: "Todos os tipos" },
  { valor: "contribuicao_sindical", label: "Contribuição sindical" },
  { valor: "mensalidade_convenio", label: "Mensalidade do convênio" },
  { valor: "excepcionais", label: "Excepcionais (multa/acordo/taxa)" },
] as const;

const TIPOS_EXCEPCIONAIS = new Set(["multa", "acordo", "taxa_cct"]);

export function GraficoReceita({ habilitado = true }: { habilitado?: boolean }) {
  const [filtro, setFiltro] = useState<string>("todos");
  const { data, isPending, error } = useReceitaMensal(habilitado);

  const serie = useMemo(() => {
    const relevantes = (data ?? []).filter((l) => {
      if (filtro === "todos") return true;
      if (filtro === "excepcionais") return TIPOS_EXCEPCIONAIS.has(l.tipo ?? "");
      return l.tipo === filtro;
    });

    const porMes = new Map<string, { realizada: number; pendente: number }>();
    for (const l of relevantes) {
      if (!l.mes) continue;
      const atual = porMes.get(l.mes) ?? { realizada: 0, pendente: 0 };
      atual.realizada += Number(l.receita_realizada ?? 0);
      atual.pendente += Number(l.receita_pendente ?? 0);
      porMes.set(l.mes, atual);
    }
    if (porMes.size === 0) return [];

    // Preenche os meses SEM competência com zero em vez de omiti-los.
    // Omitir encostaria jan/25 em jan/26 no eixo, como se fossem meses
    // consecutivos, e a área desenharia uma rampa contínua entre duas datas
    // distantes — receita que nunca existiu, com aparência de tendência.
    const chaves = [...porMes.keys()].sort();
    const fim = chaves[chaves.length - 1];
    const [anoFim, mesFim] = fim.slice(0, 7).split("-").map(Number);

    const linha: { mes: string; realizada: number; pendente: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      // Aritmética de mês na base 0 evita `new Date` e o deslocamento de
      // fuso que ele traria (orientacoes.md §4.2).
      const total = anoFim * 12 + (mesFim - 1) - i;
      const iso = `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}-01`;
      const v = porMes.get(iso);
      linha.push({ mes: rotuloMes(iso), realizada: v?.realizada ?? 0, pendente: v?.pendente ?? 0 });
    }
    return linha;
  }, [data, filtro]);

  return (
    <ChartCard
      titulo="Receita mensal"
      descricao="Realizada (paga) × pendente (aberta ou inadimplente), por competência"
      carregando={isPending}
      erro={error}
      vazio={serie.length === 0}
      mensagemVazio={
        filtro === "todos"
          ? "Nenhuma fatura emitida ainda."
          : "Nenhuma fatura deste tipo no período."
      }
      acoes={
        <select
          value={filtro}
          onChange={(e) => setFiltro(e.target.value)}
          aria-label="Filtrar receita por tipo de fatura"
          className="rounded-md border border-input bg-background px-2 py-1 text-xs text-texto-1"
        >
          {TIPOS_RECEITA.map((t) => (
            <option key={t.valor} value={t.valor}>
              {t.label}
            </option>
          ))}
        </select>
      }
    >
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={serie} margin={{ top: 8, right: 8, bottom: 0, left: 4 }}>
          <CartesianGrid stroke={COR_GRADE} strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="mes" {...EIXO} />
          <YAxis {...EIXO} width={72} tickFormatter={(v: number) => formatarMoeda(v)} />
          <Tooltip {...ESTILO_TOOLTIP} formatter={(v) => formatarMoeda(Number(v))} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {/* `linear`, não `monotone`: a spline suavizada arqueia entre dois
              meses e desenha uma subida gradual onde houve um salto seco de
              R$ 0 para o valor da competência. Reta entre pontos reais não
              inventa o caminho. */}
          <Area
            type="linear"
            stackId="receita"
            dataKey="realizada"
            name="Realizada"
            stroke={COR_ESTADO.sucesso}
            fill={COR_ESTADO.sucesso}
            fillOpacity={0.25}
          />
          <Area
            type="linear"
            stackId="receita"
            dataKey="pendente"
            name="Pendente"
            stroke={COR_ESTADO.alerta}
            fill={COR_ESTADO.alerta}
            fillOpacity={0.25}
          />
        </AreaChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

// ---------------------------------------------------------------------------
// G4 — Funil de níveis (barras horizontais) + taxas de conversão
// ---------------------------------------------------------------------------

export function FunilNiveis({ kpis, carregando }: { kpis?: Kpis; carregando?: boolean }) {
  const bronze = kpis?.bronze ?? 0;
  const prata = kpis?.prata ?? 0;
  const ouro = kpis?.ouro ?? 0;

  const serie = [
    { nivel: "Bronze", qtd: bronze, cor: COR_NIVEL.bronze },
    { nivel: "Prata", qtd: prata, cor: COR_NIVEL.prata },
    { nivel: "Ouro", qtd: ouro, cor: COR_NIVEL.ouro },
  ];

  // Taxas calculadas no cliente (dashboard.md §2/G4). Denominador zero não
  // vira 0% — vira "—", porque não há taxa a informar.
  const taxa = (num: number, den: number) => (den === 0 ? null : (num / den) * 100);
  const bronzeParaPrata = taxa(prata, bronze);
  const prataParaOuro = taxa(ouro, prata);
  const fmt = (t: number | null) => (t === null ? "—" : `${t.toFixed(0)}%`);

  return (
    <ChartCard
      titulo="Funil de níveis"
      descricao={
        <>
          Prata/Bronze: <strong>{fmt(bronzeParaPrata)}</strong> · Ouro/Prata:{" "}
          <strong>{fmt(prataParaOuro)}</strong>
        </>
      }
      carregando={carregando}
      vazio={bronze + prata + ouro === 0}
      mensagemVazio="Nenhum trabalhador aprovado na base."
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={serie} layout="vertical" margin={{ top: 8, right: 24, bottom: 0, left: 8 }}>
          <CartesianGrid stroke={COR_GRADE} strokeDasharray="3 3" horizontal={false} />
          <XAxis type="number" allowDecimals={false} {...EIXO} />
          <YAxis type="category" dataKey="nivel" width={60} {...EIXO} />
          <Tooltip {...ESTILO_TOOLTIP} formatter={(v) => [`${v} trabalhador(es)`, "Total"]} />
          <Bar dataKey="qtd" name="Trabalhadores" radius={[0, 4, 4, 0]}>
            {serie.map((s) => (
              <Cell key={s.nivel} fill={s.cor} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

// ---------------------------------------------------------------------------
// G5 — Parceiros (90 dias): barras + tabela com a economia gerada
// ---------------------------------------------------------------------------

export function PainelParceiros({ habilitado = true }: { habilitado?: boolean }) {
  const { data, isPending, error } = useTopParceiros(habilitado);
  const linhas = data ?? [];

  const economiaTotal = linhas.reduce((s, l) => s + Number(l.economia_gerada_90d ?? 0), 0);
  const serie = linhas.map((l) => ({
    nome: l.nome ?? "—",
    executadas: l.executadas_90d ?? 0,
    pendentes: l.pendentes_confirmacao ?? 0,
    rejeitadas: l.rejeitadas_90d ?? 0,
  }));

  return (
    <ChartCard
      titulo="Parceiros (90 dias)"
      descricao={
        economiaTotal > 0 ? (
          <>
            O convênio devolveu <strong>{formatarMoeda(economiaTotal)}</strong> aos filiados no período
          </>
        ) : (
          "Utilização do convênio por parceiro"
        )
      }
      carregando={isPending}
      erro={error}
      vazio={linhas.length === 0}
      mensagemVazio="Nenhum parceiro ativo cadastrado."
      altura={340}
    >
      <div className="flex h-full flex-col gap-3">
        <div className="min-h-0 flex-1">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={serie} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
              <CartesianGrid stroke={COR_GRADE} strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="nome" {...EIXO} interval={0} tickFormatter={(n: string) => n.slice(0, 14)} />
              <YAxis allowDecimals={false} {...EIXO} />
              <Tooltip {...ESTILO_TOOLTIP} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="executadas" name="Executadas" fill={COR_ESTADO.sucesso} />
              <Bar dataKey="pendentes" name="Pendentes" fill={COR_ESTADO.alerta} />
              <Bar dataKey="rejeitadas" name="Rejeitadas" fill={COR_ESTADO.erro} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="max-h-32 overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-fundo-1 text-texto-2">
              <tr>
                <th className="px-2 py-1 text-left font-semibold">Parceiro</th>
                <th className="px-2 py-1 text-right font-semibold">Exec.</th>
                <th className="px-2 py-1 text-right font-semibold">Economia gerada</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((l) => (
                <tr key={l.id ?? l.nome} className="border-t border-border">
                  <td className="px-2 py-1 text-texto-1">{l.nome}</td>
                  <td className="px-2 py-1 text-right tabular-nums">{l.executadas_90d ?? 0}</td>
                  <td className="px-2 py-1 text-right tabular-nums">
                    {formatarMoeda(l.economia_gerada_90d ?? 0)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </ChartCard>
  );
}
