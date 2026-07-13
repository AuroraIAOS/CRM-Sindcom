import { useState, type ChangeEvent } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { mensagemErro } from "@/lib/mensagens";
import {
  contarPorStatus,
  dedupPorChave,
  parseCsv,
  type LinhaPreview,
  type ParseResultado,
} from "./parsers";
import {
  validarBeneficiados,
  type BeneficiadoPayload,
  type PoliticaDuplicataBeneficiado,
} from "./validarBeneficiados";
import { useContextoBeneficiados, useImportarBeneficiados, useRegistrarImportacao } from "./api";
import { PreviewTable } from "./PreviewTable";
import { Contadores } from "./Contadores";
import { baixarRejeitadas } from "./relatorio";

export function ImportarBeneficiados() {
  const contexto = useContextoBeneficiados();
  const importar = useImportarBeneficiados();
  const registrarLog = useRegistrarImportacao();

  const [arquivo, setArquivo] = useState<File | null>(null);
  const [parseResultado, setParseResultado] = useState<ParseResultado | null>(null);
  const [politica, setPolitica] = useState<PoliticaDuplicataBeneficiado>("ignorar");
  const [preview, setPreview] = useState<LinhaPreview<BeneficiadoPayload>[] | null>(null);
  const [resultado, setResultado] = useState<{ gravados: number } | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  function revalidar(parse: ParseResultado, pol: PoliticaDuplicataBeneficiado) {
    if (!contexto.data) return;
    setPreview(validarBeneficiados(parse, contexto.data, pol));
  }

  async function aoSelecionarArquivo(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f || !contexto.data) return;
    setArquivo(f);
    setResultado(null);
    setErro(null);
    const parse = await parseCsv(f);
    setParseResultado(parse);
    revalidar(parse, politica);
  }

  function aoMudarPolitica(nova: PoliticaDuplicataBeneficiado) {
    setPolitica(nova);
    if (parseResultado) revalidar(parseResultado, nova);
  }

  async function executar() {
    if (!preview || !arquivo) return;
    setErro(null);
    try {
      const validas = preview.filter(
        (l): l is LinhaPreview<BeneficiadoPayload> & { dados: BeneficiadoPayload } => l.dados !== null,
      );
      const linhas = dedupPorChave(validas.map((l) => l.dados), (d) => d.cpf);
      const gravados = await importar.mutateAsync(linhas);

      const c = contarPorStatus(preview);
      await registrarLog.mutateAsync({
        entidade: "beneficiados",
        arquivo_nome: arquivo.name,
        total_linhas: c.total,
        inseridos: c.inserir + c.avisos,
        atualizados: politica === "atualizar" ? c.atualizar : 0,
        erros: preview
          .filter((l) => l.status === "rejeitada")
          .map((l) => ({ linha: l.linha, mensagem: l.mensagens.join("; ") })),
      });
      setResultado({ gravados });
    } catch (e) {
      setErro(mensagemErro(e));
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-texto-2">
        Colunas: cpf_titular; cpf; nome; data_nascimento; parentesco; tipo. Modelo em{" "}
        <code>dados/exemplos_importacao/beneficiados.csv</code>.
      </p>

      <input type="file" accept=".csv" onChange={aoSelecionarArquivo} disabled={contexto.isLoading} />

      {preview && (
        <>
          <Contadores preview={preview} />

          <div className="flex items-center gap-2 text-sm">
            <span>CPF já cadastrado:</span>
            <Select value={politica} onValueChange={(v) => aoMudarPolitica(v as PoliticaDuplicataBeneficiado)}>
              <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ignorar">Ignorar existentes (padrão)</SelectItem>
                <SelectItem value="atualizar">Atualizar</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <PreviewTable
            preview={preview}
            resumoLinha={(l) => (l.dados ? `${l.dados.cpf} — ${l.dados.nome}` : l.bruta["nome"] || "—")}
          />

          <div className="flex items-center gap-3">
            <Button onClick={executar} disabled={importar.isPending}>
              {importar.isPending ? "Importando…" : "Importar válidas"}
            </Button>
            <Button variant="outline" onClick={() => baixarRejeitadas("beneficiados", preview)}>
              Baixar rejeitadas
            </Button>
          </div>

          {erro && <p className="text-sm text-estado-erro">{erro}</p>}
          {resultado && (
            <Card className="p-4 text-sm text-estado-sucesso">
              Importação concluída: {resultado.gravados} registro(s) gravado(s).
            </Card>
          )}
        </>
      )}
    </div>
  );
}
