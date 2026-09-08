import { useEffect, useState } from "react";
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
import { BellOff, ChevronLeft, ChevronRight, Download, Link2, ShieldAlert } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { mensagemErro } from "@/lib/mensagens";
import { formatarDataBR } from "@/lib/formatters";
import { exportarCsv, type ColunaCsv } from "@/lib/csv";
import { FiltrosCobertura } from "./FiltrosCobertura";
import { LinkAtivoDialog, LinkEmitidoDialog } from "./DialogosLink";
import {
  EMPRESAS_POR_PAGINA,
  FILTRO_VAZIO,
  useCoberturaEmpresas,
  useLinkAtivoEmpresa,
  useRevogarTokenEmpresa,
  type FiltroCobertura,
  type LinhaCoberturaEmpresa,
  type LinkAtivo,
} from "./api";

/**
 * `/cobertura-empresas` — a trilha B do lado de dentro: quais das 8.238
 * empresas isoladas já mandaram os dados, e quais ainda não.
 *
 * POR QUE ELA NÃO É A TELA DE CONTABILIDADES COM OUTRO TÍTULO
 *  · A pergunta é binária. A contabilidade tem carteira ("5 de 12 empresas");
 *    a empresa isolada tem UM estabelecimento — mandou ou não mandou.
 *  · O volume muda o mecanismo: 8.238 linhas não cabem numa resposta do
 *    PostgREST, que trunca em 1000 SEM AVISAR (orientacoes.md §2.4). Aqui o
 *    filtro e a paginação acontecem no SERVIDOR. Uma lista silenciosamente
 *    incompleta seria o pior defeito possível numa tela cuja função é dizer
 *    quem falta.
 *  · A exportação segue a mesma regra e leva o que está FILTRADO na tela, não
 *    a base inteira (§4.4: exportar dado diferente do que se vê é como o
 *    relatório mente).
 */
const PODE_REVOGAR = ["admin"] as const;

const COLUNAS_CSV: ColunaCsv<LinhaCoberturaEmpresa>[] = [
  { titulo: "CNPJ", valor: (l) => l.cnpj },
  { titulo: "Razão social", valor: (l) => l.razaoSocial },
  { titulo: "Nome fantasia", valor: (l) => l.nomeFantasia ?? "" },
  { titulo: "E-mail", valor: (l) => l.email },
  { titulo: "Enviou dados", valor: (l) => (l.coberta ? "sim" : "não") },
  { titulo: "Descadastrada", valor: (l) => (l.descadastradoEm ? "sim" : "não") },
  { titulo: "Descadastrada em", valor: (l) => formatarDataBR(l.descadastradoEm) },
  { titulo: "Link revogado", valor: (l) => (l.linkRevogado ? "sim" : "não") },
];

function formatarCnpj(cnpj: string): string {
  if (cnpj.length !== 14) return cnpj;
  return `${cnpj.slice(0, 2)}.${cnpj.slice(2, 5)}.${cnpj.slice(5, 8)}/${cnpj.slice(8, 12)}-${cnpj.slice(12)}`;
}

