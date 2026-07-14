import { useMemo, useState } from "react";
import type { ColumnDef, PaginationState, RowSelectionState, SortingState } from "@tanstack/react-table";
import { DataTable } from "@/components/shared/DataTable";
import { BulkActionsBar } from "@/components/shared/BulkActionsBar";
import { BulkAssignDialog } from "@/components/shared/BulkAssignDialog";
import { ConfirmarEdicaoDialog } from "@/components/shared/ConfirmarEdicaoDialog";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { EntityForm } from "@/components/shared/EntityForm";
import { Pencil, Plus, Download } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { formatarCnpj } from "@/lib/formatters";
import { mensagemErro } from "@/lib/mensagens";
import { exportarCsv, type ColunaCsv } from "@/lib/csv";
import { useMunicipiosBase } from "@/features/municipios/api";
import { useConvencoes } from "@/features/convencoes/api";
import {
  useAtribuirEmpresasEmLote,
  useAtualizarEmpresa,
  useAtualizarEstabelecimento,
  useCriarEmpresa,
  useCriarEstabelecimento,
  useEmpresa,
  useEmpresas,
  useEstabelecimento,
  useEstabelecimentosDaEmpresa,
  type EmpresaListItem,
  type EstabelecimentoDaEmpresa,
} from "./api";
import {
  empresaSchema,
  estabelecimentoSchema,
  novaEmpresaSchema,
  novoEstabelecimentoSchema,
  type EmpresaFormValues,
  type EstabelecimentoFormValues,
  type NovaEmpresaFormValues,
  type NovoEstabelecimentoFormValues,
} from "./schemas";

const PODE_EDITAR = ["admin", "secretaria"] as const;

const COLUNAS_CSV_EMPRESA: ColunaCsv<EmpresaListItem>[] = [
  { titulo: "Razão social", valor: (l) => l.razao_social },
  { titulo: "CNPJ básico", valor: (l) => l.cnpj_basico },
  { titulo: "Porte", valor: (l) => l.porte ?? "" },
];

/** Pagina em lotes de 1000 (mesmo motivo de `ExportarTrabalhadoresDialog.tsx`
 *  — o cap padrão do PostgREST trunca listas grandes). */
async function buscarTodasEmpresas(busca: string): Promise<EmpresaListItem[]> {
  const TAMANHO_PAGINA = 1000;
  let todas: EmpresaListItem[] = [];
  let pagina = 0;
  for (;;) {
    const from = pagina * TAMANHO_PAGINA;
    const to = from + TAMANHO_PAGINA - 1;
    let query = supabase.from("empresas").select("*").order("razao_social").range(from, to);
    const termo = busca.trim();
    if (termo) {
      const digitos = termo.replace(/\D/g, "");
      query =
        digitos.length >= 3
          ? query.ilike("cnpj_basico", `${digitos}%`)
          : query.ilike("razao_social", `%${termo}%`);
    }
    const { data, error } = await query;
    if (error) throw error;
    const linhas = (data ?? []) as EmpresaListItem[];
    todas = todas.concat(linhas);
    if (linhas.length < TAMANHO_PAGINA) break;
    pagina += 1;
  }
  return todas;
}

