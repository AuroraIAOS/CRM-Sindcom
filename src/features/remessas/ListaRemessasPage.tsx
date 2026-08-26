import { useMemo, useState } from "react";
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
import { AlertTriangle, Info, Loader2, ShieldCheck } from "lucide-react";
import { formatarDataBR } from "@/lib/formatters";
import { mensagemErro } from "@/lib/mensagens";
import { cn } from "@/lib/utils";
import { PreviewTable } from "@/features/importacao/PreviewTable";
import { contarPorStatus, dedupPorChave, temAvisoZeroComido } from "@/features/importacao/parsers";
import {
  validarTrabalhadores,
  type TrabalhadorPreviewDados,
} from "@/features/importacao/validarTrabalhadores";
import {
  useContextoTrabalhadores,
  useImportarTrabalhadores,
  useRegistrarImportacao,
} from "@/features/importacao/api";
import {
  ROTULO_STATUS,
  useArquivoDaRemessa,
  useMarcarRemessa,
  useRemessas,
  type Remessa,
} from "./api";

/**
 * `/remessas` — o único ponto em que dado vindo de fora vira cadastro, e ele é
 * HUMANO (Subetapa 08.10).
 *
 * TRÊS GARANTIAS QUE ESTA TELA CARREGA
 *
 * 1. **Nenhuma remessa vira cadastro sem clique.** Não existe caminho
 *    automático: a Edge Function só GRAVA o arquivo, e a gravação em
 *    `trabalhadores` acontece aqui, por `useImportarTrabalhadores` — a MESMA
 *    função da tela de importação de CSV, sem cópia.
 *
 * 2. **Reenviar o mesmo arquivo não duplica ninguém.** A política de duplicata
 *    de `trabalhadores` é "ignorar existentes" por padrão
 *    (`specs/importacao.md` §5), e é ela que torna o token reutilizável seguro
 *    por construção — o contador pode mandar a mesma planilha cinco vezes,
 *    progressivamente mais completa.
 *
 * 3. **As três flags de nível nunca mudam em registro existente.** Não é
 *    disciplina de quem escreve a tela: o TYPE do payload de atualização
 *    (`TrabalhadorPayloadContato`) simplesmente não tem esses campos. Uma
 *    planilha com a flag errada não consegue reclassificar 500 pessoas em
 *    silêncio nem por acidente.
 *
 * A remessa é IMUTÁVEL (trigger no banco): correção não altera a antiga, cria
 * uma nova. É o que preserva o histórico de quem enviou o quê e quando.
 */
export function ListaRemessasPage() {
  const remessas = useRemessas();
  const [aberta, setAberta] = useState<Remessa | null>(null);

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold text-texto-1">Remessas recebidas</h1>
        <p className="text-sm text-texto-2">
          Planilhas enviadas pelos contadores pelo link da campanha. Nada é cadastrado
          automaticamente — cada remessa é revisada e importada aqui.
        </p>
      </header>

      <Card className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Recebida em</TableHead>
              <TableHead>Quem enviou</TableHead>
              <TableHead>Campanha</TableHead>
              <TableHead className="text-right">Linhas</TableHead>
              <TableHead>Situação</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {remessas.isLoading && (
              <TableRow>
                <TableCell colSpan={6} className="h-20 text-center text-texto-2">
                  Carregando…
                </TableCell>
              </TableRow>
            )}
            {remessas.isError && (
              <TableRow>
                <TableCell colSpan={6} className="h-20 text-center text-estado-erro">
                  {mensagemErro(remessas.error)}
                </TableCell>
              </TableRow>
            )}
            {remessas.data?.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="h-20 text-center text-texto-2">
                  Nenhuma remessa recebida ainda.
                </TableCell>
              </TableRow>
            )}
            {remessas.data?.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="whitespace-nowrap">{formatarDataBR(r.recebida_em)}</TableCell>
                <TableCell>{r.remetente}</TableCell>
                <TableCell className="text-texto-2">{r.campanha}</TableCell>
                <TableCell className="text-right">
                  {r.linhas_recebidas ?? "—"}
                  {r.linhas_com_erro ? (
                    <span className="text-estado-alerta"> ({r.linhas_com_erro} com erro)</span>
                  ) : null}
                </TableCell>
                <TableCell>
                  <span
                    className={cn(
                      "rounded px-2 py-0.5 text-xs",
                      r.status === "importada" && "bg-estado-sucesso/15 text-estado-sucesso",
                      r.status === "rejeitada" && "bg-estado-erro/15 text-estado-erro",
                      (r.status === "recebida" || r.status === "validada") &&
                        "bg-estado-alerta/15 text-estado-alerta",
                    )}
                  >
                    {ROTULO_STATUS[r.status]}
                  </span>
                </TableCell>
                <TableCell className="text-right">
                  <Button variant="outline" size="sm" onClick={() => setAberta(r)}>
                    {r.status === "importada" || r.status === "rejeitada" ? "Ver" : "Revisar"}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      {aberta && <RevisaoDaRemessa remessa={aberta} aoFechar={() => setAberta(null)} />}
    </div>
  );
}

