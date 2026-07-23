import { useState } from "react";
import {
  Dialog,
  DialogContent,
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { EntityForm } from "@/components/shared/EntityForm";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { NivelBadge } from "@/components/shared/NivelBadge";
import { Trash2 } from "lucide-react";
import { formatarCpf, formatarDataBR } from "@/lib/formatters";
import { mensagemErro } from "@/lib/mensagens";
import {
  ROTULO_STATUS,
  ROTULO_TIPO,
  rotuloResponsavel,
  useAtualizarAtendimento,
  useExcluirAtendimento,
  type AtendimentoListItem,
  type StatusAtendimento,
  type TipoAtendimento,
} from "./api";
import { edicaoAtendimentoSchema, type EdicaoAtendimentoFormValues } from "./schemas";

/**
 * Detalhe/edição de um atendimento. O trabalhador não é editável de propósito
 * (ver comentário em `schemas.ts`): trocar o titular reescreveria o histórico
 * jurídico de duas pessoas ao mesmo tempo.
 */
export function DetalheAtendimentoDialog({
  atendimento,
  podeEditar,
  podeExcluir,
  onOpenChange,
}: {
  atendimento: AtendimentoListItem;
  podeEditar: boolean;
  podeExcluir: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const atualizar = useAtualizarAtendimento(atendimento.id);
  const excluir = useExcluirAtendimento();
  const [erro, setErro] = useState<string | null>(null);
  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false);

  const valoresIniciais: EdicaoAtendimentoFormValues = {
    data: atendimento.data,
    tipo: atendimento.tipo,
    resumo: atendimento.resumo ?? "",
    status: (atendimento.status as StatusAtendimento) ?? "aberto",
  };

  async function salvar(valores: EdicaoAtendimentoFormValues) {
    setErro(null);
    try {
      await atualizar.mutateAsync(valores);
      onOpenChange(false);
    } catch (e) {
      setErro(mensagemErro(e));
    }
  }

  async function confirmarExclusao() {
    setErro(null);
    try {
      await excluir.mutateAsync(atendimento.id);
      setConfirmandoExclusao(false);
      onOpenChange(false);
    } catch (e) {
      setErro(mensagemErro(e));
    }
  }

  return (
    <>
      <Dialog open={!confirmandoExclusao} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {podeEditar ? "Editar atendimento" : "Atendimento jurídico"}
            </DialogTitle>
          </DialogHeader>

          <div className="flex flex-wrap items-center gap-2 rounded-md border bg-fundo-2 px-3 py-2 text-sm">
            <span className="font-medium text-texto-1">
              {atendimento.trabalhador?.nome ?? "—"}
            </span>
            {atendimento.trabalhador && (
              <>
                <span className="text-texto-2">{formatarCpf(atendimento.trabalhador.cpf)}</span>
                {atendimento.trabalhador.nivel && (
                  <NivelBadge nivel={atendimento.trabalhador.nivel} />
                )}
              </>
            )}
          </div>

          {!podeEditar ? (
            <dl className="flex flex-col gap-3 text-sm">
              <div>
                <dt className="text-texto-2">Data</dt>
                <dd className="text-texto-1">{formatarDataBR(atendimento.data)}</dd>
              </div>
              <div>
                <dt className="text-texto-2">Tipo</dt>
                <dd className="text-texto-1">{ROTULO_TIPO[atendimento.tipo]}</dd>
              </div>
              <div>
                <dt className="text-texto-2">Situação</dt>
                <dd className="text-texto-1">
                  {ROTULO_STATUS[atendimento.status as StatusAtendimento] ?? atendimento.status}
                </dd>
              </div>
              <div>
                <dt className="text-texto-2">Resumo</dt>
                <dd className="whitespace-pre-wrap text-texto-1">
                  {atendimento.resumo || "— sem resumo registrado —"}
                </dd>
              </div>
              <div>
                <dt className="text-texto-2">Responsável</dt>
                <dd className="text-texto-1">
                  {rotuloResponsavel(atendimento)}
                </dd>
              </div>
            </dl>
          ) : (
            <EntityForm
              id="form-editar-atendimento"
              schema={edicaoAtendimentoSchema}
              valoresIniciais={valoresIniciais}
              onSubmit={salvar}
            >
              {(form) => (
                <div className="flex flex-col gap-4">
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="data"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Data do atendimento</FormLabel>
                          <FormControl>
                            <Input type="date" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="tipo"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Tipo</FormLabel>
                          <Select value={field.value} onValueChange={field.onChange}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {(Object.keys(ROTULO_TIPO) as TipoAtendimento[]).map((t) => (
                                <SelectItem key={t} value={t}>
                                  {ROTULO_TIPO[t]}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={form.control}
                    name="status"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Situação</FormLabel>
                        <Select value={field.value} onValueChange={field.onChange}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {(
                              Object.keys(ROTULO_STATUS) as Array<keyof typeof ROTULO_STATUS>
                            ).map((s) => (
                              <SelectItem key={s} value={s}>
                                {ROTULO_STATUS[s]}
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
                    name="resumo"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Resumo do atendimento</FormLabel>
                        <FormControl>
                          <Textarea rows={4} {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {erro && <p className="text-sm text-estado-erro">{erro}</p>}
                </div>
              )}
            </EntityForm>
          )}

          <DialogFooter className="sm:justify-between">
            {podeExcluir ? (
              <Button
                variant="ghost"
                onClick={() => setConfirmandoExclusao(true)}
                className="text-estado-erro hover:text-estado-erro"
              >
                <Trash2 className="mr-1 h-4 w-4" /> Excluir
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                {podeEditar ? "Cancelar" : "Fechar"}
              </Button>
              {podeEditar && (
                <Button
                  type="submit"
                  form="form-editar-atendimento"
                  disabled={atualizar.isPending}
                >
                  {atualizar.isPending ? "Salvando…" : "Salvar"}
                </Button>
              )}
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmandoExclusao}
        onOpenChange={setConfirmandoExclusao}
        titulo="Excluir atendimento jurídico"
        descricao={
          <>
            Remover definitivamente o atendimento de{" "}
            <strong>{formatarDataBR(atendimento.data)}</strong> de{" "}
            {atendimento.trabalhador?.nome ?? "—"}? O histórico jurídico dessa pessoa perde este
            registro e a ação não pode ser desfeita.
            {erro && <p className="mt-2 text-estado-erro">{erro}</p>}
          </>
        }
        destrutivo
        textoConfirmar="Excluir"
        carregando={excluir.isPending}
        onConfirmar={confirmarExclusao}
      />
    </>
  );
}