export function ListaEmpresasPage() {
  const { role } = useAuth();
  const ehAdmin = role === "admin";
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 20 });
  const [sorting, setSorting] = useState<SortingState>([]);
  const [busca, setBusca] = useState("");
  const [selecionada, setSelecionada] = useState<string | null>(null);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [atribuindo, setAtribuindo] = useState(false);
  const [criandoEmpresa, setCriandoEmpresa] = useState(false);
  const [exportandoTudo, setExportandoTudo] = useState(false);

  const empresas = useEmpresas(pagination, sorting, busca);
  const atribuirEmLote = useAtribuirEmpresasEmLote();

  const idsSelecionados = Object.keys(rowSelection).filter((id) => rowSelection[id]);

  async function exportarTudo() {
    setExportandoTudo(true);
    try {
      const linhas = await buscarTodasEmpresas(busca);
      exportarCsv("empresas", linhas, COLUNAS_CSV_EMPRESA);
    } finally {
      setExportandoTudo(false);
    }
  }

  function baixarSelecionadas() {
    const linhas = (empresas.data?.linhas ?? []).filter((l) => rowSelection[l.cnpj_basico]);
    exportarCsv("empresas-selecionadas", linhas, COLUNAS_CSV_EMPRESA);
  }

  const columns = useMemo<ColumnDef<EmpresaListItem, unknown>[]>(
    () => [
      { accessorKey: "razao_social", header: "Razão social" },
      { accessorKey: "cnpj_basico", header: "CNPJ básico", enableSorting: false },
      { accessorKey: "porte", header: "Porte", enableSorting: false },
    ],
    [],
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-semibold text-texto-1">Empresas</h1>
        {ehAdmin && (
          <Button onClick={() => setCriandoEmpresa(true)}>
            <Plus className="mr-1 h-4 w-4" /> Nova empresa
          </Button>
        )}
      </div>

      {empresas.isError && (
        <p className="text-sm text-estado-erro">{mensagemErro(empresas.error)}</p>
      )}

      {ehAdmin && <BulkActionsBar
        count={idsSelecionados.length}
        onBaixar={baixarSelecionadas}
        onAtribuir={() => setAtribuindo(true)}
      />}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <DataTable
          columns={columns}
          data={empresas.data?.linhas ?? []}
          total={empresas.data?.total ?? 0}
          pagination={pagination}
          onPaginationChange={setPagination}
          sorting={sorting}
          onSortingChange={setSorting}
          carregando={empresas.isLoading}
          onLinhaClick={(linha) => setSelecionada(linha.cnpj_basico)}
          onExportar={exportarTudo}
          exportando={exportandoTudo}
          vazio="Nenhuma empresa encontrada. A carga em massa chega na importação CSV (subetapa 01.5)."
          enableSelection={ehAdmin}
          getRowId={(l) => l.cnpj_basico}
          rowSelection={rowSelection}
          onRowSelectionChange={setRowSelection}
          toolbar={
            <Input
              placeholder="Buscar por razão social ou CNPJ…"
              value={busca}
              onChange={(e) => {
                setBusca(e.target.value);
                setPagination((p) => ({ ...p, pageIndex: 0 }));
              }}
              className="w-72"
            />
          }
        />

        {selecionada ? (
          <DetalheEmpresa cnpjBasico={selecionada} />
        ) : (
          <Card className="flex items-center justify-center p-8 text-sm text-texto-2">
            Selecione uma empresa na lista para ver os estabelecimentos.
          </Card>
        )}
      </div>

      <BulkAssignDialog
        open={atribuindo}
        onOpenChange={setAtribuindo}
        titulo="Atribuir em massa"
        count={idsSelecionados.length}
        campos={[
          { name: "razao_social", label: "Razão social", tipo: "text" },
          { name: "porte", label: "Porte", tipo: "text" },
        ]}
        onConfirmar={async (valores) => {
          await atribuirEmLote.mutateAsync({ cnpjsBasicos: idsSelecionados, valores });
          setRowSelection({});
        }}
      />

      {criandoEmpresa && <NovaEmpresaDialog onOpenChange={setCriandoEmpresa} />}
    </div>
  );
}

