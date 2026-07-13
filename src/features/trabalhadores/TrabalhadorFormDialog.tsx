import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { EntityForm } from "@/components/shared/EntityForm";
import { useAuth } from "@/lib/auth";
import { mensagemErro } from "@/lib/mensagens";
import { useMunicipiosBase } from "@/features/municipios/api";
import { useCriarSolicitacaoAdmin } from "@/features/fila-admin/api";
import { montarPayloadTrabalhador, useCriarTrabalhador } from "./api";
import { trabalhadorSchema, type TrabalhadorFormValues } from "./schemas";

const VALORES_INICIAIS: TrabalhadorFormValues = {
  cpf: "",
  nome: "",
  data_nascimento: "",
  telefone_whatsapp: "",
  email: "",
  municipio_id: undefined,
  recolhe_contribuicao_sindical: true,
  recolhe_mensalidade_convenio: false,
  forma_pagamento_preferida: "holerite",
};

/**
 * Criar trabalhador. Admin faz INSERT direto (RLS permite). Secretária não
 * pode INSERT — o mesmo formulário vira uma solicitação ao Admin com o payload,
 * fechando o ciclo Denise → fila-admin → Maxwell aprova (subetapa 01.4).
 */
export function TrabalhadorFormDialog({ onOpenChange }: { onOpenChange: (open: boolean) => void }) {
  const { role } = useAuth();
  const ehAdmin = role === "admin";

  const municipios = useMunicipiosBase();
  const criar = useCriarTrabalhador();
  const criarSolicitacao = useCriarSolicitacaoAdmin();
  const [erro, setErro] = useState<string | null>(null);
  const [enviadoParaAprovacao, setEnviadoParaAprovacao] = useState(false);
  const salvando = criar.isPending || criarSolicitacao.isPending;

  async function salvar(valores: TrabalhadorFormValues) {
    setErro(null);
    try {
      if (ehAdmin) {
        await criar.mutateAsync(valores);
        onOpenChange(false);
      } else {
        await criarSolicitacao.mutateAsync({
          tabela_alvo: "trabalhadores",
          operacao: "INSERT",
          payload: montarPayloadTrabalhador(valores),
          justificativa: `Cadastro de novo trabalhador: ${valores.nome.trim()}`,
        });
        setEnviadoParaAprovacao(true);
      }
    } catch (e) {
      setErro(mensagemErro(e));
    }
  }

  if (enviadoParaAprovacao) {
    return (
      <Dialog open onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Solicitação enviada ao Admin</DialogTitle>
          </DialogHeader>
          <p className="rounded-md bg-estado-sucesso/10 p-3 text-sm text-estado-sucesso">
            O cadastro foi enviado para a fila de aprovação. Assim que o Admin aprovar, o
            trabalhador aparece na lista. Acompanhe em "Fila do Admin".
          </p>
          <DialogFooter>
            <Button onClick={() => onOpenChange(false)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Novo trabalhador</DialogTitle>
        </DialogHeader>

        {!ehAdmin && (
          <p className="rounded-md bg-estado-alerta/10 p-3 text-sm text-estado-alerta">
            Como Secretaria, este cadastro é enviado ao Admin para aprovação antes de entrar no
            sistema.
          </p>
        )}

        <EntityForm
          id="form-trabalhador"
          schema={trabalhadorSchema}
          valoresIniciais={VALORES_INICIAIS}
          onSubmit={salvar}
        >
          {(form) => (
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="cpf"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>CPF</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Somente números" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="data_nascimento"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nascimento</FormLabel>
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
                name="nome"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nome</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="telefone_whatsapp"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Telefone (WhatsApp)</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>E-mail</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="municipio_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Município</FormLabel>
                      <Select
                        value={field.value ? String(field.value) : undefined}
                        onValueChange={(v) => field.onChange(Number(v))}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione…" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {(municipios.data ?? []).map((m) => (
                            <SelectItem key={m.id} value={String(m.id)}>{m.nome}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="forma_pagamento_preferida"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Forma de pagamento</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="holerite">Holerite</SelectItem>
                          <SelectItem value="boleto_direto">Boleto direto</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="rounded-md border border-black/10 p-3">
                <p className="mb-2 text-xs text-texto-2">
                  As duas flags abaixo determinam o nível (Bronze/Prata/Ouro), calculado
                  automaticamente pelo banco.
                </p>
                <FormField
                  control={form.control}
                  name="recolhe_contribuicao_sindical"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center gap-2 space-y-0">
                      <FormControl>
                        <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                      </FormControl>
                      <FormLabel className="!mt-0">Recolhe contribuição sindical (→ Prata)</FormLabel>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="recolhe_mensalidade_convenio"
                  render={({ field }) => (
                    <FormItem className="mt-2 space-y-0">
                      <div className="flex flex-row items-center gap-2">
                        <FormControl>
                          <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                        </FormControl>
                        <FormLabel className="!mt-0">Recolhe mensalidade do convênio (→ Ouro)</FormLabel>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {erro && <p className="text-sm text-estado-erro">{erro}</p>}
            </div>
          )}
        </EntityForm>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={salvando}>
            Cancelar
          </Button>
          <Button type="submit" form="form-trabalhador" disabled={salvando}>
            {salvando ? "Enviando…" : ehAdmin ? "Cadastrar" : "Enviar para aprovação"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