export function CoberturaEmpresasPage() {
  const { role } = useAuth();
  const podeRevogar = role !== null && (PODE_REVOGAR as readonly string[]).includes(role);

  const [filtro, setFiltro] = useState<FiltroCobertura>(FILTRO_VAZIO);
  const [pagina, setPagina] = useState(0);
  const [verLinkDe, setVerLinkDe] = useState<LinhaCoberturaEmpresa | null>(null);
  const [paraRevogar, setParaRevogar] = useState<LinhaCoberturaEmpresa | null>(null);
  const [emitido, setEmitido] = useState<{ nome: string; link: LinkAtivo } | null>(null);

  // Mudar o filtro sem voltar à página 1 deixa o usuário numa página que o novo
  // recorte talvez nem tenha — a tela ficaria vazia com resultados existindo.
  useEffect(() => setPagina(0), [filtro]);

  const consulta = useCoberturaEmpresas(filtro, pagina);
  const linhas = consulta.data?.linhas ?? [];
  const total = consulta.data?.total ?? 0;
  const ultimaPagina = Math.max(0, Math.ceil(total / EMPRESAS_POR_PAGINA) - 1);

  const linkAtivo = useLinkAtivoEmpresa(verLinkDe?.estabelecimentoId ?? null);

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h1 className="text-2xl font-semibold text-texto-1">Cobertura por empresa</h1>
          <Button
            variant="outline"
            size="sm"
            disabled={linhas.length === 0}
            onClick={() => exportarCsv("cobertura-empresas", linhas, COLUNAS_CSV)}
          >
            <Download className="h-4 w-4" />
            Exportar página
          </Button>
        </div>
        <p className="text-sm text-texto-2">
          Empresas que receberam o link direto (trilha B), uma linha por estabelecimento. Quem ainda
          não enviou aparece primeiro.
        </p>
      </header>

      <FiltrosCobertura
        filtro={filtro}
        onChange={setFiltro}
        placeholderBusca="Razão social, nome fantasia, e-mail ou CNPJ"
        resultado={
          consulta.isLoading
            ? "Carregando…"
            : `${total.toLocaleString("pt-BR")} ${total === 1 ? "empresa" : "empresas"}` +
              (total > 0 ? ` · página ${pagina + 1} de ${ultimaPagina + 1}` : "")
        }
      />

      <Card className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Empresa</TableHead>
              <TableHead>CNPJ</TableHead>
              <TableHead>E-mail</TableHead>
              <TableHead className="text-right">Enviou dados</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {consulta.isLoading && (
              <TableRow>
                <TableCell colSpan={5} className="h-20 text-center text-texto-2">
                  Carregando…
                </TableCell>
              </TableRow>
            )}
            {consulta.isError && (
              <TableRow>
                <TableCell colSpan={5} className="h-20 text-center text-estado-erro">
                  {mensagemErro(consulta.error)}
                </TableCell>
              </TableRow>
            )}
            {linhas.map((l) => (
              <TableRow key={l.estabelecimentoId}>
                <TableCell>
                  <div className="flex flex-wrap items-center gap-2">
                    <span>{l.razaoSocial || l.nomeFantasia || "(sem razão social)"}</span>
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
                  {l.nomeFantasia && l.razaoSocial && (
                    <span className="text-xs text-texto-2">{l.nomeFantasia}</span>
                  )}
                </TableCell>
                <TableCell className="font-mono text-xs text-texto-2">{formatarCnpj(l.cnpj)}</TableCell>
                <TableCell className="text-texto-2">{l.email}</TableCell>
                <TableCell className="text-right">
                  <span
                    className={l.coberta ? "font-medium text-estado-sucesso" : "font-medium text-estado-erro"}
                  >
                    {l.coberta ? "sim" : "não"}
                  </span>
                </TableCell>
                <TableCell className="flex items-center justify-end gap-2 text-right">
                  {podeRevogar && (
                    <>
                      <Button variant="outline" size="sm" onClick={() => setVerLinkDe(l)}>
                        <Link2 className="h-4 w-4" />
                        Link ativo
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => setParaRevogar(l)}>
                        <ShieldAlert className="h-4 w-4" />
                        Revogar
                      </Button>
                    </>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {!consulta.isLoading && linhas.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="h-20 text-center text-texto-2">
                  Nenhuma empresa com este filtro.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>

      {total > EMPRESAS_POR_PAGINA && (
        <div className="flex items-center justify-between gap-3">
          <Button
            variant="outline"
            size="sm"
            disabled={pagina === 0 || consulta.isFetching}
            onClick={() => setPagina((p) => Math.max(0, p - 1))}
          >
            <ChevronLeft className="h-4 w-4" />
            Anterior
          </Button>
          <span className="text-sm text-texto-2">
            {(pagina * EMPRESAS_POR_PAGINA + 1).toLocaleString("pt-BR")}–
            {Math.min((pagina + 1) * EMPRESAS_POR_PAGINA, total).toLocaleString("pt-BR")} de{" "}
            {total.toLocaleString("pt-BR")}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={pagina >= ultimaPagina || consulta.isFetching}
            onClick={() => setPagina((p) => Math.min(ultimaPagina, p + 1))}
          >
            Próxima
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}

      <LinkAtivoDialog
        nome={verLinkDe?.razaoSocial}
        aberto={!!verLinkDe}
        consulta={{ link: linkAtivo.data ?? null, carregando: linkAtivo.isLoading, erro: linkAtivo.error }}
        onOpenChange={(open) => !open && setVerLinkDe(null)}
      />

      <RevogarEmpresaDialog
        empresa={paraRevogar}
        onOpenChange={(open) => !open && setParaRevogar(null)}
        onEmitido={(nome, link) => setEmitido({ nome, link })}
      />

      <LinkEmitidoDialog emitido={emitido} onOpenChange={(open) => !open && setEmitido(null)} />
    </div>
  );
}

function RevogarEmpresaDialog({
  empresa,
  onOpenChange,
  onEmitido,
}: {
  empresa: LinhaCoberturaEmpresa | null;
  onOpenChange: (open: boolean) => void;
  onEmitido: (nome: string, link: LinkAtivo) => void;
}) {
  const revogar = useRevogarTokenEmpresa();
  const [erro, setErro] = useState<string | null>(null);

  async function confirmar() {
    if (!empresa) return;
    setErro(null);
    try {
      const novo = await revogar.mutateAsync(empresa.estabelecimentoId);
      onOpenChange(false);
      // A revogação só termina quando o substituto está na mão de quem vai
      // enviá-lo (orientacoes.md §4.11).
      onEmitido(empresa.razaoSocial, novo);
    } catch (e) {
      setErro(mensagemErro(e));
    }
  }

  return (
    <ConfirmDialog
      open={!!empresa}
      onOpenChange={onOpenChange}
      titulo="Revogar token"
      descricao={
        <>
          O link enviado a <strong>{empresa?.razaoSocial}</strong> deixa de funcionar imediatamente, e
          um novo é gerado e mostrado na tela seguinte, para você reenviar ao contato. O histórico de
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
