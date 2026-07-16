import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { EntityForm } from "@/components/shared/EntityForm";
import { formatarMoeda } from "@/lib/formatters";
import { useBeneficiadosTrabalhador } from "@/features/trabalhadores/api";
import { useParceirosSimples } from "@/features/parceiros/api";
import { useBeneficiosDoParceiro } from "@/features/beneficios/api";
import { useVerificarBloqueio, type TrabalhadorOpcao } from "./api";
import { solicitacaoSchema, type SolicitacaoFormValues } from "./schemas";
import { TrabalhadorPicker } from "./TrabalhadorPicker";

/** Ordem do enum `nivel_protecao` — a MESMA comparação que
 *  `fn_valida_solicitacao` faz no banco (bronze < prata < ouro). */
const ORDEM_NIVEL = ["bronze", "prata", "ouro"] as const;
const ROTULO_NIVEL = { bronze: "Bronze", prata: "Prata", ouro: "Ouro" } as const;

const SEM_BENEFICIADO = "titular";

const VALORES_INICIAIS: SolicitacaoFormValues = {
  trabalhador_id: "",
  beneficiado_id: undefined,
  parceiro_id: "",
  beneficio_id: "",
  data_agendada: "",
  horario: "",
  observacoes: "",
};

/**
 * Fluxo do "carrinho" (frontend.md §2.2): titular/beneficiado → parceiro →
 * benefício (filtrado por nível, bloqueios exibidos ANTES do submit) → data/hora.
 *
 * As guardas aqui são de usabilidade, não de segurança: quem barra de verdade é
 * o trigger `fn_valida_solicitacao`. Se algo escapar (preço ou nível mudou entre
 * o preenchimento e o envio), o erro do Postgres sobe traduzido pelo mapa central.
 */
export function SolicitacaoServicoForm({
  id,
  onSubmit,
  erro,
}: {
  id: string;
  onSubmit: (valores: SolicitacaoFormValues) => void | Promise<void>;
  erro: string | null;
}) {
  const [titular, setTitular] = useState<TrabalhadorOpcao | null>(null);
  const [parceiroId, setParceiroId] = useState<string>("");

  const parceiros = useParceirosSimples();
  const beneficiados = useBeneficiadosTrabalhador(titular?.id);
  const beneficios = useBeneficiosDoParceiro(parceiroId || undefined);
  const bloqueio = useVerificarBloqueio(titular?.id);

  const nivelTitular = titular?.nivel ? ORDEM_NIVEL.indexOf(titular.nivel) : -1;

  return (
    <EntityForm
      id={id}
      schema={solicitacaoSchema}
      valoresIniciais={VALORES_INICIAIS}
      onSubmit={onSubmit}
    >
      {(form) => (
        <div className="flex flex-col gap-4">
          <FormField
            control={form.control}
            name="trabalhador_id"
            render={() => (
              <FormItem>
                <FormLabel>Titular</FormLabel>
                <TrabalhadorPicker
                  selecionado={titular}
                  onSelecionar={(t) => {
                    setTitular(t);
                    form.setValue("trabalhador_id", t.id, { shouldValidate: true });
                    // Beneficiado pertence ao titular anterior — limpar é obrigatório,
                    // senão o trigger rejeita ("Beneficiado não pertence ao titular").
                    form.setValue("beneficiado_id", undefined);
                  }}
                />
                <FormMessage />
              </FormItem>
            )}
          />

          {bloqueio.data === true && (
            <p className="flex items-start gap-2 rounded-md bg-estado-alerta/10 p-3 text-sm text-estado-alerta">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                Titular com mensalidade do convênio inadimplente — o sistema recusará
                solicitações de convênio até a regularização.
              </span>
            </p>
          )}

          {titular && (
            <FormField
              control={form.control}
              name="beneficiado_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Interessado</FormLabel>
                  <Select
                    value={field.value ?? SEM_BENEFICIADO}
                    onValueChange={(v) => field.onChange(v === SEM_BENEFICIADO ? undefined : v)}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value={SEM_BENEFICIADO}>Para o próprio titular</SelectItem>
                      {(beneficiados.data ?? []).map((b) => (
                        <SelectItem key={b.id} value={b.id}>
                          {b.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}

          <FormField
            control={form.control}
            name="parceiro_id"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Parceiro</FormLabel>
                <Select
                  value={field.value || undefined}
                  onValueChange={(v) => {
                    field.onChange(v);
                    setParceiroId(v);
                    // O benefício anterior é de outro parceiro.
                    form.setValue("beneficio_id", "");
                  }}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione…" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {(parceiros.data ?? []).map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.nome}
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
            name="beneficio_id"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Benefício</FormLabel>
                <Select
                  value={field.value || undefined}
                  onValueChange={field.onChange}
                  disabled={!parceiroId}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue
                        placeholder={parceiroId ? "Selecione…" : "Escolha um parceiro primeiro"}
                      />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {(beneficios.data ?? [])
                      .filter((b) => b.ativo)
                      .map((b) => {
                        const permitido =
                          nivelTitular >= 0 && nivelTitular >= ORDEM_NIVEL.indexOf(b.nivel_minimo);
                        return (
                          <SelectItem key={b.id} value={b.id} disabled={!permitido}>
                            <span className="flex items-center gap-2">
                              {b.nome}
                              {b.valor_convenio != null && (
                                <span className="text-xs text-texto-2">
                                  {formatarMoeda(b.valor_convenio)}
                                </span>
                              )}
                              {!permitido && (
                                <span className="text-xs text-estado-alerta">
                                  requer {ROTULO_NIVEL[b.nivel_minimo]}
                                </span>
                              )}
                            </span>
                          </SelectItem>
                        );
                      })}
                  </SelectContent>
                </Select>
                {titular && (
                  <p className="text-xs text-texto-2">
                    Nível do titular: {titular.nivel ? ROTULO_NIVEL[titular.nivel] : "—"} — benefícios
                    acima desse nível ficam indisponíveis.
                  </p>
                )}
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="data_agendada"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Data agendada</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="horario"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Horário (opcional)</FormLabel>
                  <FormControl>
                    <Input type="time" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <FormField
            control={form.control}
            name="observacoes"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Observações (opcional)</FormLabel>
                <FormControl>
                  <Textarea {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {erro && <p className="text-sm text-estado-erro">{erro}</p>}
        </div>
      )}
    </EntityForm>
  );
}
