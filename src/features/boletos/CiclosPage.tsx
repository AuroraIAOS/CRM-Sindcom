import { useState } from "react";
import { Download, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { baixarCsv } from "@/lib/csv";
import { formatarCnpj, formatarDataBR } from "@/lib/formatters";
import { mensagemErro } from "@/lib/mensagens";
import { useConvencoes } from "@/features/convencoes/api";
import {
  useBoletosSemEmail,
  useCiclos,
  useCriarCiclo,
  useEncerrarCiclo,
  useExcluirCiclo,
  useExportarEmails,
  useFunilCiclos,
  useMarcarEnviadas,
  useRecalcularValores,
  useSemearCiclo,
  type Ciclo,
  type ExportacaoEmails,
  type ModoEnvio,
  type RelatorioSemeadura,
} from "./api";
import { gerarCsvEmails } from "./csvEmails";
import { ROTULO_CONTATO, SeletorCiclo, useEhAdminBoletos, usePodeOperarBoletos } from "./comum";
import { rotuloTipo, ROTULO_TIPO, TIPOS_BOLETO, type TipoBoleto } from "./rotulos";

const TODAS = "todas";

/** `/boletos/ciclos` — criar, semear, encerrar, recalcular e exportar a lista de e-mails. */
export function CiclosPage() {
  const podeOperar = usePodeOperarBoletos();
  const ehAdmin = useEhAdminBoletos();
  const ciclos = useCiclos();
  const funil = useFunilCiclos();
  const [criando, setCriando] = useState(false);
  const [paraEncerrar, setParaEncerrar] = useState<Ciclo | null>(null);
  const [paraExcluir, setParaExcluir] = useState<Ciclo | null>(null);
  const [exportando, setExportando] = useState<Ciclo | null>(null);
  const [cicloSemEmail, setCicloSemEmail] = useState<string | undefined>();
  const semear = useSemearCiclo();
  const recalcular = useRecalcularValores();
  const encerrar = useEncerrarCiclo();
  const excluir = useExcluirCiclo();

  const lista = ciclos.data ?? [];
  const idSemEmail = cicloSemEmail ?? lista.find((c) => !c.encerrado_em)?.id ?? lista[0]?.id;

  async function aoSemear(c: Ciclo) {
    try {
      const r = await semear.mutateAsync(c.id);
      toast.success(textoSemeadura(r));
    } catch (e) {
      toast.error(mensagemErro(e));
    }
  }

  async function aoRecalcular(c: Ciclo) {
    try {
      const n = await recalcular.mutateAsync(c.id);
      toast.success(n === 1 ? "1 boleto recalculado." : `${n} boletos recalculados.`);
    } catch (e) {
      toast.error(mensagemErro(e));
    }
  }

  async function aoEncerrar() {
    if (!paraEncerrar) return;
    try {
      await encerrar.mutateAsync(paraEncerrar.id);
      toast.success("Ciclo encerrado. Os links das caixas continuam válidos.");
      setParaEncerrar(null);
    } catch (e) {
      toast.error(mensagemErro(e));
    }
  }

  async function aoExcluir() {
    if (!paraExcluir) return;
    try {
      const r = await excluir.mutateAsync(paraExcluir.id);
      toast.success(`Ciclo excluído (${r.boletos} boletos e ${r.respostas} respostas apagados).`);
      setParaExcluir(null);
    } catch (e) {
      toast.error(mensagemErro(e));
    }
  }

  if (ciclos.isLoading) return <p className="text-texto-2">Carregando…</p>;
  if (ciclos.isError) return <p className="text-estado-erro">{mensagemErro(ciclos.error)}</p>;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-semibold text-texto-1">Ciclos de boletos</h1>
        {podeOperar && (
          <Button onClick={() => setCriando(true)}>
            <Plus className="mr-1 h-4 w-4" /> Novo ciclo
          </Button>
        )}
      </div>

      {lista.length === 0 ? (
        <p className="text-texto-2">Nenhum ciclo criado.</p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ciclo</TableHead>
                <TableHead>Vencimento</TableHead>
                <TableHead>Boletos</TableHead>
                <TableHead>Caixas</TableHead>
                {podeOperar && <TableHead>Ações</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {lista.map((c) => {
                const f = funil.data?.find((x) => x.ciclo_id === c.id);
                return (
                  <TableRow key={c.id}>
                    <TableCell>
                      <div className="font-medium">
                        {rotuloTipo(c.tipo)} · {c.nome}
                      </div>
                      <div className="text-xs text-texto-2">
                        {c.referencia ?? ""}
                        {c.encerrado_em ? ` · encerrado em ${formatarDataBR(c.encerrado_em)}` : ""}
                      </div>
                    </TableCell>
                    <TableCell>{formatarDataBR(c.data_vencimento)}</TableCell>
                    <TableCell>{f?.total ?? 0}</TableCell>
                    <TableCell>
                      {f?.caixas_completas ?? 0}/{f?.caixas_total ?? 0} completas
                    </TableCell>
                    {podeOperar && (
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {!c.encerrado_em && (
                            <>
                            <Button size="sm" variant="outline" onClick={() => aoSemear(c)} disabled={semear.isPending}>
                              Semear
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => setExportando(c)}>
                              <Download className="mr-1 h-3.5 w-3.5" /> E-mails
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => aoRecalcular(c)}
                              disabled={recalcular.isPending}
                            >
                              Recalcular valores
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => setParaEncerrar(c)}>
                              Encerrar
                            </Button>
                            </>
                          )}
                          {ehAdmin && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-estado-erro"
                              onClick={() => setParaExcluir(c)}
                            >
                              <Trash2 className="mr-1 h-3.5 w-3.5" /> Excluir
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <section className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-xl font-semibold text-texto-1">Sem e-mail — contato manual</h2>
          <SeletorCiclo cicloId={idSemEmail} lista={lista} onEscolher={setCicloSemEmail} />
        </div>
        <SemEmail cicloId={idSemEmail} />
      </section>

      {criando && <NovoCicloDialog onFechar={() => setCriando(false)} />}
      {exportando && <ExportarEmailsDialog ciclo={exportando} onFechar={() => setExportando(null)} />}
      <ConfirmDialog
        open={!!paraEncerrar}
        onOpenChange={(o) => !o && setParaEncerrar(null)}
        titulo="Encerrar ciclo"
        descricao={`Encerrar “${paraEncerrar?.nome ?? ""}”? Os boletos já criados continuam, mas o ciclo deixa de aceitar respostas pelo link.`}
        textoConfirmar="Encerrar"
        carregando={encerrar.isPending}
        onConfirmar={aoEncerrar}
      />
      <ConfirmDialog
        open={!!paraExcluir}
        onOpenChange={(o) => !o && setParaExcluir(null)}
        titulo="Excluir ciclo"
        descricao={`Excluir “${paraExcluir?.nome ?? ""}” para sempre? Todos os boletos do ciclo e as respostas recebidas serão apagados, mesmo os já pagos. As caixas de e-mail e seus links continuam. Esta ação não pode ser desfeita.`}
        textoConfirmar="Excluir ciclo"
        destrutivo
        carregando={excluir.isPending}
        onConfirmar={aoExcluir}
      />
    </div>
  );
}

function textoSemeadura(r: RelatorioSemeadura): string {
  const partes = [`${r.criados} criados`, `${r.ja_existiam} já existiam`];
  if (r.sem_email) partes.push(`${r.sem_email} sem e-mail`);
  if (r.email_invalido) partes.push(`${r.email_invalido} com e-mail inválido`);
  return `Semeadura concluída: ${partes.join(" · ")}.`;
}

function SemEmail({ cicloId }: { cicloId: string | undefined }) {
  const consulta = useBoletosSemEmail(cicloId);
  if (!cicloId) return null;
  if (consulta.isLoading) return <p className="text-texto-2">Carregando…</p>;
  if (consulta.isError) return <p className="text-estado-erro">{mensagemErro(consulta.error)}</p>;
  const { linhas, total } = consulta.data ?? { linhas: [], total: 0 };
  if (linhas.length === 0) return <p className="text-sm text-texto-2">Todos os CNPJs deste ciclo têm e-mail utilizável.</p>;
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-texto-2">
        {total} {total === 1 ? "CNPJ precisa" : "CNPJs precisam"} de contato por telefone ou WhatsApp.
        {total > linhas.length ? ` Mostrando os ${linhas.length} primeiros.` : ""}
      </p>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Empresa</TableHead>
              <TableHead>CNPJ</TableHead>
              <TableHead>Convenção</TableHead>
              <TableHead>Situação</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {linhas.map((l) => (
              <TableRow key={l.boleto_id}>
                <TableCell>{l.razao_social}</TableCell>
                <TableCell>{formatarCnpj(l.cnpj_completo)}</TableCell>
                <TableCell>{l.convencao_nome}</TableCell>
                <TableCell>
                  {ROTULO_CONTATO[l.situacao_contato ?? ""] ?? l.situacao_contato}
                  {l.caixa_email ? ` (${l.caixa_email})` : ""}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function NovoCicloDialog({ onFechar }: { onFechar: () => void }) {
  const criar = useCriarCiclo();
  const convencoes = useConvencoes();
  const [nome, setNome] = useState("");
  const [tipo, setTipo] = useState<TipoBoleto>("taf");
  const [referencia, setReferencia] = useState("");
  const [prazo, setPrazo] = useState("");
  const [vencimento, setVencimento] = useState("");
  const [cnaes, setCnaes] = useState("");
  const [escolhidas, setEscolhidas] = useState<Set<string>>(new Set());
  const [erro, setErro] = useState<string | null>(null);

  function alternar(id: string) {
    setEscolhidas((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  async function salvar() {
    setErro(null);
    const listaCnaes = cnaes
      .split(/[\s,;]+/)
      .map((x) => x.replace(/\D/g, ""))
      .filter(Boolean);
    if (!nome.trim()) return setErro("Dê um nome ao ciclo.");
    if (!vencimento) return setErro("Informe a data de vencimento dos boletos.");
    if (escolhidas.size === 0) return setErro("Escolha ao menos uma convenção.");
    if (listaCnaes.some((c) => c.length !== 7)) return setErro("Cada CNAE tem 7 dígitos (ex.: 4711301).");
    try {
      const r = await criar.mutateAsync({
        nome,
        tipo,
        referencia,
        prazo_resposta: prazo,
        data_vencimento: vencimento,
        cnaes: listaCnaes,
        convencaoIds: [...escolhidas],
      });
      toast.success(`Ciclo criado. ${textoSemeadura(r.relatorio)}`);
      onFechar();
    } catch (e) {
      setErro(mensagemErro(e));
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onFechar()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Novo ciclo de boletos</DialogTitle>
          <DialogDescription>
            Ao criar, o sistema já gera um boleto “aguardando dados” para cada CNPJ das convenções escolhidas.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3 text-sm">
          <Campo rotulo="Nome">
            <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: TAF 2027" />
          </Campo>
          <Campo rotulo="Tipo">
            <Select value={tipo} onValueChange={(v) => setTipo(v as TipoBoleto)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIPOS_BOLETO.map((t) => (
                  <SelectItem key={t} value={t}>
                    {ROTULO_TIPO[t].sigla} — {ROTULO_TIPO[t].calculado ? "valor calculado" : "valor digitado"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Campo>
          <Campo rotulo="Referência (opcional)">
            <Input value={referencia} onChange={(e) => setReferencia(e.target.value)} placeholder="Ex.: 2027 ou 03/2027" />
          </Campo>
          <div className="grid grid-cols-2 gap-3">
            <Campo rotulo="Prazo para a empresa responder">
              <Input type="date" value={prazo} onChange={(e) => setPrazo(e.target.value)} />
            </Campo>
            <Campo rotulo="Vencimento dos boletos">
              <Input type="date" value={vencimento} onChange={(e) => setVencimento(e.target.value)} />
            </Campo>
          </div>
          <Campo rotulo="CNAEs (opcional) — 7 dígitos, separados por vírgula">
            <Input value={cnaes} onChange={(e) => setCnaes(e.target.value)} placeholder="4711301, 4712100" />
          </Campo>
          <fieldset className="flex flex-col gap-1">
            <legend className="mb-1 font-medium text-texto-1">Convenções</legend>
            <div className="max-h-48 overflow-y-auto rounded-md border p-2">
              {(convencoes.data ?? []).map((c) => (
                <label key={c.id} className="flex cursor-pointer items-center gap-2 py-1">
                  <Checkbox checked={escolhidas.has(c.id)} onCheckedChange={() => alternar(c.id)} />
                  <span>
                    {c.nome} <span className="text-texto-2">({c.ano_base})</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          {erro && <p className="text-estado-erro">{erro}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onFechar} disabled={criar.isPending}>
            Cancelar
          </Button>
          <Button onClick={salvar} disabled={criar.isPending}>
            {criar.isPending ? "Criando…" : "Criar ciclo"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Campo({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="font-medium text-texto-1">{rotulo}</span>
      {children}
    </label>
  );
}

function ExportarEmailsDialog({ ciclo, onFechar }: { ciclo: Ciclo; onFechar: () => void }) {
  const convencoes = useConvencoes();
  const exportar = useExportarEmails();
  const marcar = useMarcarEnviadas();
  const [modo, setModo] = useState<ModoEnvio>("aviso");
  const [convencaoId, setConvencaoId] = useState(TODAS);
  const [gerado, setGerado] = useState<ExportacaoEmails | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  async function gerar() {
    setErro(null);
    try {
      const r = await exportar.mutateAsync({
        cicloId: ciclo.id,
        modo,
        convencaoId: convencaoId === TODAS ? undefined : convencaoId,
      });
      if (r.linhas.length === 0) {
        setErro(modo === "aviso" ? "Nenhuma caixa ainda sem aviso neste ciclo." : "Nenhuma caixa com CNPJ pendente.");
        return;
      }
      baixarCsv(`emails-${modo}-${ciclo.nome.replace(/[^\w-]+/g, "_")}`, gerarCsvEmails(r.linhas));
      setGerado(r);
    } catch (e) {
      setErro(mensagemErro(e));
    }
  }

  async function marcarEnviadas() {
    if (!gerado) return;
    try {
      await marcar.mutateAsync({ cicloId: ciclo.id, caixaIds: gerado.caixaIds, modo });
      toast.success(`${gerado.caixaIds.length} caixas marcadas como ${modo === "aviso" ? "avisadas" : "cobradas"}.`);
      onFechar();
    } catch (e) {
      setErro(mensagemErro(e));
    }
  }

  if (gerado) {
    return (
      <Dialog open onOpenChange={(o) => !o && onFechar()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Marcar estas {gerado.caixaIds.length} caixas como {modo === "aviso" ? "avisadas" : "cobradas"}?
            </DialogTitle>
            <DialogDescription>
              O arquivo foi baixado. Importe-o na Brevo e dispare o e-mail; depois marque aqui, para que a próxima
              lista não repita estas caixas. Se o envio ainda não aconteceu, escolha “Agora não”.
            </DialogDescription>
          </DialogHeader>
          {erro && <p className="text-sm text-estado-erro">{erro}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={onFechar} disabled={marcar.isPending}>
              Agora não
            </Button>
            <Button onClick={marcarEnviadas} disabled={marcar.isPending}>
              {marcar.isPending ? "Marcando…" : "Marcar como enviadas"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onFechar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Lista de e-mails — {ciclo.nome}</DialogTitle>
          <DialogDescription>
            Gera o CSV (nome, e-mail, link, convenções, nº de CNPJs) para importar na Brevo.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3 text-sm">
          <Campo rotulo="Qual envio">
            <Select value={modo} onValueChange={(v) => setModo(v as ModoEnvio)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="aviso">Aviso — caixas ainda não avisadas</SelectItem>
                <SelectItem value="cobranca">Cobrança — caixas com CNPJ pendente</SelectItem>
              </SelectContent>
            </Select>
          </Campo>
          <Campo rotulo="Convenção">
            <Select value={convencaoId} onValueChange={setConvencaoId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={TODAS}>Todas do ciclo</SelectItem>
                {(convencoes.data ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Campo>
          {erro && <p className="text-estado-erro">{erro}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onFechar} disabled={exportar.isPending}>
            Cancelar
          </Button>
          <Button onClick={gerar} disabled={exportar.isPending}>
            {exportar.isPending ? "Gerando…" : "Gerar e baixar CSV"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
