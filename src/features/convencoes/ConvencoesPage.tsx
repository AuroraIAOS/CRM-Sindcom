import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { EntityForm } from "@/components/shared/EntityForm";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { Pencil, Plus, Trash2, Download } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { formatarDataBR } from "@/lib/formatters";
import { mensagemErro } from "@/lib/mensagens";
import { exportarCsv, type ColunaCsv } from "@/lib/csv";
import {
  useAtualizarConvencao,
  useConvencao,
  useConvencoes,
  useCriarConvencao,
  useExcluirConvencao,
  type Convencao,
} from "./api";
import { convencaoSchema, type ConvencaoFormValues } from "./schemas";
import { PisosTab } from "./abas/PisosTab";
import { TaxasTab } from "./abas/TaxasTab";
import { EstabelecimentosTab } from "./abas/EstabelecimentosTab";

const PODE_ESCREVER = ["admin", "secretaria"] as const;

const COLUNAS_CSV_CONVENCAO: ColunaCsv<Convencao>[] = [
  { titulo: "Nome", valor: (c) => c.nome },
  { titulo: "Ano-base", valor: (c) => c.ano_base },
  { titulo: "Início vigência", valor: (c) => formatarDataBR(c.data_inicio_vigencia) },
  { titulo: "Fim vigência", valor: (c) => formatarDataBR(c.data_fim_vigencia) },
  { titulo: "Limite oposição", valor: (c) => formatarDataBR(c.data_limite_oposicao) },
];

