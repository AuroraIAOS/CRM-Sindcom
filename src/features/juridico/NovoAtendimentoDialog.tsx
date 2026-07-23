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
import { AlertTriangle } from "lucide-react";
import { mensagemErro } from "@/lib/mensagens";
import { SeletorTrabalhador } from "./SeletorTrabalhador";
import {
  exigeNivelPrata,
  ROTULO_STATUS,
  ROTULO_TIPO,
  useCriarAtendimento,
  type TipoAtendimento,
  type TrabalhadorOpcao,
} from "./api";
import { atendimentoSchema, type AtendimentoFormValues } from "./schemas";

/**
 * Registro de atendimento jurídico. Só admin e jurídico chegam aqui (a tela
 * esconde o botão para os demais; a RLS nega de todo jeito).
 *
 * O aviso de nível é PREVENTIVO, não decisório: quem barra é o trigger
 * `fn_valida_atendimento_juridico`. Mostrar antes evita que a pessoa preencha
 * o formulário inteiro para receber a recusa no final.
 */
export function NovoAtendimentoDialog({
  trabalhadorFixo,
  onOpenChange,
}: {
  /** Quando aberto a partir da ficha, o trabalhador já vem definido. */
  trabalhadorFixo?: TrabalhadorOpcao;
  onOpenChange: (open: boolean) => void;
}) {
  const criar = useCriarAtendimento();
  const [erro, setErro] = useState<string | null>(null);
  const [trabalhador, setTrabalhador] = useState<TrabalhadorOpcao | null>(
    trabalhadorFixo ?? null,
  );
  const [tipo, setTipo] = useState<TipoAtendimento>("orientacao");

  const hoje = new Date().toLocaleDateString("sv-SE"); // AAAA-MM-DD local (orientacoes.md §4.2)

  const valoresIniciais: AtendimentoFormValues = {
    trabalhador_id: trabalhadorFixo?.id ?? "",
    data: hoje,
    tipo: "orientacao",
    resumo: "",
    status: "aberto",
  };

  const bloqueioProvavel =
    trabalhador !== null && trabalhador.nivel === "bronze" && exigeNivelPrata(tipo);

  async function salvar(valores: AtendimentoFormValues) {
    setErro(null);
    try {
      await criar.mutateAsync({ ...valores, trabalhador_id: trabalhador?.id ?? "" });
      onOpenChange(false);
    } catch (e) {
      setErro(mensagemErro(e));
    }
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Novo atendimento jurídico</DialogTitle>
        </DialogHeader>

        <EntityForm
          id="form-novo-atendimento"
          schema={atendimentoSchema}
          valoresIniciais={valoresIniciais}
          onSubmit={salvar}
        >
          {(form) => (
            <div className="flex flex-col gap-4">
              <FormField
                control={form.control}
                name="trabalhador_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Trabalhador</FormLabel>
                    {trabalhadorFixo ? (
                      <p className="rounded-md border bg-fundo-2 px-3 py-2 text-sm text-texto-1">
                        {trabalhadorFixo.nome}
                      </p>
                    ) : (
                      <SeletorTrabalhador
                        selecionado={trabalhador}
                        onSelecionar={(t) => {
                          setTrabalhador(t);
                          field.onChange(t?.id ?? "");
                        }}
                      />
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />

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
                      <Select
                        value={field.value}
                        onValueChange={(v) => {
                          field.onChange(v);
                          setTipo(v as TipoAtendimento);
                        }}
                      >
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

              {bloqueioProvavel && (
                <p className="flex items-start gap-2 rounded-md bg-estado-alerta/10 p-3 text-sm text-estado-alerta">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    Este trabalhador é <strong>Bronze</strong>. Assistência individual
                    ({ROTULO_TIPO[tipo]}) exige nível Prata — o registro será recusado pelo
                    sistema. Para Bronze, o atendimento disponível é a{" "}
                    <strong>orientação geral</strong>.
                  </span>
                </p>
              )}

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
                        {(Object.keys(ROTULO_STATUS) as Array<keyof typeof ROTULO_STATUS>).map(
                          (s) => (
                            <SelectItem key={s} value={s}>
                              {ROTULO_STATUS[s]}
                            </SelectItem>
                          ),
                        )}
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

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={criar.isPending}>
            Cancelar
          </Button>
          <Button type="submit" form="form-novo-atendimento" disabled={criar.isPending}>
            {criar.isPending ? "Registrando…" : "Registrar atendimento"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
