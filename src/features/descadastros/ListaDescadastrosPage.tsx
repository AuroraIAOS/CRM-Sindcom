import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AlertTriangle, Download, Loader2, Search, X } from "lucide-react";
import { formatarDataBR } from "@/lib/formatters";
import { exportarCsv, type ColunaCsv } from "@/lib/csv";
import { cn } from "@/lib/utils";
import {
  MOTIVO_INFO,
  MOTIVOS,
  ROTULO_VIA,
  useDescadastros,
  useTotalEnviados,
  type LinhaDescadastro,
} from "./api";

/**
 * `/descadastros` — quem pediu para sair da campanha, por quê, e o que fazer a
 * respeito (ETAPA 09 · Subetapa 9.2).
 *
 * A TELA EXISTE PARA UMA DECISÃO, NÃO PARA UM NÚMERO. Descadastro isolado é
 * ruído; o que muda conduta é a DISTRIBUIÇÃO dos motivos — cada opção do
 * formulário foi desenhada para levar a uma ação diferente (higiene de base,
 * defeito no caminho do dado, cadência errada, copy ruim, canal errado,
 * jurídico). Por isso cada motivo aparece com a sua consequência escrita ao
 * lado, e não só com a contagem.
 *
 * DUAS COISAS QUE A TELA MOSTRA E QUE NÃO ESTÃO NA TABELA CRUA:
 *
 * 1. **O denominador.** Três descadastros em 9.186 envios é ruído; três em doze
 *    é a campanha inteira falhando. A taxa vem de `envios_campanha` com
 *    `enviado_em` preenchido — o que de fato saiu, não o que foi semeado.
 *
 * 2. **A fila de repetição na Brevo.** `brevo_removido_em` nulo com
 *    `brevo_erro` preenchido significa que a pessoa pediu para sair, o CRM
 *    registrou, e o ESP **não** removeu. Ela continua na lista e vai receber o
 *    próximo disparo. É o único estado desta tela que exige ação hoje, então
 *    ele tem destaque próprio em vez de virar mais uma coluna.
 *
 * A via `um_clique` entra sem motivo de propósito (RFC 8058: Google e
 * Microsoft exigem saída sem formulário, e são 79,9% da lista). Linha sem
 * motivo não é dado faltando — é o preço, deliberado, de não bloquear a saída.
 */
