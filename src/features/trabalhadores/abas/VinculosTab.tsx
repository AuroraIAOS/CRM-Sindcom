import { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { EntityForm } from "@/components/shared/EntityForm";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { ConfirmarEdicaoDialog } from "@/components/shared/ConfirmarEdicaoDialog";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { formatarCnpj, formatarDataBR } from "@/lib/formatters";
import { mensagemErro } from "@/lib/mensagens";
import { useEstabelecimentosSimples } from "@/features/estabelecimentos/api";
import { usePisosConvencao } from "@/features/convencoes/api";
import {
  useAtualizarVinculo,
  useCriarVinculo,
  useExcluirVinculo,
  useVinculosTrabalhador,
  type VinculoComEstabelecimento,
} from "../api";
import { vinculoSchema, type VinculoFormValues } from "../schemas";

const PODE_ESCREVER = ["admin", "secretaria"] as const;

export function VinculosTab({ trabalhadorId }: { trabalhadorId: string }) {
  const { role } = useAuth();
  const podeEscrever = role !== null && (PODE_ESCREVER as readonly string[]).includes(role);

  const vinculos = useVinculosTrabalhador(trabalhadorId);
  const [dialogAberto, setDialogAberto] = useState(false);
  const [emEdicao, setEmEdicao] = useState<VinculoComEstabelecimento | null>(null);
  const [paraExcluir, setParaExcluir] = useState<VinculoComEstabelecimento | null>(null);

  function abrirCriacao() {
    setEmEdicao(null);
    setDialogAberto(true);
  }
  function abrirEdicao(v: VinculoComEstabelecimento) {
    setEmEdicao(v);
    setDialogAberto(true);
  }

  if (vinculos.isLoading) return <p className="text-texto-2">Carregando vínculos…</p>;
  if (vinculos.isError) {
    return <p className="text-estado-erro">{mensagemErro(vinculos.error)}</p>;
  }

  const linhas = vinculos.data ?? [];

  return (
    <div className="flex flex-col gap-3">
      {podeEscrever && (
        <div className="flex justify-end">
          <Button size="sm" onClick={abrirCriacao}>
            <Plus className="mr-1 h-4 w-4" /> Novo vínculo
          </Button>
        </div>
      )}

      {linhas.length === 0 ? (
        <p className="text-sm text-texto-2">Nenhum vínculo empregatício registrado.</p>
      ) : (
        <div className="rounded-md border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Estabelecimento</TableHead>
                <TableHead>CNPJ</TableHead>
                <TableHead>Função</TableHead>
                <TableHead>Admissão</TableHead>
                <TableHead>Desligamento</TableHead>
                <TableHead>Principal</TableHead>
                {podeEscrever && <TableHead className="w-24">Ações</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {linhas.map((v) => (
                <TableRow key={v.id}>
                  <TableCell>{v.estabelecimento?.nome_fantasia ?? "—"}</TableCell>
                  <TableCell>{formatarCnpj(v.estabelecimento?.cnpj_completo)}</TableCell>
                  <TableCell>{v.funcao ?? "—"}</TableCell>
                  <TableCell>{formatarDataBR(v.data_admissao) || "—"}</TableCell>
                  <TableCell>{formatarDataBR(v.data_desligamento) || "—"}</TableCell>
                  <TableCell>{v.principal ? "Sim" : "Não"}</TableCell>
                  {podeEscrever && (
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" onClick={() => abrirEdicao(v)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => setParaExcluir(v)}>
                          <Trash2 className="h-4 w-4 text-estado-erro" />
                        </Button>
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {dialogAberto && (
        <VinculoFormDialog
          trabalhadorId={trabalhadorId}
          vinculo={emEdicao}
          onOpenChange={setDialogAberto}
        />
      )}

      <ExcluirVinculoDialog
        trabalhadorId={trabalhadorId}
        vinculo={paraExcluir}
        onOpenChange={(open) => !open && setParaExcluir(null)}
      />
    </div>
  );
}

function VinculoFormDialog({
  trabalhadorId,
  vinculo,
  onOpenChange,
}: {
  trabalhadorId: string;
  vinculo: VinculoComEstabelecimento | null;
  onOpenChange: (open: boolean) => void;
}) {
  const estabelecimentos = useEstabelecimentosSimples();
  const criar = useCriarVinculo(trabalhadorId);
  const atualizar = useAtualizarVinculo(trabalhadorId);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, setPendente] = useState<VinculoFormValues | null>(null);
  const salvando = criar.isPending || atualizar.isPending;

  // Estado à parte (fora do react-hook-form) só para disparar a busca de pisos
  // da CCT ao trocar de estabelecimento — ver nota sobre hooks no EntityForm.
  const [estabelecimentoParaCct, setEstabelecimentoParaCct] = useState(
    vinculo?.estabelecimento_id ?? "",
  );
  const estabelecimentoSelecionado = estabelecimentos.data?.find(
    (e) => e.id === estabelecimentoParaCct,
  );
  const pisos = usePisosConvencao(estabelecimentoSelecionado?.convencao_id ?? undefined);
  const funcoesComPiso = (pisos.data ?? []).filter((p) => p.funcao);
  const pisoGeral = (pisos.data ?? []).find((p) => !p.funcao);

  const valoresIniciais: VinculoFormValues = {
    estabelecimento_id: vinculo?.estabelecimento_id ?? "",
    funcao: vinculo?.funcao ?? "",
    data_admissao: vinculo?.data_admissao ?? "",
    data_desligamento: vinculo?.data_desligamento ?? "",
    salario_informado: vinculo?.salario_informado ?? undefined,
    principal: vinculo?.principal ?? true,
  };

  async function confirmar() {
    if (!pendente) return;
    setErro(null);
    try {
      if (vinculo) {
        await atualizar.mutateAsync({ id: vinculo.id, valores: pendente });
      } else {
        await criar.mutateAsync(pendente);
      }
      setPendente(null);
      onOpenChange(false);
    } catch (e) {
      setErro(mensagemErro(e));
    }
  }

  return (
    <>
    <Dialog open={!pendente} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{vinculo ? "Editar vínculo" : "Novo vínculo"}</DialogTitle>
        </DialogHeader>

        <EntityForm
          id="form-vinculo"
          schema={vinculoSchema}
          valoresIniciais={valoresIniciais}
          onSubmit={(valores) => setPendente(valores)}
        >
          {(form) => (
            <div className="flex flex-col gap-4">
              <FormField
                control={form.control}
                name="estabelecimento_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Estabelecimento</FormLabel>
                    <Select
                      value={field.value}
                      onValueChange={(v) => {
                        field.onChange(v);
                        setEstabelecimentoParaCct(v);
                        form.setValue("funcao", "");
                      }}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione…" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {(estabelecimentos.data ?? []).map((e) => (
                          <SelectItem key={e.id} value={e.id}>
                            {e.empresa?.razao_social ?? "—"} — {e.nome_fantasia ?? e.cnpj_completo}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="funcao"
                render={({ field }) =>
                  funcoesComPiso.length > 0 || pisoGeral ? (
                    <FormItem>
                      <FormLabel>Função (funções cadastradas na CCT do estabelecimento)</FormLabel>
                      <Select
                        value={field.value || (pisoGeral ? "__geral__" : undefined)}
                        onValueChange={(v) => {
                          if (v === "__geral__") {
                            field.onChange("");
                            if (pisoGeral) form.setValue("salario_informado", Number(pisoGeral.valor));
                            return;
                          }
                          field.onChange(v);
                          const piso = funcoesComPiso.find((p) => p.funcao === v);
                          if (piso) form.setValue("salario_informado", Number(piso.valor));
                        }}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione…" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {pisoGeral && (
                            <SelectItem value="__geral__">
                              Piso geral da categoria (sem função específica)
                            </SelectItem>
                          )}
                          {funcoesComPiso.map((p) => (
                            <SelectItem key={p.id} value={p.funcao as string}>
                              {p.funcao}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-texto-2">
                        Selecionar a função preenche o salário com o piso da CCT — o campo salário
                        continua editável para casos de override.
                      </p>
                      <FormMessage />
                    </FormItem>
                  ) : (
                    <FormItem>
                      <FormLabel>Função</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Ex.: Operador de caixa" />
                      </FormControl>
                      <p className="text-xs text-texto-2">
                        Este estabelecimento não tem CCT com pisos cadastrados — função em texto
                        livre.
                      </p>
                      <FormMessage />
                    </FormItem>
                  )
                }
              />

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="data_admissao"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Admissão</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="data_desligamento"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Desligamento</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="salario_informado"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Salário (override do piso da CCT — opcional)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.01"
                        value={field.value ?? ""}
                        onChange={(e) => field.onChange(e.target.value)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="principal"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center gap-2 space-y-0">
                    <FormControl>
                      <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                    <FormLabel className="!mt-0">Vínculo principal</FormLabel>
                  </FormItem>
                )}
              />

              {erro && <p className="text-sm text-estado-erro">{erro}</p>}
            </div>
          )}
        </EntityForm>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={salvando}>
            Cancelar
          </Button>
          <Button type="submit" form="form-vinculo" disabled={salvando}>
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <ConfirmarEdicaoDialog
      open={!!pendente}
      onOpenChange={(o) => !o && setPendente(null)}
      carregando={salvando}
      erro={erro}
      onConfirmar={confirmar}
    />
    </>
  );
}

function ExcluirVinculoDialog({
  trabalhadorId,
  vinculo,
  onOpenChange,
}: {
  trabalhadorId: string;
  vinculo: VinculoComEstabelecimento | null;
  onOpenChange: (open: boolean) => void;
}) {
  const excluir = useExcluirVinculo(trabalhadorId);
  const [erro, setErro] = useState<string | null>(null);

  async function confirmar() {
    if (!vinculo) return;
    setErro(null);
    try {
      await excluir.mutateAsync(vinculo.id);
      onOpenChange(false);
    } catch (e) {
      setErro(mensagemErro(e));
    }
  }

  return (
    <ConfirmDialog
      open={!!vinculo}
      onOpenChange={onOpenChange}
      titulo="Excluir vínculo"
      descricao={
        <>
          Remover o vínculo com {vinculo?.estabelecimento?.nome_fantasia ?? "este estabelecimento"}?
          {erro && <p className="mt-2 text-estado-erro">{erro}</p>}
        </>
      }
      destrutivo
      carregando={excluir.isPending}
      textoConfirmar="Excluir"
      onConfirmar={confirmar}
    />
  );
}
