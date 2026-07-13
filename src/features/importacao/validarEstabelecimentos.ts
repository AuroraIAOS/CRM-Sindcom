import { parseDataFlexivel } from "@/lib/formatters";
import {
  campo,
  construirMapaColunas,
  normalizarIdentificador,
  vazioParaNull,
  type LinhaPreview,
  type ParseResultado,
} from "./parsers";

export type EstabelecimentoPayload = {
  cnpj_basico: string;
  cnpj_ordem: string;
  cnpj_dv: string;
  matriz_filial: number | null;
  nome_fantasia: string | null;
  situacao_cadastral: string | null;
  data_situacao_cadastral: string | null;
  motivo_situacao: string | null;
  data_inicio_atividades: string | null;
  cnae_principal: string | null;
  tipo_logradouro: string | null;
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cep: string | null;
  uf: string;
  municipio_id: number | null;
  ddd_1: string | null;
  telefone_1: string | null;
  ddd_2: string | null;
  telefone_2: string | null;
  email: string | null;
  situacao_especial: string | null;
  data_situacao_especial: string | null;
};

export type ContextoEstabelecimentos = {
  empresasExistentes: Set<string>;
  cnaesValidos: Set<string>;
  motivosValidos: Set<string>;
  municipioIdPorCodigoRfb: Map<number, number>;
  cnpjCompletosExistentes: Set<string>;
};

const CAMPOS: Record<string, string[]> = {
  cnpj_basico: ["CNPJ basico"],
  cnpj_ordem: ["CNPJ ordem"],
  cnpj_dv: ["CNPJ DV"],
  matriz_filial: ["Matriz/filial", "Identificador"],
  nome_fantasia: ["Nome fantasia"],
  situacao_cadastral: ["Situacao cadastral"],
  data_situacao_cadastral: ["Data situacao cadastral"],
  motivo_situacao: ["Motivo situacao"],
  data_inicio_atividades: ["Data inicio atividades"],
  cnae_principal: ["CNAE principal"],
  tipo_logradouro: ["Tipo logradouro"],
  logradouro: ["Logradouro"],
  numero: ["Numero"],
  complemento: ["Complemento"],
  bairro: ["Bairro"],
  cep: ["CEP"],
  uf: ["UF"],
  municipio: ["Municipio (codigo TOM)", "Municipio", "Codigo TOM"],
  ddd_1: ["DDD 1"],
  telefone_1: ["Telefone 1"],
  ddd_2: ["DDD 2"],
  telefone_2: ["Telefone 2"],
  email: ["E-mail", "Email"],
  situacao_especial: ["Situacao especial"],
  data_situacao_especial: ["Data situacao especial"],
};

