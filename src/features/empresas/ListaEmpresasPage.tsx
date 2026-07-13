import { useMemo, useState } from "react";
import type { ColumnDef, PaginationState, SortingState } from "@tanstack/react-table";
import { DataTable } from "@/components/shared/DataTable";
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
import { Pencil } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { formatarCnpj } from "@/lib/formatters";
import { mensagemErro } from "@/lib/mensagens";
import { useMunicipiosBase } from "@/features/municipios/api";
import { useConvencoes } from "@/features/convencoes/api";
import {
  useAtualizarEmpresa,
  useAtualizarEstabelecimento,
  useEmpresa,
  useEmpresas,
  useEstabelecimento,
  useEstabelecimentosDaEmpresa,
  type EmpresaListItem,
  type EstabelecimentoDaEmpresa,
} from "./api";
import { empresaSchema, estabelecimentoSchema, type EstabelecimentoFormValues } from "./schemas";

const PODE_EDITAR = ["admin", "secretaria"] as const;

export function ListaEmpresasPage() {
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 20 });
  const [sorting, setSorting] = useState<SortingState>([]);
  const [busca, setBusca] = useState("");
  const [selecionada, setSelecionada] = useState<string | null>(null);

  const empresas = useEmpresas(pagination, sorting, busca);

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
      <h1 className="text-3xl font-semibold text-texto-1">Empresas</h1>

      {empresas.isError && (
        <p className="text-sm text-estado-erro">{mensagemErro(empresas.error)}</p>
      )}

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
          vazio="Nenhuma empresa encontrada. A carga em massa chega na importação CSV (subetapa 01.5)."
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
    </div>
  );
}

function DetalheEmpresa({ cnpjBasico }: { cnpjBasico: string }) {
  const { role } = useAuth();
  const podeEditar = role !== null && (PODE_EDITAR as readonly string[]).includes(role);

  const empresa = useEmpresa(cnpjBasico);
  const estabelecimentos = useEstabelecimentosDaEmpresa(cnpjBasico);
  const atualizar = useAtualizarEmpresa(cnpjBasico);
  const [erro, setErro] = useState<string | null>(null);
  const [emEdicao, setEmEdicao] = useState<EstabelecimentoDaEmpresa | null>(null);

  if (empresa.isLoading) return <p className="text-texto-2">Carregando empresa…</p>;
  if (empresa.isError) return <p className="text-estado-erro">{mensagemErro(empresa.error)}</p>;
  if (!empresa.data) return null;

  const e = empresa.data;

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
          onSubmit={async (valores) => {
            setErro(null);
            try {
              await atualizar.mutateAsync(valores);
            } catch (err) {
              setErro(mensagemErro(err));
            }
          }}
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
                  {atualizar.isPending ? "Salvando…" : "Salvar"}
                </Button>
              )}
            </div>
          )}
        </EntityForm>
      </Card>

      <Card className="p-6">
        <h2 className="mb-3 text-lg font-semibold text-texto-1">Estabelecimentos</h2>
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
    </div>
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
  const municipios = useMunicipiosBase();
  const convencoes = useConvencoes();
  const atualizar = useAtualizarEstabelecimento(id, cnpjBasico);
  const [erro, setErro] = useState<string | null>(null);

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

  async function salvar(valores: EstabelecimentoFormValues) {
    setErro(null);
    try {
      await atualizar.mutateAsync(valores);
      onOpenChange(false);
    } catch (e) {
      setErro(mensagemErro(e));
    }
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
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
          onSubmit={salvar}
        >
          {(form) => (
            <div className="flex flex-col gap-4">
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

              {erro && <p className="text-sm text-estado-erro">{erro}</p>}
            </div>
          )}
        </EntityForm>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button type="submit" form="form-estabelecimento" disabled={atualizar.isPending}>
            {atualizar.isPending ? "Salvando…" : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