export function ListaDescadastrosPage() {
  const descadastros = useDescadastros();
  const totalEnviados = useTotalEnviados();
  const [busca, setBusca] = useState("");
  const [motivoFiltro, setMotivoFiltro] = useState<string>("todos");

  const linhas = descadastros.data ?? [];

  const resumo = useMemo(() => {
    const porMotivo = new Map<string, number>();
    for (const m of MOTIVOS) porMotivo.set(m, 0);
    let semMotivo = 0;
    let umClique = 0;
    let pendentesBrevo = 0;
    const trintaDias = Date.now() - 30 * 24 * 60 * 60 * 1000;
    let ultimos30 = 0;

    for (const l of linhas) {
      if (l.motivo) porMotivo.set(l.motivo, (porMotivo.get(l.motivo) ?? 0) + 1);
      else semMotivo += 1;
      if (l.via === "um_clique") umClique += 1;
      if (!l.brevoRemovidoEm) pendentesBrevo += 1;
      if (new Date(l.quando).getTime() >= trintaDias) ultimos30 += 1;
    }
    return { porMotivo, semMotivo, umClique, pendentesBrevo, ultimos30 };
  }, [linhas]);

  const filtradas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return linhas.filter((l) => {
      if (motivoFiltro !== "todos") {
        if (motivoFiltro === "sem_motivo" ? l.motivo !== null : l.motivo !== motivoFiltro) {
          return false;
        }
      }
      if (!termo) return true;
      return (
        l.quem.toLowerCase().includes(termo) ||
        l.email.toLowerCase().includes(termo) ||
        (l.motivoLivre ?? "").toLowerCase().includes(termo)
      );
    });
  }, [linhas, busca, motivoFiltro]);

  const taxa =
    totalEnviados.data && totalEnviados.data > 0
      ? (linhas.length / totalEnviados.data) * 100
      : null;

  const pendentes = linhas.filter((l) => !l.brevoRemovidoEm);

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold text-texto-1">Descadastros</h1>
        <p className="text-sm text-texto-2">
          Quem pediu para sair da campanha, por qual via e por quê. Quem se descadastrou não recebe
          outra mensagem — o contato, se houver, é por telefone.
        </p>
      </header>

      {descadastros.isLoading && (
        <div className="flex items-center gap-2 text-texto-2">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
        </div>
      )}

      {descadastros.isError && (
        <Card className="border-estado-erro/30 bg-estado-erro/5 p-4 text-sm text-estado-erro">
          {(descadastros.error as Error).message}
        </Card>
      )}

      {!descadastros.isLoading && !descadastros.isError && (
        <>
          <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Indicador titulo="Total de descadastros" valor={linhas.length} />
            <Indicador
              titulo="Taxa sobre enviados"
              valor={taxa === null ? "—" : `${taxa.toFixed(2)}%`}
              rodape={
                totalEnviados.data
                  ? `${linhas.length} de ${totalEnviados.data.toLocaleString("pt-BR")} enviados`
                  : "sem envios registrados"
              }
            />
            <Indicador titulo="Últimos 30 dias" valor={resumo.ultimos30} />
            <Indicador
              titulo="Pendentes na Brevo"
              valor={resumo.pendentesBrevo}
              alerta={resumo.pendentesBrevo > 0}
              rodape={
                resumo.pendentesBrevo > 0
                  ? "continuam na lista do ESP"
                  : "todos removidos no ESP"
              }
            />
          </section>

          {pendentes.length > 0 && (
            <Card className="flex flex-col gap-2 border-estado-alerta/40 bg-estado-alerta/10 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-estado-alerta">
                <AlertTriangle className="h-4 w-4" />
                {pendentes.length === 1
                  ? "Uma pessoa pediu para sair e continua na lista da Brevo"
                  : `${pendentes.length} pessoas pediram para sair e continuam na lista da Brevo`}
              </div>
              <p className="text-sm text-texto-1">
                O CRM registrou o pedido, mas a remoção no ESP falhou — elas receberão o próximo
                disparo se isso não for resolvido antes. O registro do motivo não se perde; o que
                falta é a remoção lá.
              </p>
              <ul className="flex flex-col gap-1 text-xs text-texto-2">
                {pendentes.slice(0, 5).map((p) => (
                  <li key={p.id}>
                    <span className="font-mono">{p.email}</span>
                    {p.brevoErro && <> — {p.brevoErro}</>}
                  </li>
                ))}
                {pendentes.length > 5 && <li>e mais {pendentes.length - 5}…</li>}
              </ul>
            </Card>
          )}

          <Card className="flex flex-col gap-3 p-4">
            <h2 className="text-sm font-semibold text-texto-1">
              Por que saíram — e o que cada motivo pede
            </h2>
            <div className="flex flex-col gap-2">
              {MOTIVOS.map((m) => {
                const n = resumo.porMotivo.get(m) ?? 0;
                const pct = linhas.length ? (n / linhas.length) * 100 : 0;
                return (
                  <div key={m} className="flex items-center gap-3 text-sm">
                    <span className="w-52 shrink-0 text-texto-1">{MOTIVO_INFO[m].rotulo}</span>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-black/5">
                      <div
                        className="h-full rounded-full bg-realce"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="w-10 shrink-0 text-right font-semibold text-texto-1">{n}</span>
                    <span className="hidden w-[26rem] shrink-0 text-xs text-texto-2 xl:block">
                      {MOTIVO_INFO[m].acao}
                    </span>
                  </div>
                );
              })}
              {resumo.semMotivo > 0 && (
                <div className="flex items-center gap-3 border-t pt-2 text-sm">
                  <span className="w-52 shrink-0 text-texto-2">Sem motivo (um clique)</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-black/5">
                    <div
                      className="h-full rounded-full bg-texto-2/40"
                      style={{
                        width: `${linhas.length ? (resumo.semMotivo / linhas.length) * 100 : 0}%`,
                      }}
                    />
                  </div>
                  <span className="w-10 shrink-0 text-right font-semibold text-texto-1">
                    {resumo.semMotivo}
                  </span>
                  <span className="hidden w-[26rem] shrink-0 text-xs text-texto-2 xl:block">
                    Google e Microsoft exigem saída em um clique, sem formulário — cobertura parcial
                    deliberada
                  </span>
                </div>
              )}
            </div>
          </Card>

          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-texto-2">Buscar</span>
              <div className="relative">
                <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-texto-2" />
                <Input
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder="Nome, e-mail ou observação"
                  className="w-72 pl-8"
                />
              </div>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-texto-2">Motivo</span>
              <select
                className="h-10 rounded-md border bg-white px-2 text-sm"
                value={motivoFiltro}
                onChange={(e) => setMotivoFiltro(e.target.value)}
              >
                <option value="todos">Todos</option>
                {MOTIVOS.map((m) => (
                  <option key={m} value={m}>
                    {MOTIVO_INFO[m].rotulo}
                  </option>
                ))}
                <option value="sem_motivo">Sem motivo (um clique)</option>
              </select>
            </label>
            {(busca || motivoFiltro !== "todos") && (
              <Button
                variant="ghost"
                onClick={() => {
                  setBusca("");
                  setMotivoFiltro("todos");
                }}
                className="gap-1"
              >
                <X className="h-4 w-4" /> Limpar
              </Button>
            )}
            <Button
              variant="outline"
              className="ml-auto gap-2"
              disabled={filtradas.length === 0}
              onClick={() => exportarCsv("descadastros", filtradas, COLUNAS_CSV)}
            >
              <Download className="h-4 w-4" /> Exportar CSV
            </Button>
          </div>

          <Card className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Quando</TableHead>
                  <TableHead>Quem</TableHead>
                  <TableHead>E-mail</TableHead>
                  <TableHead>Campanha</TableHead>
                  <TableHead>Via</TableHead>
                  <TableHead>Motivo</TableHead>
                  <TableHead>Brevo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtradas.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="py-8 text-center text-texto-2">
                      {linhas.length === 0
                        ? "Nenhum descadastro registrado."
                        : "Nenhum descadastro com esse filtro."}
                    </TableCell>
                  </TableRow>
                )}
                {filtradas.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="whitespace-nowrap">{formatarDataBR(l.quando)}</TableCell>
                    <TableCell>
                      <div className="text-texto-1">{l.quem}</div>
                      <div className="text-xs text-texto-2">{l.tipo}</div>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{l.email}</TableCell>
                    <TableCell className="text-sm text-texto-2">{l.campanha}</TableCell>
                    <TableCell className="whitespace-nowrap text-sm">
                      {ROTULO_VIA[l.via] ?? l.via}
                    </TableCell>
                    <TableCell>
                      {l.motivo ? (
                        <span className="text-sm text-texto-1">{MOTIVO_INFO[l.motivo].rotulo}</span>
                      ) : (
                        <span className="text-sm text-texto-2">—</span>
                      )}
                      {l.motivoLivre && (
                        <div className="mt-0.5 text-xs italic text-texto-2">“{l.motivoLivre}”</div>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      <span
                        className={cn(
                          "rounded px-2 py-0.5 text-xs",
                          l.brevoRemovidoEm
                            ? "bg-estado-sucesso/15 text-estado-sucesso"
                            : "bg-estado-alerta/15 text-estado-alerta",
                        )}
                        title={l.brevoErro ?? undefined}
                      >
                        {l.brevoRemovidoEm ? "Removido" : "Pendente"}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </>
      )}
    </div>
  );
}

