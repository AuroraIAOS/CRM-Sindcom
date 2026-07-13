import { cpfValido, emailValido, apenasDigitos } from "@/lib/validators";
import { parseDataFlexivel } from "@/lib/formatters";
import {
  campo,
  construirMapaColunas,
  normalizarCabecalho,
  normalizarIdentificador,
  paraBooleano,
  vazioParaNull,
  type LinhaPreview,
  type ParseResultado,
} from "./parsers";

/** Linha nova: payload completo, incluindo as flags que definem o nível. */
export type TrabalhadorPayloadCompleto = {
  cpf: string;
  nome: string;
  data_nascimento: string | null;
  telefone_whatsapp: string | null;
  email: string | null;
  municipio_id: number | null;
  recolhe_contribuicao_sindical: boolean;
  recolhe_mensalidade_convenio: boolean;
  forma_pagamento_preferida: "holerite" | "boleto_direto";
  status_cadastro: "aprovado";
  origem_cadastro: "csv";
  vinculo: {
    estabelecimento_id: string;
    funcao: string | null;
    data_admissao: string | null;
    salario_informado: number | null;
  } | null;
};

/**
 * Linha existente com política "atualizar dados de contato": o TYPE em si
 * não tem as 3 flags protegidas — estruturalmente impossível de sobrescrevê
 * -las por este caminho (regra inviolável do CLAUDE.md/importacao.md §5).
 */
export type TrabalhadorPayloadContato = {
  cpf: string;
  nome: string;
  data_nascimento: string | null;
  telefone_whatsapp: string | null;
  email: string | null;
  municipio_id: number | null;
};

export type TrabalhadorPreviewDados =
  | { tipo: "novo"; valores: TrabalhadorPayloadCompleto }
  | { tipo: "contato"; valores: TrabalhadorPayloadContato }
  | { tipo: "ignorada" };

export type ContextoTrabalhadores = {
  cpfsExistentes: Set<string>;
  municipioIdPorNomeNormalizado: Map<string, number>;
  municipioIdPorCodigoIbge: Map<number, number>;
  estabelecimentoIdPorCnpjCompleto: Map<string, string>;
};

export type PoliticaDuplicataTrabalhador = "ignorar" | "atualizar_contato";

const CAMPOS: Record<string, string[]> = {
  cpf: ["cpf"],
  nome: ["nome"],
  data_nascimento: ["data nascimento", "data_nascimento"],
  telefone_whatsapp: ["telefone whatsapp", "telefone_whatsapp", "telefone"],
  email: ["email", "e-mail"],
  municipio: ["municipio"],
  recolhe_contribuicao: ["recolhe contribuicao", "recolhe_contribuicao"],
  recolhe_mensalidade: ["recolhe mensalidade", "recolhe_mensalidade"],
  forma_pagamento: ["forma pagamento", "forma_pagamento"],
  cnpj_estabelecimento: ["cnpj estabelecimento", "cnpj_estabelecimento"],
  funcao: ["funcao"],
  data_admissao: ["data admissao", "data_admissao"],
  salario_informado: ["salario informado", "salario_informado"],
};

function paraNumero(v: string): number | null {
  const n = Number(v.replace(/\./g, "").replace(",", "."));
  return Number.isNaN(n) ? null : n;
}

