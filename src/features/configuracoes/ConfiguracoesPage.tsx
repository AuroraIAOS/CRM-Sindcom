import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { ConfirmarEdicaoDialog } from "@/components/shared/ConfirmarEdicaoDialog";
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
import { Checkbox } from "@/components/ui/checkbox";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { EntityForm } from "@/components/shared/EntityForm";
import { Pencil, ShieldAlert } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { mensagemErro } from "@/lib/mensagens";
import { formatarDataBR } from "@/lib/formatters";
import { useParceirosSimples } from "@/features/parceiros/api";
import {
  useAtualizarConfiguracao,
  useAtualizarPerfil,
  useConfiguracoes,
  usePerfis,
  type Configuracao,
  type Perfil,
} from "./api";
import { configuracaoSchema, perfilSchema, type PerfilFormValues } from "./schemas";

const ROTULO_PAPEL: Record<string, string> = {
  admin: "Administrador",
  presidente: "Presidente",
  secretaria: "Secretaria",
  juridico: "Jurídico",
  parceiro: "Parceiro",
};

/**
 * `/configuracoes` — specs/frontend.md §2 ("Usuários e sistema", só Admin) +
 * Subetapa 03.5 (specs/plano_fases.md).
 *
 * Duas seções: parâmetros operacionais (`configuracoes`) e perfis. A criação
 * de LOGIN novo fica de fora — exigiria `auth.admin.createUser`, que só roda
 * com `service_role`, e o CLAUDE.md proíbe essa chave no frontend. Os 5
 * perfis atuais nasceram direto no Supabase na Fase 0; até existir uma Edge
 * Function dedicada para convite de usuário, contas novas continuam sendo
 * criadas por lá (nota visível na seção de Usuários, não escondida).
 */
