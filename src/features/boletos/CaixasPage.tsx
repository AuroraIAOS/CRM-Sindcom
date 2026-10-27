import { useState } from "react";
import { Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { formatarDataBR } from "@/lib/formatters";
import { mensagemErro } from "@/lib/mensagens";
import {
  urlDoLink,
  useLinksBoleto,
  useMarcarBrevoAtualizada,
  useReemitirToken,
  useRenovarToken,
  type LinkCaixa,
} from "./api";
import { usePodeOperarBoletos } from "./comum";

/** `/boletos/caixas` — o link permanente de cada caixa de e-mail. O Presidente não vê links. */
export function CaixasPage() {
  const podeOperar = usePodeOperarBoletos();
  const links = useLinksBoleto(podeOperar);
  const reemitir = useReemitirToken();
  const renovar = useRenovarToken();
  const brevo = useMarcarBrevoAtualizada();
  const [busca, setBusca] = useState("");
  const [trocar, setTrocar] = useState<LinkCaixa | null>(null);

  if (!podeOperar) {
    return (
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold text-texto-1">Caixas e links</h1>
        <p className="text-texto-2">Os links das caixas de e-mail são visíveis apenas para Admin e Secretaria.</p>
      </div>
    );
  }

  async function executar(acao: () => Promise<unknown>, sucesso: string) {
    try {
      await acao();
      toast.success(sucesso);
    } catch (e) {
      toast.error(mensagemErro(e));
    }
  }

  async function copiar(l: LinkCaixa) {
    if (!l.token) return;
    try {
      await navigator.clipboard.writeText(urlDoLink(l.token));
      toast.success("Link copiado.");
    } catch {
      toast.error("Não foi possível copiar. Selecione e copie manualmente.");
    }
  }

  async function confirmarTroca() {
    if (!trocar?.caixa_id) return;
    await executar(
      () => reemitir.mutateAsync(trocar.caixa_id as string),
      "Link trocado. Atualize o contato na Brevo com o novo link.",
    );
    setTrocar(null);
  }

  const termo = busca.trim().toLowerCase();
  const linhas = (links.data ?? []).filter((l) => !termo || (l.email ?? "").toLowerCase().includes(termo));

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-3xl font-semibold text-texto-1">Caixas e links</h1>
      <p className="text-sm text-texto-2">
        Cada caixa de e-mail tem um link permanente (validade de 2 anos) que serve para todos os ciclos. Trocar o link
        invalida o antigo na hora.
      </p>
      <Input
        className="w-full sm:w-80"
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
        placeholder="Buscar por e-mail"
      />

      {links.isLoading ? (
        <p className="text-texto-2">Carregando…</p>
      ) : links.isError ? (
        <p className="text-estado-erro">{mensagemErro(links.error)}</p>
      ) : linhas.length === 0 ? (
        <p className="text-texto-2">Nenhuma caixa encontrada.</p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>E-mail</TableHead>
                <TableHead>CNPJs</TableHead>
                <TableHead>Validade</TableHead>
                <TableHead>Último acesso</TableHead>
                <TableHead>Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {linhas.map((l) => (
                <TableRow key={l.caixa_id}>
                  <TableCell>
                    {l.email}
                    {l.brevo_pendente && (
                      <div className="text-xs font-semibold text-estado-alerta">
                        Link trocado — atualize o contato na Brevo
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    {l.cnpj_em_ciclo_aberto ?? 0} em ciclo aberto
                    <div className="text-xs text-texto-2">{l.cnpj_total ?? 0} no total</div>
                  </TableCell>
                  <TableCell>
                    {l.token_expira_em ? formatarDataBR(l.token_expira_em) : "—"}
                    {l.expirado ? (
                      <div className="text-xs font-semibold text-estado-erro">Expirado</div>
                    ) : l.expira_em_breve ? (
                      <div className="text-xs font-semibold text-estado-alerta">Expira em breve</div>
                    ) : null}
                  </TableCell>
                  <TableCell>{l.ultimo_acesso_em ? formatarDataBR(l.ultimo_acesso_em) : "Nunca"}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      <Button size="sm" variant="outline" onClick={() => copiar(l)}>
                        <Copy className="mr-1 h-3.5 w-3.5" /> Copiar link
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setTrocar(l)}>
                        Trocar link
                      </Button>
                      {l.brevo_pendente && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={brevo.isPending}
                          onClick={() =>
                            executar(() => brevo.mutateAsync(l.caixa_id as string), "Marcado: Brevo atualizada.")
                          }
                        >
                          Brevo atualizada
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={renovar.isPending}
                        onClick={() =>
                          executar(() => renovar.mutateAsync(l.caixa_id as string), "Validade renovada por mais 2 anos.")
                        }
                      >
                        Renovar validade
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <ConfirmDialog
        open={!!trocar}
        onOpenChange={(o) => !o && setTrocar(null)}
        titulo="Trocar o link desta caixa"
        descricao={`O link atual de ${trocar?.email ?? ""} deixa de funcionar imediatamente. Depois da troca, atualize o contato na Brevo com o novo link — senão os próximos e-mails levarão o link antigo.`}
        textoConfirmar="Trocar link"
        destrutivo
        carregando={reemitir.isPending}
        onConfirmar={confirmarTroca}
      />
    </div>
  );
}