function NovaEmpresaDialog({ onOpenChange }: { onOpenChange: (open: boolean) => void }) {
  const criar = useCriarEmpresa();
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, setPendente] = useState<NovaEmpresaFormValues | null>(null);

  const valoresIniciais: NovaEmpresaFormValues = { cnpj_basico: "", razao_social: "", porte: "" };

  async function confirmar() {
    if (!pendente) return;
    setErro(null);
    try {
      await criar.mutateAsync(pendente);
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
            <DialogTitle>Nova empresa</DialogTitle>
          </DialogHeader>
          <EntityForm
            id="form-nova-empresa"
            schema={novaEmpresaSchema}
            valoresIniciais={valoresIniciais}
            onSubmit={(valores) => setPendente(valores)}
          >
            {(form) => (
              <div className="flex flex-col gap-4">
                <FormField
                  control={form.control}
                  name="cnpj_basico"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>CNPJ básico (8 dígitos)</FormLabel>
                      <FormControl><Input {...field} placeholder="Somente números" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="razao_social"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Razão social</FormLabel>
                      <FormControl><Input {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="porte"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Porte (opcional)</FormLabel>
                      <FormControl><Input {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {erro && <p className="text-sm text-estado-erro">{erro}</p>}
              </div>
            )}
          </EntityForm>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" form="form-nova-empresa" disabled={criar.isPending}>
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmarEdicaoDialog
        open={!!pendente}
        onOpenChange={(o) => !o && setPendente(null)}
        carregando={criar.isPending}
        erro={erro}
        onConfirmar={confirmar}
      />
    </>
  );
}

function DetalheEmpresa({ cnpjBasico }: { cnpjBasico: string }) {
  const { role } = useAuth();
  const podeEditar = role !== null && (PODE_EDITAR as readonly string[]).includes(role);
  const ehAdmin = role === "admin";

  const empresa = useEmpresa(cnpjBasico);
  const estabelecimentos = useEstabelecimentosDaEmpresa(cnpjBasico);
  const atualizar = useAtualizarEmpresa(cnpjBasico);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, setPendente] = useState<EmpresaFormValues | null>(null);
  const [emEdicao, setEmEdicao] = useState<EstabelecimentoDaEmpresa | null>(null);
  const [criandoEstabelecimento, setCriandoEstabelecimento] = useState(false);

  if (empresa.isLoading) return <p className="text-texto-2">Carregando empresa…</p>;
  if (empresa.isError) return <p className="text-estado-erro">{mensagemErro(empresa.error)}</p>;
  if (!empresa.data) return null;

  const e = empresa.data;

  async function confirmarEdicaoEmpresa() {
    if (!pendente) return;
    setErro(null);
    try {
      await atualizar.mutateAsync(pendente);
      setPendente(null);
    } catch (err) {
      setErro(mensagemErro(err));
    }
  }

  function exportarEstabelecimentos() {
    const colunas: ColunaCsv<EstabelecimentoDaEmpresa>[] = [
      { titulo: "Nome fantasia", valor: (l) => l.nome_fantasia ?? "" },
      { titulo: "CNPJ", valor: (l) => formatarCnpj(l.cnpj_completo) },
      { titulo: "Município", valor: (l) => (l.municipio ? `${l.municipio.nome}/${l.municipio.uf}` : "") },
      { titulo: "CCT", valor: (l) => l.convencao?.nome ?? "" },
    ];
    exportarCsv(`estabelecimentos-${cnpjBasico}`, estabelecimentos.data ?? [], colunas);
  }

  return (
    <div className="flex flex-col gap-4">
      <Card className="p-6">
        <EntityForm
          id="form-empresa"
          schema={empresaSchema}
          valoresIniciais={{
            razao_social: e.razao_social,
            porte: e.porte ?? "",
            capital_social: e.capital_social ?? undefined,
          }}
          onSubmit={(valores) => setPendente(valores)}
        >
          {(form) => (
            <div className="flex flex-col gap-4">
              <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
                <dt className="text-texto-2">CNPJ básico</dt>
                <dd>{e.cnpj_basico}</dd>
                <dt className="text-texto-2">Natureza jurídica</dt>
                <dd>{e.natureza?.descricao ?? "—"}</dd>
                <dt className="text-texto-2">Qualificação do responsável</dt>
                <dd>{e.qualificacao?.descricao ?? "—"}</dd>
              </dl>

              <FormField
                control={form.control}
                name="razao_social"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Razão social</FormLabel>
                    <FormControl>
                      <Input {...field} disabled={!podeEditar} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="porte"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Porte</FormLabel>
                      <FormControl>
                        <Input {...field} disabled={!podeEditar} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="capital_social"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Capital social</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          step="0.01"
                          disabled={!podeEditar}
                          value={field.value ?? ""}
                          onChange={(ev) => field.onChange(ev.target.value)}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {erro && <p className="text-sm text-estado-erro">{erro}</p>}
              {podeEditar && (
                <Button type="submit" className="self-start" disabled={atualizar.isPending}>
                  Salvar
                </Button>
              )}
            </div>
          )}
        </EntityForm>
      </Card>

      <Card className="p-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-texto-1">Estabelecimentos</h2>
          <div className="flex gap-2">
            {estabelecimentos.data && estabelecimentos.data.length > 0 && (
              <Button variant="outline" size="sm" onClick={exportarEstabelecimentos}>
                <Download className="mr-1 h-4 w-4" /> Exportar CSV
              </Button>
            )}
            {ehAdmin && (
              <Button size="sm" onClick={() => setCriandoEstabelecimento(true)}>
                <Plus className="mr-1 h-4 w-4" /> Novo estabelecimento
              </Button>
            )}
          </div>
        </div>
        {estabelecimentos.isLoading && <p className="text-texto-2">Carregando…</p>}
        {estabelecimentos.isError && (
          <p className="text-estado-erro">{mensagemErro(estabelecimentos.error)}</p>
        )}
        {estabelecimentos.data && estabelecimentos.data.length === 0 && (
          <p className="text-sm text-texto-2">Nenhum estabelecimento para esta empresa.</p>
        )}
        {estabelecimentos.data && estabelecimentos.data.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome fantasia</TableHead>
                <TableHead>CNPJ</TableHead>
                <TableHead>Município</TableHead>
                <TableHead>CCT</TableHead>
                {podeEditar && <TableHead className="w-16">Ações</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {estabelecimentos.data.map((est) => (
                <TableRow key={est.id}>
                  <TableCell>{est.nome_fantasia ?? "—"}</TableCell>
                  <TableCell>{formatarCnpj(est.cnpj_completo)}</TableCell>
                  <TableCell>{est.municipio ? `${est.municipio.nome}/${est.municipio.uf}` : "—"}</TableCell>
                  <TableCell>{est.convencao?.nome ?? "—"}</TableCell>
                  {podeEditar && (
                    <TableCell>
                      <Button variant="ghost" size="icon" onClick={() => setEmEdicao(est)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      {emEdicao && (
        <EstabelecimentoEditDialog
          id={emEdicao.id}
          cnpjBasico={cnpjBasico}
          onOpenChange={(open) => !open && setEmEdicao(null)}
        />
      )}

      {criandoEstabelecimento && (
        <NovoEstabelecimentoDialog
          cnpjBasico={cnpjBasico}
          onOpenChange={setCriandoEstabelecimento}
        />
      )}

      <ConfirmarEdicaoDialog
        open={!!pendente}
        onOpenChange={(o) => !o && setPendente(null)}
        carregando={atualizar.isPending}
        erro={erro}
        onConfirmar={confirmarEdicaoEmpresa}
      />
    </div>
  );
}

function CamposEstabelecimento({
  form,
}: {
  form: import("react-hook-form").UseFormReturn<EstabelecimentoFormValues>;
}) {
  const municipios = useMunicipiosBase();
  const convencoes = useConvencoes();

  return (
    <>
      <FormField
        control={form.control}
        name="nome_fantasia"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Nome fantasia</FormLabel>
            <FormControl><Input {...field} /></FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="convencao_id"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Convenção coletiva (CCT)</FormLabel>
            <Select value={field.value || undefined} onValueChange={field.onChange}>
              <FormControl>
                <SelectTrigger><SelectValue placeholder="Sem CCT vinculada" /></SelectTrigger>
              </FormControl>
              <SelectContent>
                {(convencoes.data ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FormMessage />
          </FormItem>
        )}
      />

      <div className="grid grid-cols-3 gap-4">
        <FormField
          control={form.control}
          name="tipo_logradouro"
          render={({ field }) => (
            <FormItem className="col-span-1">
              <FormLabel>Tipo logr.</FormLabel>
              <FormControl><Input {...field} placeholder="Rua, Av." /></FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="logradouro"
          render={({ field }) => (
            <FormItem className="col-span-2">
              <FormLabel>Logradouro</FormLabel>
              <FormControl><Input {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
      <div className="grid grid-cols-3 gap-4">
        <FormField
          control={form.control}
          name="numero"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Número</FormLabel>
              <FormControl><Input {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="complemento"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Complemento</FormLabel>
              <FormControl><Input {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="bairro"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Bairro</FormLabel>
              <FormControl><Input {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <FormField
          control={form.control}
          name="cep"
          render={({ field }) => (
            <FormItem>
              <FormLabel>CEP</FormLabel>
              <FormControl><Input {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
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
                  <SelectTrigger><SelectValue placeholder="Selecione…" /></SelectTrigger>
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
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="flex gap-2">
          <FormField
            control={form.control}
            name="ddd_1"
            render={({ field }) => (
              <FormItem className="w-16">
                <FormLabel>DDD</FormLabel>
                <FormControl><Input {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="telefone_1"
            render={({ field }) => (
              <FormItem className="flex-1">
                <FormLabel>Telefone</FormLabel>
                <FormControl><Input {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>E-mail</FormLabel>
              <FormControl><Input {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
    </>
  );
}

function EstabelecimentoEditDialog({
  id,
  cnpjBasico,
  onOpenChange,
}: {
  id: string;
  cnpjBasico: string;
  onOpenChange: (open: boolean) => void;
}) {
  const estabelecimento = useEstabelecimento(id);
  const atualizar = useAtualizarEstabelecimento(id, cnpjBasico);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, setPendente] = useState<EstabelecimentoFormValues | null>(null);

  if (estabelecimento.isLoading || !estabelecimento.data) {
    return (
      <Dialog open onOpenChange={onOpenChange}>
        <DialogContent>
          <p className="text-texto-2">Carregando…</p>
        </DialogContent>
      </Dialog>
    );
  }

  const est = estabelecimento.data;
  const valoresIniciais: EstabelecimentoFormValues = {
    nome_fantasia: est.nome_fantasia ?? "",
    tipo_logradouro: est.tipo_logradouro ?? "",
    logradouro: est.logradouro ?? "",
    numero: est.numero ?? "",
    complemento: est.complemento ?? "",
    bairro: est.bairro ?? "",
    cep: est.cep ?? "",
    municipio_id: est.municipio_id ?? undefined,
    ddd_1: est.ddd_1 ?? "",
    telefone_1: est.telefone_1 ?? "",
    ddd_2: est.ddd_2 ?? "",
    telefone_2: est.telefone_2 ?? "",
    email: est.email ?? "",
    convencao_id: est.convencao_id ?? "",
  };

  async function confirmar() {
    if (!pendente) return;
    setErro(null);
    try {
      await atualizar.mutateAsync(pendente);
      setPendente(null);
      onOpenChange(false);
    } catch (e) {
      setErro(mensagemErro(e));
    }
  }

  return (
    <>
    <Dialog open={!pendente} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar estabelecimento</DialogTitle>
        </DialogHeader>

        <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
          <dt className="text-texto-2">CNPJ</dt>
          <dd>{formatarCnpj(est.cnpj_completo)}</dd>
          <dt className="text-texto-2">Situação cadastral</dt>
          <dd>{est.motivo?.descricao ?? est.situacao_cadastral ?? "—"}</dd>
          <dt className="text-texto-2">CNAE principal</dt>
          <dd>{est.cnae?.descricao ?? "—"}</dd>
        </dl>

        <EntityForm
          id="form-estabelecimento"
          schema={estabelecimentoSchema}
          valoresIniciais={valoresIniciais}
          onSubmit={(valores) => setPendente(valores)}
        >
          {(form) => (
            <div className="flex flex-col gap-4">
              <CamposEstabelecimento form={form} />
              {erro && <p className="text-sm text-estado-erro">{erro}</p>}
            </div>
          )}
        </EntityForm>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button type="submit" form="form-estabelecimento" disabled={atualizar.isPending}>
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <ConfirmarEdicaoDialog
      open={!!pendente}
      onOpenChange={(o) => !o && setPendente(null)}
      carregando={atualizar.isPending}
      erro={erro}
      onConfirmar={confirmar}
    />
    </>
  );
}

function NovoEstabelecimentoDialog({
  cnpjBasico,
  onOpenChange,
}: {
  cnpjBasico: string;
  onOpenChange: (open: boolean) => void;
}) {
  const criar = useCriarEstabelecimento(cnpjBasico);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, setPendente] = useState<NovoEstabelecimentoFormValues | null>(null);

  const valoresIniciais: NovoEstabelecimentoFormValues = {
    cnpj_ordem: "",
    cnpj_dv: "",
    nome_fantasia: "",
    tipo_logradouro: "",
    logradouro: "",
    numero: "",
    complemento: "",
    bairro: "",
    cep: "",
    municipio_id: undefined,
    ddd_1: "",
    telefone_1: "",
    ddd_2: "",
    telefone_2: "",
    email: "",
    convencao_id: "",
  };

  async function confirmar() {
    if (!pendente) return;
    setErro(null);
    try {
      await criar.mutateAsync(pendente);
      setPendente(null);
      onOpenChange(false);
    } catch (e) {
      setErro(mensagemErro(e));
    }
  }

  return (
    <>
    <Dialog open={!pendente} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Novo estabelecimento</DialogTitle>
        </DialogHeader>

        <EntityForm
          id="form-novo-estabelecimento"
          schema={novoEstabelecimentoSchema}
          valoresIniciais={valoresIniciais}
          onSubmit={(valores) => setPendente(valores)}
        >
          {(form) => (
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="cnpj_ordem"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>CNPJ — ordem (4 dígitos)</FormLabel>
                      <FormControl><Input {...field} placeholder="0001" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="cnpj_dv"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>CNPJ — DV (2 dígitos)</FormLabel>
                      <FormControl><Input {...field} placeholder="00" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <CamposEstabelecimento
                form={form as unknown as import("react-hook-form").UseFormReturn<EstabelecimentoFormValues>}
              />
              {erro && <p className="text-sm text-estado-erro">{erro}</p>}
            </div>
          )}
        </EntityForm>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button type="submit" form="form-novo-estabelecimento" disabled={criar.isPending}>
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <ConfirmarEdicaoDialog
      open={!!pendente}
      onOpenChange={(o) => !o && setPendente(null)}
      carregando={criar.isPending}
      erro={erro}
      onConfirmar={confirmar}
    />
    </>
  );
}