export function ConfiguracoesPage() {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="font-titulo text-3xl text-texto-1">Configurações</h1>
        <p className="text-sm text-texto-2">Parâmetros operacionais e usuários do sistema.</p>
      </div>

      <SecaoParametros />
      <SecaoUsuarios />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Parâmetros
// ---------------------------------------------------------------------------

function SecaoParametros() {
  const { data, isPending, error } = useConfiguracoes();

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="font-titulo text-lg text-texto-1">Parâmetros do sistema</CardTitle>
      </CardHeader>
      <CardContent className="pb-4">
        {isPending ? (
          <p className="text-sm text-texto-2">Carregando…</p>
        ) : error ? (
          <p className="text-sm text-estado-erro">{mensagemErro(error)}</p>
        ) : (data ?? []).length === 0 ? (
          <p className="text-sm text-texto-2">Nenhum parâmetro cadastrado.</p>
        ) : (
          <div className="divide-y divide-border">
            {(data ?? []).map((c) => (
              <LinhaParametro key={c.chave} config={c} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function LinhaParametro({ config }: { config: Configuracao }) {
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState(config.valor);
  const [erroValidacao, setErroValidacao] = useState<string | null>(null);
  const atualizar = useAtualizarConfiguracao();

  function iniciarEdicao() {
    setValor(config.valor);
    setErroValidacao(null);
    setEditando(true);
  }

  async function salvar() {
    const validado = configuracaoSchema.safeParse({ valor });
    if (!validado.success) {
      setErroValidacao(validado.error.issues[0]?.message ?? "Valor inválido");
      return;
    }
    try {
      await atualizar.mutateAsync({ chave: config.chave, valor: validado.data.valor });
      setEditando(false);
    } catch (e) {
      setErroValidacao(mensagemErro(e));
    }
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 py-3">
      <div className="min-w-0 flex-1">
        <p className="font-mono text-sm font-semibold text-texto-1">{config.chave}</p>
        {config.descricao ? <p className="text-xs text-texto-2">{config.descricao}</p> : null}
        <p className="text-xs text-texto-2">
          Atualizado em {formatarDataBR(config.updated_at)}
        </p>
      </div>

      {editando ? (
        <div className="flex items-center gap-2">
          <div>
            <Input
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              className="w-24"
              inputMode="numeric"
              aria-label={`Valor de ${config.chave}`}
            />
            {erroValidacao ? <p className="text-xs text-estado-erro">{erroValidacao}</p> : null}
          </div>
          <Button size="sm" onClick={() => void salvar()} disabled={atualizar.isPending}>
            {atualizar.isPending ? "Salvando…" : "Salvar"}
          </Button>
          <Button size="sm" variant="outline" onClick={() => setEditando(false)} disabled={atualizar.isPending}>
            Cancelar
          </Button>
        </div>
      ) : (
        <div className="flex items-center gap-3">
          <span className="text-lg font-bold tabular-nums text-texto-1">{config.valor}</span>
          <Button size="sm" variant="outline" onClick={iniciarEdicao}>
            <Pencil className="mr-1 h-3.5 w-3.5" aria-hidden />
            Editar
          </Button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Usuários (perfis)
// ---------------------------------------------------------------------------

function SecaoUsuarios() {
  const { perfil: perfilAtual } = useAuth();
  const { data, isPending, error } = usePerfis();
  const parceiros = useParceirosSimples();
  const [editando, setEditando] = useState<Perfil | null>(null);

  const nomeParceiro = (id: string | null) =>
    parceiros.data?.find((p) => p.id === id)?.nome ?? "—";

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="font-titulo text-lg text-texto-1">Usuários</CardTitle>
        <p className="text-xs text-texto-2">
          Criação de login novo ainda não tem tela própria — exige acesso administrativo do
          Supabase (fora do escopo do frontend, que só usa a chave anônima). Peça ao Admin
          técnico do projeto para criar a conta; depois ela aparece aqui para ajuste de papel.
        </p>
      </CardHeader>
      <CardContent className="pb-4">
        {isPending ? (
          <p className="text-sm text-texto-2">Carregando…</p>
        ) : error ? (
          <p className="text-sm text-estado-erro">{mensagemErro(error)}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-texto-2">
                  <th className="py-2 pr-3 font-semibold">Nome</th>
                  <th className="py-2 pr-3 font-semibold">E-mail</th>
                  <th className="py-2 pr-3 font-semibold">Papel</th>
                  <th className="py-2 pr-3 font-semibold">Parceiro vinculado</th>
                  <th className="py-2 pr-3 font-semibold">Status</th>
                  <th className="py-2 pr-3 font-semibold" />
                </tr>
              </thead>
              <tbody>
                {(data ?? []).map((p) => {
                  const ehVoce = p.id === perfilAtual?.id;
                  return (
                    <tr key={p.id} className="border-b border-border last:border-0">
                      <td className="py-2 pr-3 text-texto-1">
                        {p.nome}
                        {ehVoce ? <span className="ml-1 text-xs text-texto-2">(você)</span> : null}
                      </td>
                      <td className="py-2 pr-3 text-texto-2">{p.email}</td>
                      <td className="py-2 pr-3">{ROTULO_PAPEL[p.role] ?? p.role}</td>
                      <td className="py-2 pr-3 text-texto-2">
                        {p.role === "parceiro" ? nomeParceiro(p.parceiro_id) : "—"}
                      </td>
                      <td className="py-2 pr-3">
                        <StatusBadge status={p.ativo ? "ativo" : "inativo"} />
                      </td>
                      <td className="py-2 pr-3 text-right">
                        {ehVoce ? (
                          <span
                            title="Por segurança, sua própria conta não é editável nesta tela."
                            className="inline-flex items-center gap-1 text-xs text-texto-2"
                          >
                            <ShieldAlert className="h-3.5 w-3.5" aria-hidden />
                            protegida
                          </span>
                        ) : (
                          <Button size="sm" variant="outline" onClick={() => setEditando(p)}>
                            <Pencil className="mr-1 h-3.5 w-3.5" aria-hidden />
                            Editar
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>

      {editando ? <EditarPerfilDialog perfil={editando} onOpenChange={() => setEditando(null)} /> : null}
    </Card>
  );
}

function EditarPerfilDialog({
  perfil,
  onOpenChange,
}: {
  perfil: Perfil;
  onOpenChange: (open: boolean) => void;
}) {
  const atualizar = useAtualizarPerfil(perfil.id);
  const parceiros = useParceirosSimples();
  const [pendente, setPendente] = useState<PerfilFormValues | null>(null);

  async function confirmar() {
    if (!pendente) return;
    try {
      await atualizar.mutateAsync(pendente);
      setPendente(null);
      onOpenChange(false);
    } catch {
      // erro é mostrado dentro do ConfirmarEdicaoDialog via `erro`
    }
  }

  return (
    <>
      <Dialog open onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar usuário — {perfil.nome}</DialogTitle>
          </DialogHeader>

          <EntityForm
            id="form-perfil"
            schema={perfilSchema}
            valoresIniciais={{
              nome: perfil.nome,
              role: perfil.role,
              parceiro_id: perfil.parceiro_id ?? "",
              ativo: perfil.ativo,
            }}
            onSubmit={(valores) => setPendente(valores)}
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
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="role"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Papel</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {Object.entries(ROTULO_PAPEL).map(([valor, rotulo]) => (
                            <SelectItem key={valor} value={valor}>
                              {rotulo}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {form.watch("role") === "parceiro" ? (
                  <FormField
                    control={form.control}
                    name="parceiro_id"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Parceiro vinculado</FormLabel>
                        <Select value={field.value ?? ""} onValueChange={field.onChange}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Selecione o parceiro" />
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
                ) : null}

                <FormField
                  control={form.control}
                  name="ativo"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center gap-2 space-y-0">
                      <FormControl>
                        <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                      </FormControl>
                      <FormLabel className="!mt-0">
                        Conta ativa (desmarcar bloqueia o acesso ao sistema)
                      </FormLabel>
                    </FormItem>
                  )}
                />
              </div>
            )}
          </EntityForm>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" form="form-perfil">
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmarEdicaoDialog
        open={pendente !== null}
        onOpenChange={(open) => !open && setPendente(null)}
        carregando={atualizar.isPending}
        erro={atualizar.isError ? mensagemErro(atualizar.error) : null}
        onConfirmar={() => void confirmar()}
      />
    </>
  );
}