function RevisaoDaRemessa({ remessa, aoFechar }: { remessa: Remessa; aoFechar: () => void }) {
  const arquivo = useArquivoDaRemessa(remessa.arquivo_path);
  const contexto = useContextoTrabalhadores();
  const importar = useImportarTrabalhadores();
  const registrarLog = useRegistrarImportacao();
  const marcar = useMarcarRemessa();

  const [erro, setErro] = useState<string | null>(null);
  const [resultado, setResultado] = useState<{ inseridos: number; atualizados: number } | null>(null);

  // Aqui, ao contrário da página pública, o contexto é COMPLETO: quem revisa é
  // a Secretaria autenticada, e é ela quem tem direito de saber que um CPF já
  // está na base. A política é "ignorar existentes" — a que torna o reenvio da
  // mesma planilha inofensivo.
  const preview = useMemo(() => {
    if (!arquivo.data || !contexto.data) return null;
    return validarTrabalhadores(arquivo.data, contexto.data, "ignorar");
  }, [arquivo.data, contexto.data]);

  const contagem = preview ? contarPorStatus(preview) : null;
  const jaProcessada = remessa.status === "importada" || remessa.status === "rejeitada";

  const paraGravar = useMemo(() => {
    if (!preview) return [];
    const validas = preview
      .map((l) => l.dados)
      .filter(
        (d): d is Exclude<TrabalhadorPreviewDados, { tipo: "ignorada" }> =>
          d !== null && d.tipo !== "ignorada",
      );
    return dedupPorChave(validas, (d) => d.valores.cpf);
  }, [preview]);

  async function importarRemessa() {
    if (!preview) return;
    setErro(null);
    try {
      const { inseridos, atualizados } = await importar.mutateAsync(paraGravar);
      const c = contarPorStatus(preview);
      await registrarLog.mutateAsync({
        entidade: "trabalhadores",
        arquivo_nome: remessa.arquivo_path,
        total_linhas: c.total,
        inseridos,
        atualizados,
        erros: preview
          .filter((l) => l.status === "rejeitada")
          .map((l) => ({ linha: l.linha, mensagem: l.mensagens.join("; ") })),
      });
      // Só DEPOIS da gravação. Se a ordem se invertesse e a gravação falhasse,
      // ficaria uma remessa dizendo "importada" sem ninguém cadastrado.
      await marcar.mutateAsync({ id: remessa.id, status: "importada" });
      setResultado({ inseridos, atualizados });
    } catch (e) {
      setErro(mensagemErro(e));
    }
  }

  async function rejeitarRemessa() {
    setErro(null);
    try {
      await marcar.mutateAsync({ id: remessa.id, status: "rejeitada" });
      aoFechar();
    } catch (e) {
      setErro(mensagemErro(e));
    }
  }

  return (
    <Card className="flex flex-col gap-4 p-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold text-texto-1">Revisão da remessa</h2>
          <p className="text-sm text-texto-2">
            {remessa.remetente} · recebida em {formatarDataBR(remessa.recebida_em)}
            {remessa.ip_origem && <> · IP {remessa.ip_origem}</>}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={aoFechar}>
          Fechar
        </Button>
      </header>

      {(arquivo.isLoading || contexto.isLoading) && (
        <p className="flex items-center gap-2 text-texto-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          Abrindo a planilha por link temporário…
        </p>
      )}

      {arquivo.isError && (
        <p className="rounded-md bg-estado-erro/10 p-3 text-sm text-estado-erro">
          Não foi possível abrir o arquivo desta remessa: {mensagemErro(arquivo.error)}
        </p>
      )}

      {preview && contagem && (
        <>
          <p className="flex items-start gap-2 rounded-md bg-estado-alerta/10 p-3 text-sm text-estado-alerta">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Regra inviolável: para CPFs já cadastrados, a importação <strong>nunca</strong> altera
              contribuição, mensalidade ou forma de pagamento. Mudança de nível é ato deliberado, não
              efeito de planilha.
            </span>
          </p>

          <p className="flex items-start gap-2 rounded-md bg-fundo-2/60 p-3 text-sm text-texto-2">
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Quem vier marcado como <strong>oposição</strong> entra como Bronze{" "}
              <strong>sem carta registrada</strong> — a declaração é do contador, não há documento
              anexado. Esses casos aparecem em <em>Cartas de oposição</em> como um grupo próprio.
            </span>
          </p>

          {temAvisoZeroComido(preview) && (
            <p className="rounded-md bg-estado-alerta/10 p-3 text-sm text-estado-alerta">
              Vários CPFs perderam o zero à esquerda no Excel do contador — já restauramos; confira
              as linhas marcadas antes de importar.
            </p>
          )}

          <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
            <span>Linhas: <strong>{contagem.total}</strong></span>
            <span className="text-estado-sucesso">A inserir: <strong>{contagem.inserir}</strong></span>
            <span>Já cadastrados (ignorados): <strong>{contagem.atualizar}</strong></span>
            {contagem.rejeitadas > 0 && (
              <span className="text-estado-erro">Rejeitadas: <strong>{contagem.rejeitadas}</strong></span>
            )}
          </div>

          <PreviewTable
            preview={preview}
            resumoLinha={(l) => {
              if (l.dados?.tipo === "novo" || l.dados?.tipo === "contato") {
                return `${l.dados.valores.cpf} — ${l.dados.valores.nome}`;
              }
              return l.bruta["nome"] || l.bruta["cpf"] || "—";
            }}
          />

          {jaProcessada ? (
            <p className="flex items-center gap-2 text-sm text-texto-2">
              <ShieldCheck className="h-4 w-4" />
              Remessa já {ROTULO_STATUS[remessa.status].toLowerCase()} em{" "}
              {remessa.processada_em ? formatarDataBR(remessa.processada_em) : "—"}. A remessa é
              imutável: uma correção entra como remessa nova.
            </p>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <Button onClick={importarRemessa} disabled={importar.isPending || paraGravar.length === 0}>
                {importar.isPending
                  ? "Importando…"
                  : `Importar ${paraGravar.length} linha(s) para o cadastro`}
              </Button>
              <Button variant="outline" onClick={rejeitarRemessa} disabled={marcar.isPending}>
                Rejeitar remessa
              </Button>
              {paraGravar.length === 0 && (
                <span className="text-sm text-texto-2">
                  Nenhuma linha aproveitável nesta remessa.
                </span>
              )}
            </div>
          )}

          {erro && <p className="text-sm text-estado-erro">{erro}</p>}
          {resultado && (
            <p className="rounded-md bg-estado-sucesso/10 p-3 text-sm text-estado-sucesso">
              Importação concluída: {resultado.inseridos} inserido(s), {resultado.atualizados}{" "}
              atualizado(s) — só dados de contato; nível nunca muda por planilha.
            </p>
          )}
        </>
      )}
    </Card>
  );
}
