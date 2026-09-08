import { Fragment, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  BellOff,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Download,
  Link2,
  Loader2,
  ShieldAlert,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { mensagemErro } from "@/lib/mensagens";
import { formatarDataBR } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import { exportarCsv, type ColunaCsv } from "@/lib/csv";
import {
  useCoberturaContabilidades,
  useLinkAtivo,
  usePendentesDaContabilidade,
  useRevogarToken,
  type EstabelecimentoPendente,
  type LinhaCobertura,
  type LinkAtivo,
} from "./api";

/**
 * `/cobertura` — quais contabilidades ainda não mandaram, e o que falta em
 * cada uma (Subetapa 08.11, D4). Substitui o cruzamento manual repetido a
 * cada rodada de cobrança.
 *
 * O LINK APARECE AQUI SÓ PARA O ADMIN, E QUEM DECIDE ISSO É O BANCO (Subetapa
 * 9.1). Até aqui a tela não mostrava o token para ninguém — e o efeito medido
 * foi que "Revogar" virou uma ação sem saída: o link antigo morria, um novo
 * nascia por DEFAULT do banco e ninguém conseguia vê-lo para reenviar. Agora a
 * leitura passa por `v_envios_campanha_mascarada`
 * (sql/25_reemissao_token_09_01.sql), que devolve `token = null` para quem não
 * é Admin. A regra mora no Postgres; a condição de papel abaixo só evita
 * oferecer um botão que não traria valor nenhum.
 */
const PODE_REVOGAR = ["admin"] as const;

const COLUNAS_CSV_PENDENTES: ColunaCsv<EstabelecimentoPendente>[] = [
  { titulo: "CNPJ", valor: (l) => l.cnpj },
  { titulo: "Razão social", valor: (l) => l.razaoSocial },
  { titulo: "Nome fantasia", valor: (l) => l.nomeFantasia ?? "" },
];

/**
 * A exportação da listagem, com o descadastro entre as colunas (Subetapa 9.00,
 * item 6). Ela existe para o follow-up sair da tela: quem vai ligar precisa da
 * lista no papel, e precisa saber, ANTES de discar, quem pediu para não ser mais
 * contatado por e-mail — porque essa pessoa é justamente a que se contata por
 * telefone, e não com mais uma mensagem.
 */
const COLUNAS_CSV_COBERTURA: ColunaCsv<LinhaCobertura>[] = [
  { titulo: "Contabilidade", valor: (l) => l.nome },
  { titulo: "E-mail", valor: (l) => l.email },
  { titulo: "Estabelecimentos", valor: (l) => String(l.totalEstabelecimentos) },
  { titulo: "Cobertos", valor: (l) => String(l.estabelecimentosCobertos) },
  { titulo: "Cobertura (%)", valor: (l) => String(percentual(l)) },
  { titulo: "Descadastrada", valor: (l) => (l.descadastradoEm ? "sim" : "não") },
  { titulo: "Descadastrada em", valor: (l) => formatarDataBR(l.descadastradoEm) },
];

function percentual(l: LinhaCobertura): number {
  return l.totalEstabelecimentos > 0
    ? Math.round((l.estabelecimentosCobertos / l.totalEstabelecimentos) * 100)
    : 0;
}

export function CoberturaContabilidadesPage() {
  const { role } = useAuth();
  const podeRevogar = role !== null && (PODE_REVOGAR as readonly string[]).includes(role);
  const cobertura = useCoberturaContabilidades();
  const [aberta, setAberta] = useState<string | null>(null);
  const [paraRevogar, setParaRevogar] = useState<LinhaCobertura | null>(null);
  const [verLinkDe, setVerLinkDe] = useState<LinhaCobertura | null>(null);
  // O link recém-emitido, mostrado LOGO DEPOIS de revogar. Sem esta tela, a
  // revogação deixaria o contador sem link nenhum na prática — o novo existiria
  // só no banco.
  const [emitido, setEmitido] = useState<{ contabilidade: LinhaCobertura; link: LinkAtivo } | null>(null);

  const linhas = cobertura.data ?? [];
  const semNenhuma = linhas.filter((l) => l.estabelecimentosCobertos === 0).length;
  // Quem pediu para sair E não mandou nada é a candidata mais forte à via
  // formal — há registro de que foi contatada, de que optou por interromper o
  // canal e de que não cumpriu (copies §10). Por isso o número aparece separado
  // do "ainda sem nenhum coberto", em vez de diluído nele.
  const descadastradas = linhas.filter((l) => l.descadastradoEm !== null).length;
  const descadastradasSemNada = linhas.filter(
    (l) => l.descadastradoEm !== null && l.estabelecimentosCobertos === 0,
  ).length;

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h1 className="text-2xl font-semibold text-texto-1">Cobertura por contabilidade</h1>
          <Button
            variant="outline"
            size="sm"
            disabled={linhas.length === 0}
            onClick={() => exportarCsv("cobertura-contabilidades", linhas, COLUNAS_CSV_COBERTURA)}
          >
            <Download className="h-4 w-4" />
            Exportar CSV
          </Button>
        </div>
        <p className="text-sm text-texto-2">
          {linhas.length > 0 && (
            <>
              <strong>{linhas.length}</strong> contabilidades · <strong>{semNenhuma}</strong> ainda sem
              nenhum estabelecimento coberto.{" "}
            </>
          )}
          Ordenado da pior para a melhor cobertura — é quem precisa de follow-up primeiro.
        </p>
        {descadastradas > 0 && (
          <p className="text-sm text-texto-2">
            <strong>{descadastradas}</strong>{" "}
            {descadastradas === 1 ? "pediu" : "pediram"} para não receber mais e-mails desta campanha
            {descadastradasSemNada > 0 && (
              <>
                {" "}— <strong>{descadastradasSemNada}</strong> sem ter enviado nenhum dado. Estas se
                contatam por telefone, nunca com outra mensagem.
              </>
            )}
          </p>
        )}
      </header>

      <Card className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Contabilidade</TableHead>
              <TableHead>E-mail</TableHead>
              <TableHead className="text-right">Cobertura</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {cobertura.isLoading && (
              <TableRow>
                <TableCell colSpan={4} className="h-20 text-center text-texto-2">
                  Carregando…
                </TableCell>
              </TableRow>
            )}
            {cobertura.isError && (
              <TableRow>
                <TableCell colSpan={4} className="h-20 text-center text-estado-erro">
                  {mensagemErro(cobertura.error)}
                </TableCell>
              </TableRow>
            )}
            {linhas.map((l) => {
              const perc = percentual(l);
              return (
                <Fragment key={l.contabilidadeId}>
                  <TableRow>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-2">
                        <span>{l.nome}</span>
                        {l.descadastradoEm && (
                          <span
                            className="inline-flex items-center gap-1 rounded bg-estado-alerta/15 px-1.5 py-0.5 text-xs text-estado-alerta"
                            title={`Pediu para não receber mais e-mails desta campanha em ${formatarDataBR(l.descadastradoEm)}`}
                          >
                            <BellOff className="h-3 w-3" />
                            descadastrada
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-texto-2">{l.email}</TableCell>
                    <TableCell className="text-right">
                      <span
                        className={cn(
                          "font-medium",
                          perc === 0 && "text-estado-erro",
                          perc > 0 && perc < 100 && "text-estado-alerta",
                          perc === 100 && "text-estado-sucesso",
                        )}
                      >
                        {l.estabelecimentosCobertos} de {l.totalEstabelecimentos} ({perc}%)
                      </span>
                    </TableCell>
                    <TableCell className="flex items-center justify-end gap-2 text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setAberta(aberta === l.contabilidadeId ? null : l.contabilidadeId)}
                      >
                        {aberta === l.contabilidadeId ? (
                          <ChevronUp className="h-4 w-4" />
                        ) : (
                          <ChevronDown className="h-4 w-4" />
                        )}
                        Ver pendentes
                      </Button>
                      {podeRevogar && (
                        <>
                          <Button variant="outline" size="sm" onClick={() => setVerLinkDe(l)}>
                            <Link2 className="h-4 w-4" />
                            Link ativo
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => setParaRevogar(l)}>
                            <ShieldAlert className="h-4 w-4" />
                            Revogar token
                          </Button>
                        </>
                      )}
                    </TableCell>
                  </TableRow>
                  {aberta === l.contabilidadeId && (
                    <TableRow>
                      <TableCell colSpan={4} className="bg-fundo-2/40">
                        <PendentesDaContabilidade contabilidade={l} />
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              );
            })}
            {!cobertura.isLoading && linhas.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="h-20 text-center text-texto-2">
                  Nenhuma contabilidade semeada ainda.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>

      <RevogarTokenDialog
        contabilidade={paraRevogar}
        onOpenChange={(open) => !open && setParaRevogar(null)}
        onEmitido={(contabilidade, link) => setEmitido({ contabilidade, link })}
      />

      <LinkAtivoDialog contabilidade={verLinkDe} onOpenChange={(open) => !open && setVerLinkDe(null)} />

      <LinkEmitidoDialog emitido={emitido} onOpenChange={(open) => !open && setEmitido(null)} />
    </div>
  );
}

/**
 * A caixa que mostra o link e o coloca na área de transferência.
 *
 * O botão de copiar não é conforto: o token tem 36 caracteres e uma leitura
 * errada produz um link que abre "Link inválido" na cara do contador — erro que
 * ninguém consegue diagnosticar do outro lado da linha.
 */
function CaixaLink({ link }: { link: string }) {
  const [copiado, setCopiado] = useState(false);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(link);
      setCopiado(true);
      window.setTimeout(() => setCopiado(false), 2000);
    } catch {
      // Navegador sem permissão de área de transferência: o link continua
      // visível e selecionável na tela, que é o essencial.
      setCopiado(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="overflow-x-auto rounded-md border bg-fundo-2/50 p-3">
        <code className="whitespace-nowrap font-mono text-xs text-texto-1">{link}</code>
      </div>
      <Button variant="outline" size="sm" className="w-fit" onClick={() => void copiar()}>
        {copiado ? <Check className="h-4 w-4 text-estado-sucesso" /> : <Copy className="h-4 w-4" />}
        {copiado ? "Link copiado" : "Copiar link"}
      </Button>
    </div>
  );
}

/** Corpo comum aos dois diálogos de link: o valor, ou o motivo de não haver. */
function ConteudoLink({
  consulta,
}: {
  consulta: { link: LinkAtivo | null; carregando: boolean; erro: unknown };
}) {
  if (consulta.carregando) {
    return (
      <p className="flex items-center gap-2 text-sm text-texto-2">
        <Loader2 className="h-4 w-4 animate-spin" /> Buscando o link…
      </p>
    );
  }
  if (consulta.erro) {
    return <p className="text-sm text-estado-erro">{mensagemErro(consulta.erro)}</p>;
  }
  if (!consulta.link) {
    return (
      <p className="text-sm text-estado-alerta">
        Esta contabilidade não tem link ativo. Revogue o token para emitir um novo.
      </p>
    );
  }
  if (!consulta.link.link) {
    // O banco devolveu a linha sem o token: quem consulta não é Admin
    // (v_envios_campanha_mascarada). Dizer isso é melhor do que mostrar vazio.
    return (
      <p className="text-sm text-texto-2">
        Existe um link ativo, mas o endereço só é exibido para o Admin.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <CaixaLink link={consulta.link.link} />
      <p className="text-xs text-texto-2">
        Válido até {formatarDataBR(consulta.link.expiraEm)}. Envie-o por e-mail ou WhatsApp para o
        contato da contabilidade — o CRM não dispara e-mail; quem envia é a campanha.
      </p>
    </div>
  );
}

/** "Link ativo": ver e copiar o link em vigor, sem revogar nada. */
function LinkAtivoDialog({
  contabilidade,
  onOpenChange,
}: {
  contabilidade: LinhaCobertura | null;
  onOpenChange: (open: boolean) => void;
}) {
  const consulta = useLinkAtivo(contabilidade?.contabilidadeId ?? null);

  return (
    <Dialog open={!!contabilidade} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Link de envio ativo</DialogTitle>
          <DialogDescription>
            O endereço que <strong>{contabilidade?.nome}</strong> usa para enviar os dados. Continua
            valendo — reenviá-lo não invalida nada.
          </DialogDescription>
        </DialogHeader>
        <ConteudoLink
          consulta={{ link: consulta.data ?? null, carregando: consulta.isLoading, erro: consulta.error }}
        />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** O link recém-emitido, logo depois da revogação — o passo que faltava. */
function LinkEmitidoDialog({
  emitido,
  onOpenChange,
}: {
  emitido: { contabilidade: LinhaCobertura; link: LinkAtivo } | null;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={!!emitido} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Link novo emitido</DialogTitle>
          <DialogDescription>
            O link anterior de <strong>{emitido?.contabilidade.nome}</strong> deixou de funcionar
            agora. Este é o substituto — <strong>envie-o ao contato antes de fechar</strong>, porque
            sem ele a contabilidade fica sem caminho para enviar os dados.
          </DialogDescription>
        </DialogHeader>
        {emitido && (
          <ConteudoLink consulta={{ link: emitido.link, carregando: false, erro: null }} />
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PendentesDaContabilidade({ contabilidade }: { contabilidade: LinhaCobertura }) {
  const pendentes = usePendentesDaContabilidade(contabilidade.contabilidadeId);
  const linhas = pendentes.data ?? [];

  return (
    <div className="flex flex-col gap-2 p-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-texto-1">
          Estabelecimentos ainda sem trabalhador vinculado ({linhas.length})
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={linhas.length === 0}
          onClick={() => exportarCsv(`pendentes-${contabilidade.nome}`, linhas, COLUNAS_CSV_PENDENTES)}
        >
          <Download className="h-4 w-4" />
          Exportar CSV
        </Button>
      </div>

      {pendentes.isLoading && (
        <p className="flex items-center gap-2 text-sm text-texto-2">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
        </p>
      )}
      {pendentes.isError && <p className="text-sm text-estado-erro">{mensagemErro(pendentes.error)}</p>}
      {!pendentes.isLoading && linhas.length === 0 && (
        <p className="text-sm text-estado-sucesso">Todos os estabelecimentos desta contabilidade já têm trabalhador vinculado.</p>
      )}

      {linhas.length > 0 && (
        <ul className="flex max-h-64 flex-col gap-1 overflow-y-auto text-sm">
          {linhas.map((e) => (
            <li key={e.cnpj} className="flex flex-wrap items-baseline gap-2 border-b py-1 last:border-0">
              <span className="font-mono text-xs text-texto-2">{e.cnpj}</span>
              <span className="text-texto-1">{e.razaoSocial}</span>
              {e.nomeFantasia && <span className="text-xs text-texto-2">({e.nomeFantasia})</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function RevogarTokenDialog({
  contabilidade,
  onOpenChange,
  onEmitido,
}: {
  contabilidade: LinhaCobertura | null;
  onOpenChange: (open: boolean) => void;
  onEmitido: (contabilidade: LinhaCobertura, link: LinkAtivo) => void;
}) {
  const revogar = useRevogarToken();
  const [erro, setErro] = useState<string | null>(null);

  async function confirmar() {
    if (!contabilidade) return;
    setErro(null);
    try {
      const novo = await revogar.mutateAsync(contabilidade.contabilidadeId);
      onOpenChange(false);
      // A revogação só termina quando o substituto está na mão de quem vai
      // enviá-lo — por isso o diálogo do link novo abre em seguida, sempre.
      onEmitido(contabilidade, novo);
    } catch (e) {
      setErro(mensagemErro(e));
    }
  }

  return (
    <ConfirmDialog
      open={!!contabilidade}
      onOpenChange={onOpenChange}
      titulo="Revogar token"
      descricao={
        <>
          O link enviado a <strong>{contabilidade?.nome}</strong> deixa de funcionar imediatamente, e um
          novo link é gerado e mostrado na tela seguinte, para você reenviar ao contato. O histórico de
          remessas já recebidas não é apagado.
          {erro && <p className="mt-2 text-estado-erro">{erro}</p>}
        </>
      }
      destrutivo
      carregando={revogar.isPending}
      textoConfirmar="Revogar e emitir novo"
      onConfirmar={confirmar}
    />
  );
}
