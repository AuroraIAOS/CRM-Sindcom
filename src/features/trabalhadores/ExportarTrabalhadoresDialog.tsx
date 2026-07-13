import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { mensagemErro } from "@/lib/mensagens";
import { exportarCsv, type ColunaCsv } from "@/lib/csv";
import { formatarDataBR, mascararCpf } from "@/lib/formatters";
import { useRegistrarImportacao } from "@/features/importacao/api";
import type { TrabalhadoresFiltros } from "./api";

type LinhaExportavel = {
  cpf: string;
  nome: string;
  nivel: string | null;
  municipio: { nome: string; uf: string } | null;
  status_cadastro: string;
  forma_pagamento_preferida: string;
  telefone_whatsapp: string | null;
  email: string | null;
  created_at: string;
};

const COLUNAS_BASE: ColunaCsv<LinhaExportavel>[] = [
  { titulo: "Nome", valor: (l) => l.nome },
  { titulo: "Nível", valor: (l) => l.nivel ?? "" },
  { titulo: "Município", valor: (l) => (l.municipio ? `${l.municipio.nome}/${l.municipio.uf}` : "") },
  { titulo: "Status", valor: (l) => l.status_cadastro },
  { titulo: "Forma de pagamento", valor: (l) => l.forma_pagamento_preferida },
  { titulo: "Cadastrado em", valor: (l) => formatarDataBR(l.created_at) },
];

/**
 * specs/importacao.md §8: escolha explícita entre dados crus (Admin, logada
 * em importacoes_csv como `export:...`) e mascarados (qualquer papel com
 * select). Exporta o resultado da query ATUAL (filtros aplicados, todas as
 * páginas) — não só a página visível na tela.
 */
export function ExportarTrabalhadoresDialog({
  filtros,
  onOpenChange,
}: {
  filtros: TrabalhadoresFiltros;
  onOpenChange: (open: boolean) => void;
}) {
  const { role } = useAuth();
  const ehAdmin = role === "admin";
  const registrarLog = useRegistrarImportacao();
  const [carregando, setCarregando] = useState<"crua" | "mascarada" | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  function montarQuery(from: number, to: number) {
    let query = supabase
      .from("trabalhadores")
      .select(
        "cpf, nome, nivel, status_cadastro, forma_pagamento_preferida, telefone_whatsapp, email, created_at, municipio:municipios(nome, uf)",
      )
      .order("nome")
      .range(from, to);

    const busca = (filtros.busca ?? "").trim();
    if (busca) {
      const digitos = busca.replace(/\D/g, "");
      query = digitos.length >= 3 ? query.ilike("cpf", `${digitos}%`) : query.ilike("nome", `%${busca}%`);
    }
    if (filtros.nivel && filtros.nivel !== "todos") query = query.eq("nivel", filtros.nivel);
    if (filtros.municipioId && filtros.municipioId !== "todos") query = query.eq("municipio_id", filtros.municipioId);
    if (filtros.statusCadastro && filtros.statusCadastro !== "todos") {
      query = query.eq("status_cadastro", filtros.statusCadastro);
    }
    return query;
  }

  /** Pagina em lotes de 1000 — sem isso, o cap padrão do PostgREST trunca
   *  silenciosamente listas grandes (ver bug idêntico em features/importacao/api.ts). */
  async function buscarLinhas(): Promise<LinhaExportavel[]> {
    const TAMANHO_PAGINA = 1000;
    let todas: LinhaExportavel[] = [];
    let pagina = 0;
    for (;;) {
      const from = pagina * TAMANHO_PAGINA;
      const to = from + TAMANHO_PAGINA - 1;
      const { data, error } = await montarQuery(from, to);
      if (error) throw error;
      const linhas = (data ?? []) as LinhaExportavel[];
      todas = todas.concat(linhas);
      if (linhas.length < TAMANHO_PAGINA) break;
      pagina += 1;
    }
    return todas;
  }

  async function exportar(tipo: "crua" | "mascarada") {
    setErro(null);
    setCarregando(tipo);
    try {
      const linhas = await buscarLinhas();
      const colunas: ColunaCsv<LinhaExportavel>[] =
        tipo === "crua"
          ? [
              { titulo: "CPF", valor: (l) => l.cpf },
              ...COLUNAS_BASE,
              { titulo: "Telefone", valor: (l) => l.telefone_whatsapp ?? "" },
              { titulo: "E-mail", valor: (l) => l.email ?? "" },
            ]
          : [{ titulo: "CPF", valor: (l) => mascararCpf(l.cpf) }, ...COLUNAS_BASE];

      exportarCsv(`trabalhadores_${tipo}`, linhas, colunas);

      if (tipo === "crua") {
        await registrarLog.mutateAsync({
          entidade: "export:trabalhadores",
          arquivo_nome: `trabalhadores_crua_${new Date().toISOString().slice(0, 10)}.csv`,
          total_linhas: linhas.length,
          inseridos: 0,
          atualizados: 0,
          erros: [],
        });
      }
      onOpenChange(false);
    } catch (e) {
      setErro(mensagemErro(e));
    } finally {
      setCarregando(null);
    }
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Exportar CSV</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-texto-2">
          Exporta o resultado da lista com os filtros atuais (todas as páginas).
        </p>
        <div className="flex flex-col gap-3">
          <div className="rounded-md border p-3">
            <p className="font-semibold text-texto-1">Dados mascarados (divulgação)</p>
            <p className="text-sm text-texto-2">
              CPF parcial, sem telefone/e-mail. Seguro para compartilhar externamente.
            </p>
            <Button
              className="mt-2"
              variant="outline"
              onClick={() => exportar("mascarada")}
              disabled={carregando !== null}
            >
              {carregando === "mascarada" ? "Exportando…" : "Exportar mascarado"}
            </Button>
          </div>

          {ehAdmin && (
            <div className="rounded-md border p-3">
              <p className="font-semibold text-texto-1">Dados crus (tratamento)</p>
              <p className="text-sm text-texto-2">
                CPF/contato completos, prontos para edição em massa e reimportação. Fica registrado
                com data/hora e usuário em <code>importacoes_csv</code>.
              </p>
              <Button className="mt-2" onClick={() => exportar("crua")} disabled={carregando !== null}>
                {carregando === "crua" ? "Exportando…" : "Exportar cru"}
              </Button>
            </div>
          )}
        </div>
        {erro && <p className="text-sm text-estado-erro">{erro}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={carregando !== null}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