export function validarEstabelecimentos(
  parse: ParseResultado,
  ctx: ContextoEstabelecimentos,
): LinhaPreview<EstabelecimentoPayload>[] {
  const mapa = construirMapaColunas(parse.cabecalhos, CAMPOS);
  const vistosNoArquivo = new Set<string>();

  return parse.linhas.map((bruta, idx) => {
    const mensagens: string[] = [];

    const { valor: cnpj_basico, zeroComido } = normalizarIdentificador(
      campo(bruta, mapa, "cnpj_basico"),
      8,
    );
    const cnpj_ordem = campo(bruta, mapa, "cnpj_ordem").padStart(4, "0").slice(-4);
    const cnpj_dv = campo(bruta, mapa, "cnpj_dv").padStart(2, "0").slice(-2);
    if (zeroComido) mensagens.push("CNPJ básico com 7 dígitos — zero à esquerda restaurado");
    if (!cnpj_basico) mensagens.push("CNPJ básico é obrigatório");

    if (cnpj_basico && !ctx.empresasExistentes.has(cnpj_basico)) {
      mensagens.push(`Empresa ${cnpj_basico} não encontrada — importe empresas.csv primeiro`);
    }

    const motivo_situacao = vazioParaNull(campo(bruta, mapa, "motivo_situacao"));
    if (motivo_situacao && !ctx.motivosValidos.has(motivo_situacao)) {
      mensagens.push(`Motivo de situação "${motivo_situacao}" não existe na tabela de referência`);
    }

    const cnae_principal = vazioParaNull(campo(bruta, mapa, "cnae_principal"));
    if (cnae_principal && !ctx.cnaesValidos.has(cnae_principal)) {
      mensagens.push(`CNAE "${cnae_principal}" não existe na tabela de referência`);
    }

    const codigoTomRaw = campo(bruta, mapa, "municipio");
    let municipio_id: number | null = null;
    if (codigoTomRaw) {
      const codigoTom = Number(codigoTomRaw);
      municipio_id = ctx.municipioIdPorCodigoRfb.get(codigoTom) ?? null;
      if (municipio_id === null) {
        mensagens.push(`Município (código TOM ${codigoTomRaw}) não resolvido`);
      }
    }

    const situacao_cadastral = vazioParaNull(campo(bruta, mapa, "situacao_cadastral"));
    if (situacao_cadastral && situacao_cadastral !== "02") {
      mensagens.push(`Situação cadastral "${situacao_cadastral}" ≠ 02-Ativa`);
    }

    const uf = vazioParaNull(campo(bruta, mapa, "uf")) ?? "MG";
    if (uf !== "MG") mensagens.push(`UF "${uf}" ≠ MG`);

    const bloqueante =
      !cnpj_basico ||
      (cnpj_basico !== "" && !ctx.empresasExistentes.has(cnpj_basico)) ||
      (motivo_situacao !== null && !ctx.motivosValidos.has(motivo_situacao)) ||
      (cnae_principal !== null && !ctx.cnaesValidos.has(cnae_principal)) ||
      (codigoTomRaw !== "" && municipio_id === null);

    const cnpjCompleto = `${cnpj_basico}${cnpj_ordem}${cnpj_dv}`;

    if (bloqueante) {
      return { linha: idx + 2, status: "rejeitada", mensagens, dados: null, bruta };
    }

    if (vistosNoArquivo.has(cnpjCompleto)) {
      mensagens.push("CNPJ completo duplicado dentro do próprio arquivo — mantém a última ocorrência");
    }
    vistosNoArquivo.add(cnpjCompleto);

    const matrizFilialRaw = campo(bruta, mapa, "matriz_filial");
    const matriz_filial = matrizFilialRaw ? Number(matrizFilialRaw) : null;

    const dados: EstabelecimentoPayload = {
      cnpj_basico,
      cnpj_ordem,
      cnpj_dv,
      matriz_filial: matriz_filial && [1, 2].includes(matriz_filial) ? matriz_filial : null,
      nome_fantasia: vazioParaNull(campo(bruta, mapa, "nome_fantasia")),
      situacao_cadastral,
      data_situacao_cadastral: parseDataFlexivel(campo(bruta, mapa, "data_situacao_cadastral")),
      motivo_situacao,
      data_inicio_atividades: parseDataFlexivel(campo(bruta, mapa, "data_inicio_atividades")),
      cnae_principal,
      tipo_logradouro: vazioParaNull(campo(bruta, mapa, "tipo_logradouro")),
      logradouro: vazioParaNull(campo(bruta, mapa, "logradouro")),
      numero: vazioParaNull(campo(bruta, mapa, "numero")),
      complemento: vazioParaNull(campo(bruta, mapa, "complemento")),
      bairro: vazioParaNull(campo(bruta, mapa, "bairro")),
      cep: vazioParaNull(campo(bruta, mapa, "cep")),
      uf,
      municipio_id,
      ddd_1: vazioParaNull(campo(bruta, mapa, "ddd_1")),
      telefone_1: vazioParaNull(campo(bruta, mapa, "telefone_1")),
      ddd_2: vazioParaNull(campo(bruta, mapa, "ddd_2")),
      telefone_2: vazioParaNull(campo(bruta, mapa, "telefone_2")),
      email: vazioParaNull(campo(bruta, mapa, "email")),
      situacao_especial: vazioParaNull(campo(bruta, mapa, "situacao_especial")),
      data_situacao_especial: parseDataFlexivel(campo(bruta, mapa, "data_situacao_especial")),
    };

    const existente = ctx.cnpjCompletosExistentes.has(cnpjCompleto);
    const status = existente ? "atualizar" : mensagens.length > 0 ? "aviso" : "inserir";
    return { linha: idx + 2, status, mensagens, dados, bruta };
  });
}