export function ConvencoesPage() {
  const { role } = useAuth();
  const podeEscrever = role !== null && (PODE_ESCREVER as readonly string[]).includes(role);

  const convencoes = useConvencoes();
  const [selecionada, setSelecionada] = useState<string | null>(null);
  const [dialogAberto, setDialogAberto] = useState(false);
  const [emEdicao, setEmEdicao] = useState<Convencao | null>(null);
  const [paraExcluir, setParaExcluir] = useState<Convencao | null>(null);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-semibold text-texto-1">Convenções coletivas (CCT)</h1>
        <div className="flex gap-2">
          {(convencoes.data ?? []).length > 0 && (
            <Button
              variant="outline"
              onClick={() => exportarCsv("convencoes", convencoes.data ?? [], COLUNAS_CSV_CONVENCAO)}
            >
              <Download className="mr-1 h-4 w-4" /> Exportar CSV
            </Button>
          )}
          {podeEscrever && (
            <Button
              onClick={() => {
                setEmEdicao(null);
                setDialogAberto(true);
              }}
            >
              <Plus className="mr-1 h-4 w-4" /> Nova convenção
            </Button>
          )}
        </div>
      </div>

      {convencoes.isError && (
        <p className="text-sm text-estado-erro">{mensagemErro(convencoes.error)}</p>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
        <Card className="flex flex-col divide-y">
          {convencoes.isLoading && <p className="p-4 text-texto-2">Carregando…</p>}
          {convencoes.data && convencoes.data.length === 0 && (
            <p className="p-4 text-sm text-texto-2">Nenhuma convenção cadastrada.</p>
          )}
          {(convencoes.data ?? []).map((c) => (
            <button
              key={c.id}
              onClick={() => setSelecionada(c.id)}
              className={
                "flex flex-col gap-0.5 px-4 py-3 text-left text-sm hover:bg-black/5 " +
                (selecionada === c.id ? "bg-realce/10" : "")
              }
            >
              <span className="font-semibold text-texto-1">{c.nome}</span>
              <span className="text-texto-2">Ano-base {c.ano_base}</span>
            </button>
          ))}
        </Card>

        {selecionada ? (
          <DetalheConvencao
            id={selecionada}
            podeEscrever={podeEscrever}
            onEditar={(c) => {
              setEmEdicao(c);
              setDialogAberto(true);
            }}
            onExcluir={(c) => setParaExcluir(c)}
          />
        ) : (
          <Card className="flex items-center justify-center p-8 text-sm text-texto-2">
            Selecione uma convenção para ver pisos, taxas e estabelecimentos vinculados.
          </Card>
        )}
      </div>

      {dialogAberto && (
        <ConvencaoFormDialog convencao={emEdicao} onOpenChange={setDialogAberto} />
      )}

      <ExcluirConvencaoDialog
        convencao={paraExcluir}
        onOpenChange={(open) => {
          if (!open) {
            if (paraExcluir?.id === selecionada) setSelecionada(null);
            setParaExcluir(null);
          }
        }}
      />
    </div>
  );
}

function DetalheConvencao({
  id,
  podeEscrever,
  onEditar,
  onExcluir,
}: {
  id: string;
  podeEscrever: boolean;
  onEditar: (c: Convencao) => void;
  onExcluir: (c: Convencao) => void;
}) {
  const { role } = useAuth();
  const convencao = useConvencao(id);

  if (convencao.isLoading) return <p className="text-texto-2">Carregando…</p>;
  if (convencao.isError) return <p className="text-estado-erro">{mensagemErro(convencao.error)}</p>;
  if (!convencao.data) return null;

  const c = convencao.data;

  return (
    <Card className="flex flex-col gap-4 p-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-xl font-semibold text-texto-1">{c.nome}</h2>
          <dl className="mt-1 grid grid-cols-2 gap-x-6 gap-y-0.5 text-sm text-texto-2 sm:grid-cols-4">
            <span>Ano-base: {c.ano_base}</span>
            <span>Início: {formatarDataBR(c.data_inicio_vigencia)}</span>
            <span>Fim: {formatarDataBR(c.data_fim_vigencia) || "—"}</span>
            <span>Limite oposição: {formatarDataBR(c.data_limite_oposicao) || "—"}</span>
          </dl>
        </div>
        <div className="flex gap-1">
          {podeEscrever && (
            <Button variant="ghost" size="icon" onClick={() => onEditar(c)}>
              <Pencil className="h-4 w-4" />
            </Button>
          )}
          {role === "admin" && (
            <Button variant="ghost" size="icon" onClick={() => onExcluir(c)}>
              <Trash2 className="h-4 w-4 text-estado-erro" />
            </Button>
          )}
        </div>
      </div>

      {c.observacoes && <p className="text-sm text-texto-2">{c.observacoes}</p>}

      <Tabs defaultValue="pisos">
        <TabsList>
          <TabsTrigger value="pisos">Pisos</TabsTrigger>
          <TabsTrigger value="taxas">Taxas</TabsTrigger>
          <TabsTrigger value="estabelecimentos">Estabelecimentos</TabsTrigger>
        </TabsList>
        <TabsContent value="pisos"><PisosTab convencaoId={c.id} /></TabsContent>
        <TabsContent value="taxas"><TaxasTab convencaoId={c.id} /></TabsContent>
        <TabsContent value="estabelecimentos">
          <EstabelecimentosTab convencaoId={c.id} nomeConvencao={c.nome} />
        </TabsContent>
      </Tabs>
    </Card>
  );
}

function ConvencaoFormDialog({
  convencao,
  onOpenChange,
}: {
  convencao: Convencao | null;
  onOpenChange: (open: boolean) => void;
}) {
  const criar = useCriarConvencao();
  const atualizar = useAtualizarConvencao(convencao?.id ?? "");
  const [erro, setErro] = useState<string | null>(null);
  const salvando = criar.isPending || atualizar.isPending;

  const valoresIniciais: ConvencaoFormValues = {
    nome: convencao?.nome ?? "",
    ano_base: convencao?.ano_base ?? new Date().getFullYear(),
    data_inicio_vigencia: convencao?.data_inicio_vigencia ?? "",
    data_fim_vigencia: convencao?.data_fim_vigencia ?? "",
    data_limite_oposicao: convencao?.data_limite_oposicao ?? "",
    documento_url: convencao?.documento_url ?? "",
    observacoes: convencao?.observacoes ?? "",
  };

  async function salvar(valores: ConvencaoFormValues) {
    setErro(null);
    try {
      if (convencao) {
        await atualizar.mutateAsync(valores);
      } else {
        await criar.mutateAsync(valores);
      }
      onOpenChange(false);
    } catch (e) {
      setErro(mensagemErro(e));
    }
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{convencao ? "Editar convenção" : "Nova convenção"}</DialogTitle>
        </DialogHeader>
        <EntityForm
          id="form-convencao"
          schema={convencaoSchema}
          valoresIniciais={valoresIniciais}
          onSubmit={salvar}
        >
          {(form) => (
            <div className="flex flex-col gap-4">
              <FormField
                control={form.control}
                name="nome"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nome</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Ex.: CCT Comércio Varejista 2026/2027" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="ano_base"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Ano-base</FormLabel>
                    <FormControl><Input type="number" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="data_inicio_vigencia"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Início da vigência</FormLabel>
                      <FormControl><Input type="date" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="data_fim_vigencia"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Fim da vigência (opcional)</FormLabel>
                      <FormControl><Input type="date" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={form.control}
                name="data_limite_oposicao"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Data limite da carta de oposição</FormLabel>
                    <FormControl><Input type="date" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="documento_url"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Documento (link — opcional)</FormLabel>
                    <FormControl><Input {...field} placeholder="https://…" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="observacoes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Observações</FormLabel>
                    <FormControl><Textarea {...field} /></FormControl>
                    <FormMessage />
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
          <Button type="submit" form="form-convencao" disabled={salvando}>
            {salvando ? "Salvando…" : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ExcluirConvencaoDialog({
  convencao,
  onOpenChange,
}: {
  convencao: Convencao | null;
  onOpenChange: (open: boolean) => void;
}) {
  const excluir = useExcluirConvencao();
  const [erro, setErro] = useState<string | null>(null);

  async function confirmar() {
    if (!convencao) return;
    setErro(null);
    try {
      await excluir.mutateAsync(convencao.id);
      onOpenChange(false);
    } catch (e) {
      setErro(mensagemErro(e));
    }
  }

  return (
    <ConfirmDialog
      open={!!convencao}
      onOpenChange={onOpenChange}
      titulo="Excluir convenção"
      descricao={
        <>
          Remover a convenção "{convencao?.nome}"? Isso também apaga os pisos e taxas vinculados.
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