export function validarTrabalhadores(
  parse: ParseResultado,
  ctx: ContextoTrabalhadores,
  politicaDuplicata: PoliticaDuplicataTrabalhador,
): LinhaPreview<TrabalhadorPreviewDados>[] {
  const mapa = construirMapaColunas(parse.cabecalhos, CAMPOS);
  const vistosNoArquivo = new Set<string>();

  return parse.linhas.map((bruta, idx) => {
    const mensagens: string[] = [];

    const { valor: cpf, zeroComido } = normalizarIdentificador(campo(bruta, mapa, "cpf"), 11);
    const nome = campo(bruta, mapa, "nome");
    if (!cpf) mensagens.push("CPF é obrigatório");
    else if (!cpfValido(cpf)) mensagens.push("CPF com dígito verificador inválido");
    if (!nome) mensagens.push("Nome é obrigatório");
    if (zeroComido) mensagens.push("CPF com 10 dígitos — zero à esquerda restaurado");

    const recolhe_contribuicao_sindical = paraBooleano(campo(bruta, mapa, "recolhe_contribuicao"), true);
    const recolhe_mensalidade_convenio = paraBooleano(campo(bruta, mapa, "recolhe_mensalidade"), false);
    if (recolhe_mensalidade_convenio && !recolhe_contribuicao_sindical) {
      mensagens.push("Mensalidade do convênio exige contribuição sindical (regra de negócio)");
    }

    const cpfValidoFormato = !!cpf && cpfValido(cpf);
    const bloqueante =
      !cpf ||
      !nome ||
      !cpfValidoFormato ||
      (recolhe_mensalidade_convenio && !recolhe_contribuicao_sindical);

    if (bloqueante) {
      return { linha: idx + 2, status: "rejeitada", mensagens, dados: null, bruta };
    }

    if (vistosNoArquivo.has(cpf)) {
      mensagens.push("CPF duplicado dentro do próprio arquivo — mantém a última ocorrência");
    }
    vistosNoArquivo.add(cpf);

    const telefone = vazioParaNull(campo(bruta, mapa, "telefone_whatsapp"));
    if (telefone) {
      const d = apenasDigitos(telefone);
      if (d.length < 10 || d.length > 11) mensagens.push("Telefone sem DDD ou com quantidade de dígitos incomum");
    }

    const email = vazioParaNull(campo(bruta, mapa, "email"));
    if (email && !emailValido(email)) mensagens.push("E-mail com formato inválido");

    const municipioRaw = campo(bruta, mapa, "municipio");
    let municipio_id: number | null = null;
    if (municipioRaw) {
      if (/^\d+$/.test(municipioRaw)) {
        municipio_id = ctx.municipioIdPorCodigoIbge.get(Number(municipioRaw)) ?? null;
      } else {
        municipio_id = ctx.municipioIdPorNomeNormalizado.get(normalizarCabecalho(municipioRaw)) ?? null;
      }
      if (municipio_id === null) mensagens.push(`Município "${municipioRaw}" não resolvido — ficará em branco`);
    }

    const formaPagamentoRaw = campo(bruta, mapa, "forma_pagamento").toLowerCase();
    const forma_pagamento_preferida: "holerite" | "boleto_direto" =
      formaPagamentoRaw === "boleto" || formaPagamentoRaw === "boleto_direto" ? "boleto_direto" : "holerite";

    // cnpj_estabelecimento: cria vínculo só em cadastro novo (specs/importacao.md §3.3).
    let vinculo: TrabalhadorPayloadCompleto["vinculo"] = null;
    const cnpjEstRaw = campo(bruta, mapa, "cnpj_estabelecimento");
    if (cnpjEstRaw) {
      const { valor: cnpjEst } = normalizarIdentificador(cnpjEstRaw, 14);
      const estabelecimento_id = ctx.estabelecimentoIdPorCnpjCompleto.get(cnpjEst);
      if (!estabelecimento_id) {
        mensagens.push(`Estabelecimento ${cnpjEst} não encontrado — vínculo não será criado`);
      } else {
        vinculo = {
          estabelecimento_id,
          funcao: vazioParaNull(campo(bruta, mapa, "funcao")),
          data_admissao: parseDataFlexivel(campo(bruta, mapa, "data_admissao")),
          salario_informado: (() => {
            const raw = campo(bruta, mapa, "salario_informado");
            return raw ? paraNumero(raw) : null;
          })(),
        };
      }
    }

    const existente = ctx.cpfsExistentes.has(cpf);

    if (existente) {
      if (politicaDuplicata === "ignorar") {
        mensagens.push("CPF já cadastrado — ignorado (política atual: ignorar existentes)");
        return { linha: idx + 2, status: "atualizar", mensagens, dados: { tipo: "ignorada" }, bruta };
      }
      mensagens.push("CPF já cadastrado — apenas dados de contato serão atualizados (nível não muda)");
      const valoresContato: TrabalhadorPayloadContato = {
        cpf,
        nome,
        data_nascimento: parseDataFlexivel(campo(bruta, mapa, "data_nascimento")),
        telefone_whatsapp: telefone,
        email,
        municipio_id,
      };
      return {
        linha: idx + 2,
        status: "atualizar",
        mensagens,
        dados: { tipo: "contato", valores: valoresContato },
        bruta,
      };
    }

    const valoresNovo: TrabalhadorPayloadCompleto = {
      cpf,
      nome,
      data_nascimento: parseDataFlexivel(campo(bruta, mapa, "data_nascimento")),
      telefone_whatsapp: telefone,
      email,
      municipio_id,
      recolhe_contribuicao_sindical,
      recolhe_mensalidade_convenio,
      forma_pagamento_preferida,
      status_cadastro: "aprovado",
      origem_cadastro: "csv",
      vinculo,
    };
    const status = mensagens.length > 0 ? "aviso" : "inserir";
    return { linha: idx + 2, status, mensagens, dados: { tipo: "novo", valores: valoresNovo }, bruta };
  });
}
