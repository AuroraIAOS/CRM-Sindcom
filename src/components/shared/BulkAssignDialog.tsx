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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { mensagemErro } from "@/lib/mensagens";

export type CampoAtribuicaoLote =
  | { name: string; label: string; tipo: "text" }
  | { name: string; label: string; tipo: "number" }
  | { name: string; label: string; tipo: "date" }
  | { name: string; label: string; tipo: "select"; opcoes: { value: string; label: string }[] };

/** Seção de campos compartilháveis (Tarefa 01.2 — DADOS/VÍNCULOS/CARTAS). */
export type SecaoAtribuicao = {
  chave: string;
  titulo: string;
  campos: CampoAtribuicaoLote[];
};

/**
 * Popup genérico de "Atribuir em massa" (Tarefa 01.2), organizado por seções.
 * Só os campos efetivamente preenchidos são enviados ao `onConfirmar`, agrupados
 * por seção — o chamador roteia cada seção para a tabela/solicitação certa. Os
 * demais registros ficam intocados nos campos deixados em branco. Segunda etapa
 * via `ConfirmDialog` é obrigatória; `avisos[chave]` mostra um alerta forte
 * quando aquela seção tiver campo preenchido (ex.: Cartas → rebaixa a Bronze).
 */
export function BulkAssignDialog({
  open,
  onOpenChange,
  titulo,
  count,
  secoes,
  avisos,
  onConfirmar,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  titulo: string;
  count: number;
  secoes: SecaoAtribuicao[];
  avisos?: Record<string, string>;
  onConfirmar: (porSecao: Record<string, Record<string, string>>) => Promise<void>;
}) {
  const [valores, setValores] = useState<Record<string, Record<string, string>>>({});
  const [confirmando, setConfirmando] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  function handleChange(secao: string, name: string, v: string) {
    setValores((prev) => ({ ...prev, [secao]: { ...prev[secao], [name]: v } }));
  }

  // Só seções com ≥1 campo não-vazio.
  const preenchidosPorSecao: Record<string, Record<string, string>> = {};
  for (const secao of secoes) {
    const campos = valores[secao.chave] ?? {};
    const filtrados = Object.fromEntries(
      Object.entries(campos).filter(([, v]) => v !== "" && v != null),
    );
    if (Object.keys(filtrados).length > 0) preenchidosPorSecao[secao.chave] = filtrados;
  }
  const podeContinuar = Object.keys(preenchidosPorSecao).length > 0;
  const avisosAtivos = Object.keys(preenchidosPorSecao)
    .map((chave) => avisos?.[chave])
    .filter((a): a is string => !!a);

  function fechar() {
    setValores({});
    setErro(null);
    setConfirmando(false);
    onOpenChange(false);
  }

  async function confirmarFinal() {
    setErro(null);
    setCarregando(true);
    try {
      await onConfirmar(preenchidosPorSecao);
      fechar();
    } catch (e) {
      setErro(mensagemErro(e));
    } finally {
      setCarregando(false);
    }
  }

  return (
    <>
      <Dialog open={open && !confirmando} onOpenChange={(o) => !o && fechar()}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{titulo}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-texto-2">
            Só os campos preenchidos abaixo serão aplicados aos {count} registro
            {count > 1 ? "s" : ""} selecionado{count > 1 ? "s" : ""}. Campos deixados em branco não
            alteram o valor atual dos registros.
          </p>
          <div className="flex flex-col gap-5">
            {secoes.map((secao) => (
              <fieldset
                key={secao.chave}
                className="flex flex-col gap-3 rounded-md border border-black/10 p-4"
              >
                <legend className="px-1 text-xs font-bold uppercase tracking-wide text-texto-2">
                  {secao.titulo}
                </legend>
                {secao.campos.map((campo) => (
                  <div key={campo.name} className="flex flex-col gap-1">
                    <label className="text-sm font-medium text-texto-1">{campo.label}</label>
                    {campo.tipo === "select" ? (
                      <Select
                        value={valores[secao.chave]?.[campo.name] ?? ""}
                        onValueChange={(v) => handleChange(secao.chave, campo.name, v)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Não alterar" />
                        </SelectTrigger>
                        <SelectContent>
                          {campo.opcoes.map((o) => (
                            <SelectItem key={o.value} value={o.value}>
                              {o.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input
                        type={campo.tipo}
                        value={valores[secao.chave]?.[campo.name] ?? ""}
                        onChange={(e) => handleChange(secao.chave, campo.name, e.target.value)}
                        placeholder={campo.tipo === "date" ? undefined : "Não alterar"}
                      />
                    )}
                  </div>
                ))}
              </fieldset>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={fechar}>
              Cancelar
            </Button>
            <Button disabled={!podeContinuar} onClick={() => setConfirmando(true)}>
              Continuar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmando}
        onOpenChange={(o) => !o && setConfirmando(false)}
        titulo="Confirmar atribuição em massa"
        destrutivo={avisosAtivos.length > 0}
        descricao={
          <>
            Os {count} registro{count > 1 ? "s" : ""} selecionado{count > 1 ? "s" : ""} receberão os
            novos valores preenchidos. Essa ação é irreversível. Deseja prosseguir?
            {avisosAtivos.map((a, i) => (
              <p key={i} className="mt-2 font-semibold text-estado-alerta">
                ⚠ {a}
              </p>
            ))}
            {erro && <p className="mt-2 text-estado-erro">{erro}</p>}
          </>
        }
        carregando={carregando}
        textoConfirmar="Confirmar atribuição"
        onConfirmar={confirmarFinal}
      />
    </>
  );
}
