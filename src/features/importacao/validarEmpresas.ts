import {
  campo,
  construirMapaColunas,
  normalizarIdentificador,
  vazioParaNull,
  type LinhaPreview,
  type ParseResultado,
} from "./parsers";

export type EmpresaPayload = {
  cnpj_basico: string;
  razao_social: string;
  natureza_juridica: string | null;
  qualificacao_responsavel: string | null;
  capital_social: number | null;
  porte: string | null;
};

export type ContextoEmpresas = {
  naturezasValidas: Set<string>;
  qualificacoesValidas: Set<string>;
  cnpjBasicosExistentes: Set<string>;
};

const CAMPOS: Record<string, string[]> = {
  cnpj_basico: ["CNPJ basico", "CNPJ"],
  razao_social: ["Razao social"],
  natureza_juridica: ["Natureza juridica"],
  qualificacao_responsavel: ["Qualificacao do responsavel"],
  capital: ["Capital"],
  porte: ["Porte"],
};

function paraNumero(v: string): number | null {
  const n = Number(v.replace(/\./g, "").replace(",", "."));
  return Number.isNaN(n) ? null : n;
}

export function validarEmpresas(
  parse: ParseResultado,
  ctx: ContextoEmpresas,
): LinhaPreview<EmpresaPayload>[] {
  const mapa = construirMapaColunas(parse.cabecalhos, CAMPOS);
  const vistosNoArquivo = new Set<string>();

  return parse.linhas.map((bruta, idx) => {
    const mensagens: string[] = [];

    const { valor: cnpj_basico, zeroComido } = normalizarIdentificador(
      campo(bruta, mapa, "cnpj_basico"),
      8,
    );
    const razao_social = campo(bruta, mapa, "razao_social");
    if (!cnpj_basico) mensagens.push("CNPJ básico é obrigatório");
    if (!razao_social) mensagens.push("Razão social é obrigatória");
    if (zeroComido) mensagens.push("CNPJ básico com 7 dígitos — zero à esquerda restaurado");

    const natureza_juridica = vazioParaNull(campo(bruta, mapa, "natureza_juridica"));
    if (natureza_juridica && !ctx.naturezasValidas.has(natureza_juridica)) {
      mensagens.push(`Natureza jurídica "${natureza_juridica}" não existe na tabela de referência`);
    }

    const qualificacao_responsavel = vazioParaNull(campo(bruta, mapa, "qualificacao_responsavel"));
    if (qualificacao_responsavel && !ctx.qualificacoesValidas.has(qualificacao_responsavel)) {
      mensagens.push(`Qualificação "${qualificacao_responsavel}" não existe na tabela de referência`);
    }

    const capitalRaw = campo(bruta, mapa, "capital");
    const capital_social = capitalRaw ? paraNumero(capitalRaw) : null;
    if (capitalRaw && capital_social === null) mensagens.push("Capital social inválido");

    const bloqueante =
      !cnpj_basico ||
      !razao_social ||
      (natureza_juridica !== null && !ctx.naturezasValidas.has(natureza_juridica)) ||
      (qualificacao_responsavel !== null && !ctx.qualificacoesValidas.has(qualificacao_responsavel)) ||
      (!!capitalRaw && capital_social === null);

    if (bloqueante) {
      return { linha: idx + 2, status: "rejeitada", mensagens, dados: null, bruta };
    }

    if (vistosNoArquivo.has(cnpj_basico)) {
      mensagens.push("CNPJ básico duplicado dentro do próprio arquivo — mantém a última ocorrência");
    }
    vistosNoArquivo.add(cnpj_basico);

    const existente = ctx.cnpjBasicosExistentes.has(cnpj_basico);
    const dados: EmpresaPayload = {
      cnpj_basico,
      razao_social,
      natureza_juridica,
      qualificacao_responsavel,
      capital_social,
      porte: vazioParaNull(campo(bruta, mapa, "porte")),
    };

    const status = existente ? "atualizar" : mensagens.length > 0 ? "aviso" : "inserir";
    return { linha: idx + 2, status, mensagens, dados, bruta };
  });
}
