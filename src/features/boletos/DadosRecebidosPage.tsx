import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatarCnpj, formatarDataBR } from "@/lib/formatters";
import { mensagemErro } from "@/lib/mensagens";
import {
  useBoletosStatus,
  useCaixasCiclo,
  useRegistrarRespostaManual,
  type BoletoStatus,
} from "./api";
import { SeletorCiclo, TagBoleto, useCicloSelecionado, usePodeOperarBoletos } from "./comum";

/** `/boletos/dados` — quem já respondeu, caixa por caixa (X de Y CNPJs). */
export function DadosRecebidosPage() {
  const podeOperar = usePodeOperarBoletos();
  const { cicloId, lista, escolher, carregando } = useCicloSelecionado();
  const [apenasCompletas, setApenasCompletas] = useState(false);
  const [registrando, setRegistrando] = useState(false);
  const caixas = useCaixasCiclo(cicloId, apenasCompletas);

  if (carregando) return <p className="text-texto-2">Carregando…</p>;

  const linhas = caixas.data ?? [];
  const completas = linhas.filter((c) => c.completo).length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-3xl font-semibold text-texto-1">Dados recebidos</h1>
        <div className="flex flex-wrap items-center gap-2">
          <SeletorCiclo cicloId={cicloId} lista={lista} onEscolher={escolher} />
          {podeOperar && cicloId && (
            <Button variant="outline" onClick={() => setRegistrando(true)}>
              Registrar resposta manualmente
            </Button>
          )}
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm text-texto-1">
        <Checkbox checked={apenasCompletas} onCheckedChange={(v) => setApenasCompletas(!!v)} />
        Só caixas 100% completas
        {!apenasCompletas && linhas.length > 0 && (
          <span className="text-texto-2">
            ({completas} de {linhas.length} completas)
          </span>
        )}
      </label>

      {caixas.isLoading ? (
        <p className="text-texto-2">Carregando…</p>
      ) : caixas.isError ? (
        <p className="text-estado-erro">{mensagemErro(caixas.error)}</p>
      ) : linhas.length === 0 ? (
        <p className="text-texto-2">
          {apenasCompletas ? "Nenhuma caixa completa ainda." : "Nenhuma caixa neste ciclo."}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>E-mail</TableHead>
                <TableHead>Contato</TableHead>
                <TableHead>Convenções</TableHead>
                <TableHead>CNPJs</TableHead>
                <TableHead>Último acesso</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {linhas.map((c) => (
                <TableRow key={c.caixa_id}>
                  <TableCell>{c.email}</TableCell>
                  <TableCell>{c.nome_contato ?? "—"}</TableCell>
                  <TableCell>{c.convencoes ?? "—"}</TableCell>
                  <TableCell>
                    <span className={c.completo ? "font-semibold text-estado-sucesso" : ""}>
                      {c.cnpj_respondidos ?? 0}/{c.total_cnpj ?? 0}
                    </span>
                  </TableCell>
                  <TableCell>{c.ultimo_acesso_em ? formatarDataBR(c.ultimo_acesso_em) : "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {registrando && cicloId && <RespostaManualDialog cicloId={cicloId} onFechar={() => setRegistrando(false)} />}
    </div>
  );
}

function RespostaManualDialog({ cicloId, onFechar }: { cicloId: string; onFechar: () => void }) {
  const registrar = useRegistrarRespostaManual();
  const [busca, setBusca] = useState("");
  const [alvo, setAlvo] = useState<BoletoStatus | null>(null);
  const [quantidade, setQuantidade] = useState("");
  const [incorreto, setIncorreto] = useState(false);
  const [obs, setObs] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const resultados = useBoletosStatus(
    { cicloId, busca },
    { pageIndex: 0, pageSize: 8 },
  );

  async function salvar() {
    setErro(null);
    if (!alvo) return setErro("Escolha o CNPJ.");
    if (!/^\d{1,5}$/.test(quantidade)) return setErro("Informe um número inteiro de 0 a 99999.");
    if (incorreto && !obs.trim()) return setErro("Explique o que está incorreto no CNPJ.");
    try {
      await registrar.mutateAsync({
        boleto_id: alvo.boleto_id as string,
        quantidade: Number(quantidade),
        cnpj_confirmado: !incorreto,
        cnpj_incorreto_obs: obs,
      });
      toast.success("Resposta registrada.");
      onFechar();
    } catch (e) {
      setErro(mensagemErro(e));
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onFechar()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Registrar resposta manualmente</DialogTitle>
          <DialogDescription>
            Para quando a empresa respondeu por telefone ou WhatsApp. Fica registrada como resposta manual.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3 text-sm">
          {alvo ? (
            <div className="flex items-start justify-between gap-2 rounded-md border p-2">
              <div>
                <div className="font-medium">{alvo.razao_social}</div>
                <div className="text-texto-2">{formatarCnpj(alvo.cnpj_completo)}</div>
              </div>
              <Button size="sm" variant="ghost" onClick={() => setAlvo(null)}>
                Trocar
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <Input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar por razão social ou CNPJ"
              />
              <ul className="flex flex-col gap-1">
                {(resultados.data?.linhas ?? []).map((b) => (
                  <li key={b.boleto_id}>
                    <button
                      type="button"
                      className="flex w-full items-center justify-between gap-2 rounded-md border p-2 text-left hover:bg-fundo-2/40"
                      onClick={() => setAlvo(b)}
                    >
                      <span>
                        {b.razao_social}
                        <span className="block text-xs text-texto-2">{formatarCnpj(b.cnpj_completo)}</span>
                      </span>
                      <TagBoleto tag={b.tag} />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <label className="flex flex-col gap-1">
            <span className="font-medium text-texto-1">Quantidade informada</span>
            <Input
              inputMode="numeric"
              maxLength={5}
              value={quantidade}
              onChange={(e) => setQuantidade(e.target.value.replace(/\D/g, ""))}
            />
          </label>
          <label className="flex items-center gap-2">
            <Checkbox checked={incorreto} onCheckedChange={(v) => setIncorreto(!!v)} />
            Este CNPJ está incorreto
          </label>
          {incorreto && (
            <Input
              value={obs}
              onChange={(e) => setObs(e.target.value)}
              maxLength={300}
              placeholder="O que está incorreto?"
            />
          )}
          {erro && <p className="text-estado-erro">{erro}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onFechar} disabled={registrar.isPending}>
            Cancelar
          </Button>
          <Button onClick={salvar} disabled={registrar.isPending}>
            {registrar.isPending ? "Salvando…" : "Registrar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
