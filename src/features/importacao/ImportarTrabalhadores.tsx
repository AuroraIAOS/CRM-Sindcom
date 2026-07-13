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
  temAvisoZeroComido,
  type LinhaPreview,
  type ParseResultado,
} from "./parsers";
import {
  validarTrabalhadores,
  type PoliticaDuplicataTrabalhador,
  type TrabalhadorPreviewDados,
} from "./validarTrabalhadores";
import { useContextoTrabalhadores, useImportarTrabalhadores, useRegistrarImportacao } from "./api";
import { PreviewTable } from "./PreviewTable";
import { Contadores } from "./Contadores";
import { baixarRejeitadas } from "./relatorio";

export function ImportarTrabalhadores() {
  const contexto = useContextoTrabalhadores();
  const importar = useImportarTrabalhadores();
  const registrarLog = useRegistrarImportacao();

  const [arquivo, setArquivo] = useState<File | null>(null);
  const [parseResultado, setParseResultado] = useState<ParseResultado | null>(null);
  const [politica, setPolitica] = useState<PoliticaDuplicataTrabalhador>("ignorar");
  const [preview, setPreview] = useState<LinhaPreview<TrabalhadorPreviewDados>[] | null>(null);
  const [resultado, setResultado] = useState<{ inseridos: number; atualizados: number } | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  function revalidar(parse: ParseResultado, pol: PoliticaDuplicataTrabalhador) {
    if (!contexto.data) return;
    setPreview(validarTrabalhadores(parse, contexto.data, pol));
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

  function aoMudarPolitica(nova: PoliticaDuplicataTrabalhador) {
    setPolitica(nova);
    if (parseResultado) revalidar(parseResultado, nova);
  }

  async function executar() {
    if (!preview || !arquivo) return;
    setErro(null);
    try {
      const validas = preview
        .map((l) => l.dados)
        .filter(
          (d): d is Exclude<TrabalhadorPreviewDados, { tipo: "ignorada" }> =>
            d !== null && d.tipo !== "ignorada",
        );
      const linhas = dedupPorChave(validas, (d) => d.valores.cpf);
      const { inseridos, atualizados } = await importar.mutateAsync(linhas);

      const c = contarPorStatus(preview);
      await registrarLog.mutateAsync({
        entidade: "trabalhadores",
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
        Colunas: cpf; nome; data_nascimento; telefone_whatsapp; email; municipio;
        recolhe_contribuicao; recolhe_mensalidade; forma_pagamento; cnpj_estabelecimento; funcao;
        data_admissao; salario_informado. Modelo em{" "}
        <code>dados/exemplos_importacao/trabalhadores.csv</code>.
      </p>
      <p className="rounded-md bg-estado-alerta/10 p-3 text-sm text-estado-alerta">
        Regra inviolável: para CPFs já cadastrados, a importação <strong>nunca</strong> altera
        contribuição, mensalidade ou forma de pagamento — só dados de contato, e apenas se você
        escolher essa política abaixo.
      </p>

      <input type="file" accept=".csv" onChange={aoSelecionarArquivo} disabled={contexto.isLoading} />

      {preview && (
        <>
          {temAvisoZeroComido(preview) && (
            <p className="rounded-md bg-estado-alerta/10 p-3 text-sm text-estado-alerta">
              Vários CPFs parecem ter perdido o zero à esquerda — já restauramos automaticamente;
              confira as linhas marcadas.
            </p>
          )}

          <Contadores preview={preview} />

          <div className="flex items-center gap-2 text-sm">
            <span>CPF já cadastrado:</span>
            <Select value={politica} onValueChange={(v) => aoMudarPolitica(v as PoliticaDuplicataTrabalhador)}>
              <SelectTrigger className="w-64"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ignorar">Ignorar existentes (padrão)</SelectItem>
                <SelectItem value="atualizar_contato">Atualizar dados de contato</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <PreviewTable
            preview={preview}
            resumoLinha={(l) => {
              if (l.dados?.tipo === "novo") return `${l.dados.valores.cpf} — ${l.dados.valores.nome}`;
              if (l.dados?.tipo === "contato") return `${l.dados.valores.cpf} — ${l.dados.valores.nome}`;
              return l.bruta["nome"] || l.bruta["cpf"] || "—";
            }}
          />

          <div className="flex items-center gap-3">
            <Button onClick={executar} disabled={importar.isPending}>
              {importar.isPending ? "Importando…" : "Importar válidas"}
            </Button>
            <Button variant="outline" onClick={() => baixarRejeitadas("trabalhadores", preview)}>
              Baixar rejeitadas
            </Button>
          </div>

          {erro && <p className="text-sm text-estado-erro">{erro}</p>}
          {resultado && (
            <Card className="p-4 text-sm text-estado-sucesso">
              Importação concluída: {resultado.inseridos} inserido(s), {resultado.atualizados} atualizado(s)
              (só contato — nível nunca muda por importação).
            </Card>
          )}
        </>
      )}
    </div>
  );
}