const COLUNAS_CSV: ColunaCsv<LinhaDescadastro>[] = [
  { titulo: "Quando", valor: (l) => formatarDataBR(l.quando) },
  { titulo: "Quem", valor: (l) => l.quem },
  { titulo: "Tipo", valor: (l) => l.tipo },
  { titulo: "E-mail", valor: (l) => l.email },
  { titulo: "Campanha", valor: (l) => l.campanha },
  { titulo: "Via", valor: (l) => ROTULO_VIA[l.via] ?? l.via },
  { titulo: "Motivo", valor: (l) => (l.motivo ? MOTIVO_INFO[l.motivo].rotulo : "") },
  { titulo: "Observação", valor: (l) => l.motivoLivre ?? "" },
  {
    titulo: "Removido na Brevo",
    valor: (l) => (l.brevoRemovidoEm ? formatarDataBR(l.brevoRemovidoEm) : "PENDENTE"),
  },
  { titulo: "Erro na Brevo", valor: (l) => l.brevoErro ?? "" },
];

function Indicador({
  titulo,
  valor,
  rodape,
  alerta = false,
}: {
  titulo: string;
  valor: number | string;
  rodape?: string;
  alerta?: boolean;
}) {
  return (
    <Card className={cn("flex flex-col gap-1 p-4", alerta && "border-estado-alerta/40")}>
      <span className="text-xs uppercase tracking-wide text-texto-2">{titulo}</span>
      <span
        className={cn(
          "text-2xl font-semibold text-texto-1",
          alerta && "text-estado-alerta",
        )}
      >
        {typeof valor === "number" ? valor.toLocaleString("pt-BR") : valor}
      </span>
      {rodape && <span className="text-xs text-texto-2">{rodape}</span>}
    </Card>
  );
}
