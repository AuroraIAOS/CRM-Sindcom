import { useState, type ChangeEvent } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Card } from "@/components/ui/card";
import { mensagemErro } from "@/lib/mensagens";
import {
  contarPorStatus,
  dedupPorChave,
  parseCsv,
  temAvisoZeroComido,
  type LinhaPreview,
} from "./parsers";
import { validarEmpresas, type EmpresaPayload } from "./validarEmpresas";
import { useContextoEmpresas, useImportarEmpresas, useRegistrarImportacao } from "./api";
import { PreviewTable } from "./PreviewTable";
import { Contadores } from "./Contadores";
import { baixarRejeitadas } from "./relatorio";

export function ImportarEmpresas() {
  const contexto = useContextoEmpresas();
  const importar = useImportarEmpresas();
  const registrarLog = useRegistrarImportacao();

  const [arquivo, setArquivo] = useState<File | null>(null);
  const [preview, setPreview] = useState<LinhaPreview<EmpresaPayload>[] | null>(null);
  const [ignorarExistentes, setIgnorarExistentes] = useState(false);
  const [resultado, setResultado] = useState<{ inseridos: number; atualizados: number } | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  async function aoSelecionarArquivo(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f || !contexto.data) return;
    setArquivo(f);
    setResultado(null);
    setErro(null);
    const parse = await parseCsv(f);
    setPreview(validarEmpresas(parse, contexto.data));
  }

  async function executar() {
    if (!preview || !arquivo) return;
    setErro(null);
    try {
      const validas = preview.filter(
        (l): l is LinhaPreview<EmpresaPayload> & { dados: EmpresaPayload } =>
          l.dados !== null && (!ignorarExistentes || l.status !== "atualizar"),
      );
      const linhas = dedupPorChave(validas.map((l) => l.dados), (d) => d.cnpj_basico);
      await importar.mutateAsync(linhas);

      const c = contarPorStatus(preview);
      const inseridos = c.inserir + c.avisos;
      const atualizados = ignorarExistentes ? 0 : c.atualizar;
      await registrarLog.mutateAsync({
        entidade: "empresas",
        arquivo_nome: arquivo.name,
        total_linhas: c.total,
        inseridos,
        atualizados,
        erros: preview
          .filter((l) => l.status === "rejeitada")
          .map((l) => ({ linha: l.linha, mensagem: l.mensagens.join("; ") })),
      });
      setResultado({ inseridos, atualizados });
    } catch (e) {
      setErro(mensagemErro(e));
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-texto-2">
        Colunas esperadas: CNPJ básico; Razão social; Natureza jurídica; Qualificação do
        responsável; Capital; Porte. Modelo em <code>dados/exemplos_importacao/empresas.csv</code>.
      </p>

      <input type="file" accept=".csv" onChange={aoSelecionarArquivo} disabled={contexto.isLoading} />

      {preview && (
        <>
          {temAvisoZeroComido(preview) && (
            <p className="rounded-md bg-estado-alerta/10 p-3 text-sm text-estado-alerta">
              Vários CNPJs básicos parecem ter perdido o zero à esquerda (comum quando o Excel
              converte a coluna em número) — já restauramos automaticamente; confira as linhas
              marcadas.
            </p>
          )}

          <Contadores preview={preview} />

          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={ignorarExistentes} onCheckedChange={(v) => setIgnorarExistentes(!!v)} />
            Ignorar existentes (padrão: atualizar dados cadastrais)
          </label>

          <PreviewTable
            preview={preview}
            resumoLinha={(l) =>
              l.dados
                ? `${l.dados.cnpj_basico} — ${l.dados.razao_social}`
                : l.bruta["Razão social"] || l.bruta["Razao social"] || "—"
            }
          />

          <div className="flex items-center gap-3">
            <Button onClick={executar} disabled={importar.isPending}>
              {importar.isPending ? "Importando…" : "Importar válidas"}
            </Button>
            <Button variant="outline" onClick={() => baixarRejeitadas("empresas", preview)}>
              Baixar rejeitadas
            </Button>
          </div>

          {erro && <p className="text-sm text-estado-erro">{erro}</p>}
          {resultado && (
            <Card className="p-4 text-sm text-estado-sucesso">
              Importação concluída: {resultado.inseridos} inserida(s), {resultado.atualizados} atualizada(s).
            </Card>
          )}
        </>
      )}
    </div>
  );
}
