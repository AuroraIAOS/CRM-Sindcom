import { cpfValido } from "@/lib/validators";
import { parseDataFlexivel } from "@/lib/formatters";
import {
  campo,
  construirMapaColunas,
  normalizarIdentificador,
  vazioParaNull,
  type LinhaPreview,
  type ParseResultado,
} from "./parsers";

type TipoBeneficiado = "direto" | "indireto" | "adicional";

export type BeneficiadoPayload = {
  titular_id: string;
  cpf: string;
  nome: string;
  data_nascimento: string | null;
  parentesco: string | null;
  tipo: TipoBeneficiado;
};

export type ContextoBeneficiados = {
  /** cpf do titular → { id, ouro } */
  titularPorCpf: Map<string, { id: string; ouro: boolean }>;
  cpfsExistentes: Set<string>;
};

export type PoliticaDuplicataBeneficiado = "ignorar" | "atualizar";

const CAMPOS: Record<string, string[]> = {
  cpf_titular: ["cpf titular", "cpf_titular"],
  cpf: ["cpf"],
  nome: ["nome"],
  data_nascimento: ["data nascimento", "data_nascimento"],
  parentesco: ["parentesco"],
  tipo: ["tipo"],
};

const TIPOS_VALIDOS: TipoBeneficiado[] = ["direto", "indireto", "adicional"];

export function validarBeneficiados(
  parse: ParseResultado,
  ctx: ContextoBeneficiados,
  politicaDuplicata: PoliticaDuplicataBeneficiado,
): LinhaPreview<BeneficiadoPayload>[] {
  const mapa = construirMapaColunas(parse.cabecalhos, CAMPOS);
  const vistosNoArquivo = new Set<string>();

  return parse.linhas.map((bruta, idx) => {
    const mensagens: string[] = [];

    const { valor: cpfTitular } = normalizarIdentificador(campo(bruta, mapa, "cpf_titular"), 11);
    const { valor: cpf, zeroComido } = normalizarIdentificador(campo(bruta, mapa, "cpf"), 11);
    const nome = campo(bruta, mapa, "nome");
    const tipoRaw = campo(bruta, mapa, "tipo").toLowerCase() as TipoBeneficiado;

    if (!cpfTitular) mensagens.push("CPF do titular é obrigatório");
    const titular = ctx.titularPorCpf.get(cpfTitular);
    if (cpfTitular && !titular) mensagens.push(`Titular com CPF ${cpfTitular} não encontrado`);

    if (!cpf) mensagens.push("CPF é obrigatório");
    else if (!cpfValido(cpf)) mensagens.push("CPF com dígito verificador inválido");
    if (zeroComido) mensagens.push("CPF com 10 dígitos — zero à esquerda restaurado");

    if (cpf && cpfTitular && cpf === cpfTitular) {
      mensagens.push("O beneficiado não pode ser a mesma pessoa que o titular (mesmo CPF)");
    }

    if (!nome) mensagens.push("Nome é obrigatório");
    if (!TIPOS_VALIDOS.includes(tipoRaw)) mensagens.push('Tipo deve ser "direto", "indireto" ou "adicional"');

    if (titular && !titular.ouro) {
      mensagens.push("Titular ainda não é Ouro — beneficiado só terá cobertura quando o titular subir de nível");
    }

    const cpfValidoFormato = !!cpf && cpfValido(cpf);
    const bloqueante =
      !cpfTitular ||
      !titular ||
      !cpf ||
      !cpfValidoFormato ||
      cpf === cpfTitular ||
      !nome ||
      !TIPOS_VALIDOS.includes(tipoRaw);

    if (bloqueante) {
      return { linha: idx + 2, status: "rejeitada", mensagens, dados: null, bruta };
    }

    if (vistosNoArquivo.has(cpf)) {
      mensagens.push("CPF duplicado dentro do próprio arquivo — mantém a última ocorrência");
    }
    vistosNoArquivo.add(cpf);

    const existente = ctx.cpfsExistentes.has(cpf);
    if (existente && politicaDuplicata === "ignorar") {
      mensagens.push("CPF já cadastrado — ignorado (política atual: ignorar existentes)");
      return { linha: idx + 2, status: "atualizar", mensagens, dados: null, bruta };
    }

    const dados: BeneficiadoPayload = {
      titular_id: titular.id,
      cpf,
      nome,
      data_nascimento: parseDataFlexivel(campo(bruta, mapa, "data_nascimento")),
      parentesco: vazioParaNull(campo(bruta, mapa, "parentesco")),
      tipo: tipoRaw,
    };
    const status = existente ? "atualizar" : mensagens.length > 0 ? "aviso" : "inserir";
    return { linha: idx + 2, status, mensagens, dados, bruta };
  });
}
