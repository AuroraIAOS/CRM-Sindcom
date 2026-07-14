import { cpfValido } from "@/lib/validators";
import { parseDataFlexivel } from "@/lib/formatters";
import { PARENTESCO_OPCOES } from "@/features/trabalhadores/schemas";
import {
  campo,
  construirMapaColunas,
  normalizarIdentificador,
  type LinhaPreview,
  type ParseResultado,
} from "./parsers";

type TipoBeneficiado = "direto" | "indireto" | "adicional";
type ParentescoBeneficiado = (typeof PARENTESCO_OPCOES)[number];

export type BeneficiadoPayload = {
  titular_id: string;
  cpf: string;
  nome: string;
  data_nascimento: string | null;
  parentesco: ParentescoBeneficiado | null;
  tipo: TipoBeneficiado;
};

/** parentesco virou ENUM fechado no banco (sql/08_parentesco_enum.sql) — texto
 *  livre da planilha precisa casar com um dos 7 valores ou vira null (não
 *  bloqueia a linha; aviso informativo no preview). */
const SINONIMOS_PARENTESCO: Record<string, ParentescoBeneficiado> = {
  pai: "progenitor/a",
  mae: "progenitor/a",
  mãe: "progenitor/a",
  progenitor: "progenitor/a",
  progenitora: "progenitor/a",
  "progenitor/a": "progenitor/a",
  irmao: "irmão/a",
  irmão: "irmão/a",
  irma: "irmão/a",
  irmã: "irmão/a",
  "irmão/a": "irmão/a",
  filho: "filho/a",
  filha: "filho/a",
  "filho/a": "filho/a",
  sogro: "sogro/a",
  sogra: "sogro/a",
  "sogro/a": "sogro/a",
  enteado: "enteado/a",
  enteada: "enteado/a",
  "enteado/a": "enteado/a",
  independente: "independentes",
  independentes: "independentes",
  conjuge: "cônjuge",
  cônjuge: "cônjuge",
  esposa: "cônjuge",
  esposo: "cônjuge",
  marido: "cônjuge",
  mulher: "cônjuge",
};

function normalizarParentesco(valor: string): { valor: ParentescoBeneficiado | null; naoReconhecido: boolean } {
  const bruto = valor.trim();
  if (!bruto) return { valor: null, naoReconhecido: false };
  const encontrado = SINONIMOS_PARENTESCO[bruto.toLowerCase()];
  return encontrado ? { valor: encontrado, naoReconhecido: false } : { valor: null, naoReconhecido: true };
}

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

    const { valor: parentesco, naoReconhecido: parentescoNaoReconhecido } = normalizarParentesco(
      campo(bruta, mapa, "parentesco"),
    );
    if (parentescoNaoReconhecido) {
      mensagens.push(
        `Parentesco "${campo(bruta, mapa, "parentesco")}" não reconhecido — gravado em branco (edite na ficha depois)`,
      );
    }

    const dados: BeneficiadoPayload = {
      titular_id: titular.id,
      cpf,
      nome,
      data_nascimento: parseDataFlexivel(campo(bruta, mapa, "data_nascimento")),
      parentesco,
      tipo: tipoRaw,
    };
    const status = existente ? "atualizar" : mensagens.length > 0 ? "aviso" : "inserir";
    return { linha: idx + 2, status, mensagens, dados, bruta };
  });
}
