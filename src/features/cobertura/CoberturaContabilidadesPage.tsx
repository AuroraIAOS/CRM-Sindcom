import { Fragment, useMemo, useState } from "react";
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
import { BellOff, ChevronDown, ChevronUp, Download, Link2, Loader2, ShieldAlert } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { mensagemErro } from "@/lib/mensagens";
import { formatarDataBR } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import { exportarCsv, type ColunaCsv } from "@/lib/csv";
import { FiltrosCobertura } from "./FiltrosCobertura";
import { LinkAtivoDialog, LinkEmitidoDialog } from "./DialogosLink";
import {
  FILTRO_VAZIO,
  useCoberturaContabilidades,
  useLinkAtivo,
  usePendentesDaContabilidade,
  useRevogarToken,
  type EstabelecimentoPendente,
  type FiltroCobertura,
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
  const [emitido, setEmitido] = useState<{ nome: string; link: LinkAtivo } | null>(null);
  const [filtro, setFiltro] = useState<FiltroCobertura>(FILTRO_VAZIO);

  const todas = cobertura.data ?? [];
  const linkAtivo = useLinkAtivo(verLinkDe?.contabilidadeId ?? null);

  /**
   * Filtro NO NAVEGADOR aqui, e no servidor na tela de empresas. A diferença não
   * é gosto: são 953 contabilidades (cabem numa resposta do PostgREST) contra
   * 8.238 empresas (não cabem — §2.4). Filtrar aqui em memória mantém a resposta
   * instantânea sem esconder nenhuma linha.
   */
  const linhas = useMemo(() => {
    const termo = filtro.busca.trim().toLowerCase();
    return todas.filter((l) => {
      if (termo && !`${l.nome} ${l.email}`.toLowerCase().includes(termo)) return false;
      const coberta = l.estabelecimentosCobertos > 0;
      if (filtro.cobertura === "cobertas" && !coberta) return false;
      if (filtro.cobertura === "sem" && coberta) return false;
      if (filtro.descadastro === "descadastradas" && l.descadastradoEm === null) return false;
      if (filtro.descadastro === "ativas" && l.descadastradoEm !== null) return false;
      return true;
    });
  }, [todas, filtro]);

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

      <FiltrosCobertura
        filtro={filtro}
        onChange={setFiltro}
        placeholderBusca="Nome da contabilidade ou e-mail"
        resultado={
          cobertura.isLoading
            ? "Carregando…"
            : linhas.length === todas.length
              ? `${todas.length} ${todas.length === 1 ? "contabilidade" : "contabilidades"}`
              : `${linhas.length} de ${todas.length} contabilidades`
        }
      />

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
        onEmitido={(contabilidade, link) => setEmitido({ nome: contabilidade.nome, link })}
      />

      <LinkAtivoDialog
        nome={verLinkDe?.nome}
        aberto={!!verLinkDe}
        consulta={{ link: linkAtivo.data ?? null, carregando: linkAtivo.isLoading, erro: linkAtivo.error }}
        onOpenChange={(open) => !open && setVerLinkDe(null)}
      />

      <LinkEmitidoDialog emitido={emitido} onOpenChange={(open) => !open && setEmitido(null)} />
    </div>
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
