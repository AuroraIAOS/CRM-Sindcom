import { useMemo, useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { Download, ShieldCheck } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { mascararCpf } from "@/lib/formatters";
import { mensagemErro } from "@/lib/mensagens";
import {
  useEstabelecimentosDaConvencao,
  useRelatorioConvencao,
  useReclassificarConvencao,
  type TrabalhadorRelatorio,
} from "../api";
import { ExportarRelatorioDialog } from "../ExportarRelatorioDialog";

const NIVEIS = ["bronze", "prata", "ouro"] as const;
type Nivel = (typeof NIVEIS)[number];

const ROTULO_NIVEL: Record<Nivel, string> = {
  bronze: "Bronze",
  prata: "Prata",
  ouro: "Ouro",
};

const ROTULO_PAGAMENTO: Record<string, string> = {
  holerite: "Holerite",
  boleto_direto: "Boleto direto",
};

const POR_PAGINA = 50;

/** Data de hoje como "AAAA-MM-DD" no fuso local. `new Date("2026-07-16")`
 *  parseia como UTC e volta um dia em UTC-3, então a comparação é entre
 *  strings — nunca entre objetos Date. */
function hojeLocalISO(): string {
  return new Date().toLocaleDateString("sv-SE");
}

/** Timestamptz → "DD/MM/AAAA às HH:MM" (instante real, sem armadilha de fuso). */
function formatarDataHora(valor: string): string {
  const d = new Date(valor);
  return `${d.toLocaleDateString("pt-BR")} às ${d.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

/**
 * Relatório final da CCT (item 6 do fluxo de convenções) + botão de organização
 * interna (`fn_reclassificar_convencao`, regras 5.1–5.3).
 *
 * O CPF aparece SEMPRE mascarado na tela: o dado cru só sai pelo export logado
 * em `importacoes_csv` (specs/importacao.md §8) — mostrá-lo aqui faria do modal
 * de exportação um teatro.
 */
export function RelatorioTab({
  convencaoId,
  nomeConvencao,
  anoBase,
  dataLimiteOposicao,
  reclassificadaEm,
}: {
  convencaoId: string;
  nomeConvencao: string;
  anoBase: number;
  dataLimiteOposicao: string | null;
  reclassificadaEm: string | null;
}) {
  const { role } = useAuth();
  const ehAdmin = role === "admin";

  const relatorio = useRelatorioConvencao(convencaoId);
  const estabelecimentos = useEstabelecimentosDaConvencao(convencaoId);
  const reclassificar = useReclassificarConvencao();

  const [confirmando, setConfirmando] = useState(false);
  const [exportando, setExportando] = useState(false);
  const [pagina, setPagina] = useState(0);
  const [erro, setErro] = useState<string | null>(null);

  /** A view dá uma linha por VÍNCULO. Sem deduplicar, quem tem dois vínculos
   *  ativos na mesma CCT é contado duas vezes e o total diverge dos deltas da
   *  RPC (que usa `select distinct t.id`). */
  const trabalhadores = useMemo<TrabalhadorRelatorio[]>(() => {
    const porTrabalhador = new Map<string, TrabalhadorRelatorio>();
    for (const linha of relatorio.data ?? []) {
      if (!linha.trabalhador_id) continue;
      const existente = porTrabalhador.get(linha.trabalhador_id);
      if (existente) {
        if (linha.estabelecimento) existente.estabelecimentos.push(linha.estabelecimento);
      } else {
        porTrabalhador.set(linha.trabalhador_id, {
          ...linha,
          estabelecimentos: linha.estabelecimento ? [linha.estabelecimento] : [],
        });
      }
    }
    return Array.from(porTrabalhador.values());
  }, [relatorio.data]);

  const resumo = useMemo(() => {
    const porNivel: Record<Nivel, number> = { bronze: 0, prata: 0, ouro: 0 };
    const cruzamento: Record<Nivel, Record<string, number>> = {
      bronze: { holerite: 0, boleto_direto: 0 },
      prata: { holerite: 0, boleto_direto: 0 },
      ouro: { holerite: 0, boleto_direto: 0 },
    };
    for (const t of trabalhadores) {
      if (!t.nivel) continue;
      porNivel[t.nivel] += 1;
      if (t.forma_pagamento_preferida) cruzamento[t.nivel][t.forma_pagamento_preferida] += 1;
    }
    return { porNivel, cruzamento };
  }, [trabalhadores]);

  const hoje = hojeLocalISO();
  const prazoEncerrado = dataLimiteOposicao !== null && dataLimiteOposicao < hoje;
  const motivoBloqueio = !dataLimiteOposicao
    ? "Defina a data limite da carta de oposição na convenção antes de organizar."
    : !prazoEncerrado
      ? "O prazo de entrega das cartas de oposição ainda não encerrou. Organizar agora classificaria como Prata quem ainda tem direito de entregar a carta."
      : null;

  async function confirmarReclassificacao() {
    setErro(null);
    try {
      await reclassificar.mutateAsync(convencaoId);
      setConfirmando(false);
    } catch (e) {
      setErro(mensagemErro(e));
      setConfirmando(false);
    }
  }

  if (relatorio.isLoading || estabelecimentos.isLoading) {
    return <p className="text-texto-2">Carregando…</p>;
  }
  if (relatorio.isError) return <p className="text-estado-erro">{mensagemErro(relatorio.error)}</p>;

  const semEstabelecimentos = (estabelecimentos.data ?? []).length === 0;
  const totalPaginas = Math.max(1, Math.ceil(trabalhadores.length / POR_PAGINA));
  const paginaAtual = Math.min(pagina, totalPaginas - 1);
  const visiveis = trabalhadores.slice(paginaAtual * POR_PAGINA, (paginaAtual + 1) * POR_PAGINA);

  return (
    <div className="flex flex-col gap-4">
      {/* Organização interna */}
      <Card className="flex flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-semibold text-texto-1">Organização interna</p>
            <p className="text-sm text-texto-2">
              {reclassificadaEm
                ? `Última organização: ${formatarDataHora(reclassificadaEm)}.`
                : "Nunca organizada."}{" "}
              Quem entregou carta de oposição no ano-base {anoBase} passa a Bronze; os demais, a
              Prata. Trabalhadores Ouro não são alterados.
            </p>
          </div>
          {ehAdmin && (
            <Button
              disabled={!prazoEncerrado || reclassificar.isPending}
              onClick={() => setConfirmando(true)}
            >
              <ShieldCheck className="mr-1 h-4 w-4" /> Executar organização interna
            </Button>
          )}
        </div>

        {ehAdmin && motivoBloqueio && <p className="text-sm text-texto-2">{motivoBloqueio}</p>}
        {!ehAdmin && (
          <p className="text-sm text-texto-2">
            A execução é restrita ao Admin. Este relatório é somente leitura para o seu papel.
          </p>
        )}

        {reclassificar.data && (
          <p className="rounded-md bg-estado-sucesso/10 p-3 text-sm text-estado-sucesso">
            {reclassificar.data.para_bronze === 0 && reclassificar.data.para_prata === 0
              ? "Nenhuma alteração — a CCT já estava organizada."
              : `${reclassificar.data.para_bronze} regredido(s) a Bronze (carta entregue) · ${reclassificar.data.para_prata} classificado(s) como Prata.`}
          </p>
        )}
        {erro && <p className="text-sm text-estado-erro">{erro}</p>}
      </Card>

      {/* Empty states — a view exige status_cadastro = 'aprovado', então uma CCT
          com 200 pendentes mostra relatório vazio; dizer o porquê evita confusão. */}
      {trabalhadores.length === 0 ? (
        <p className="text-sm text-texto-2">
          {semEstabelecimentos
            ? "Nenhum estabelecimento vinculado a esta CCT — vincule estabelecimentos para que os trabalhadores apareçam aqui."
            : "Os estabelecimentos desta CCT não têm trabalhadores com cadastro aprovado e vínculo ativo. Cadastros pendentes não entram no relatório."}
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Contagem titulo="Total" valor={trabalhadores.length} />
            {NIVEIS.map((n) => (
              <Contagem key={n} titulo={ROTULO_NIVEL[n]} valor={resumo.porNivel[n]} />
            ))}
          </div>

          <div>
            <p className="mb-1 text-sm font-semibold text-texto-1">Nível × forma de pagamento</p>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nível</TableHead>
                  <TableHead>Holerite</TableHead>
                  <TableHead>Boleto direto</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {NIVEIS.map((n) => (
                  <TableRow key={n}>
                    <TableCell>{ROTULO_NIVEL[n]}</TableCell>
                    <TableCell>{resumo.cruzamento[n].holerite}</TableCell>
                    <TableCell>{resumo.cruzamento[n].boleto_direto}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-texto-1">
              Trabalhadores regidos pela CCT ({trabalhadores.length})
            </p>
            <Button variant="outline" size="sm" onClick={() => setExportando(true)}>
              <Download className="mr-1 h-4 w-4" /> Exportar CSV
            </Button>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>CPF</TableHead>
                <TableHead>Nome</TableHead>
                <TableHead>Nível</TableHead>
                <TableHead>Pagamento</TableHead>
                <TableHead>Estabelecimento</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visiveis.map((t) => (
                <TableRow key={t.trabalhador_id}>
                  <TableCell>{mascararCpf(t.cpf)}</TableCell>
                  <TableCell>{t.trabalhador ?? "—"}</TableCell>
                  <TableCell>{t.nivel ? ROTULO_NIVEL[t.nivel] : "—"}</TableCell>
                  <TableCell>
                    {t.forma_pagamento_preferida
                      ? ROTULO_PAGAMENTO[t.forma_pagamento_preferida]
                      : "—"}
                  </TableCell>
                  <TableCell>{t.estabelecimentos.join(", ") || "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {totalPaginas > 1 && (
            <div className="flex items-center justify-end gap-2 text-sm text-texto-2">
              <span>
                Página {paginaAtual + 1} de {totalPaginas}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={paginaAtual === 0}
                onClick={() => setPagina(paginaAtual - 1)}
              >
                Anterior
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={paginaAtual >= totalPaginas - 1}
                onClick={() => setPagina(paginaAtual + 1)}
              >
                Próxima
              </Button>
            </div>
          )}
        </>
      )}

      <ConfirmDialog
        open={confirmando}
        onOpenChange={setConfirmando}
        titulo="Executar organização interna"
        descricao={
          trabalhadores.length === 0
            ? `A CCT "${nomeConvencao}" não tem nenhum trabalhador vinculado. A execução não mudará ninguém, mas marcará a convenção como organizada e removerá a pendência do painel. Executar mesmo assim?`
            : `Reclassifica os ${trabalhadores.length} trabalhador(es) regidos por "${nomeConvencao}" conforme as cartas de oposição do ano-base ${anoBase}: com carta → Bronze, sem carta → Prata. Trabalhadores Ouro não são alterados. Isso muda a cobrança dessas pessoas imediatamente.`
        }
        destrutivo
        carregando={reclassificar.isPending}
        textoConfirmar="Executar organização"
        onConfirmar={confirmarReclassificacao}
      />

      {exportando && (
        <ExportarRelatorioDialog
          linhas={trabalhadores}
          nomeConvencao={nomeConvencao}
          anoBase={anoBase}
          onOpenChange={setExportando}
        />
      )}
    </div>
  );
}

function Contagem({ titulo, valor }: { titulo: string; valor: number }) {
  return (
    <Card className="p-3">
      <p className="text-sm text-texto-2">{titulo}</p>
      <p className="text-2xl font-semibold text-texto-1">{valor}</p>
    </Card>
  );
}
