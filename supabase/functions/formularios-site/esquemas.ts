// Interpreta e valida o multipart de cada formulário. Puro (sem I/O): testado em tests/esquemas_test.ts.
// Nomes dos campos = contrato com web/src/_data/formularios.json; nomes das colunas = sql/35_formularios_site.sql.
import {
  interpretarBooleano, limparTexto, normalizarCnpj, normalizarTelefone, validarEmail, validarUf,
} from "./validadores.ts";

export type Formulario = "contato" | "curriculo" | "vaga" | "denuncia";
export const FORMULARIOS: Formulario[] = ["contato", "curriculo", "vaga", "denuncia"];

export type Erros = Record<string, string>;
export interface Lido {
  dados: Record<string, unknown>;
  erros: Erros;
}

type Tipo = "texto" | "longo" | "email" | "tel" | "cnpj" | "uf";
interface Campo { nome: string; tipo: Tipo; obrigatorio: boolean; max: number }

const c = (nome: string, tipo: Tipo, obrigatorio: boolean, max = 150): Campo => ({ nome, tipo, obrigatorio, max });

const CAMPOS: Record<Formulario, Campo[]> = {
  contato: [
    c("nome", "texto", true, 150), c("telefone", "tel", true), c("email", "email", true),
    c("cidade", "texto", true, 100), c("estado", "uf", true), c("assunto", "texto", true, 60),
    c("mensagem", "longo", true, 5000),
  ],
  curriculo: [
    c("nome", "texto", true, 150), c("telefone", "tel", true), c("email", "email", true),
    c("cidade", "texto", true, 100), c("area_interesse", "texto", true, 100),
  ],
  vaga: [
    c("empresa", "texto", true, 200), c("cnpj", "cnpj", true), c("contato_nome", "texto", true, 150),
    c("telefone", "tel", true), c("email", "email", true), c("cargo", "texto", true, 100),
    c("descricao", "longo", true, 3000), c("requisitos", "longo", false, 2000),
  ],
  denuncia: [
    c("empresa_denunciada", "texto", true, 160), c("cnpj", "cnpj", false), c("cidade", "texto", true, 80),
    c("endereco", "texto", false, 200), c("relato", "longo", true, 8000),
  ],
};

export const TIPOS_DENUNCIA = ["trabalhista", "direitos_humanos", "saude_seguranca", "outra"];
const URGENCIAS = ["baixa", "media", "alta"];
const AUTORIDADE = ["sim", "nao", "nao_sei"];

function texto(fd: FormData, nome: string): string {
  const v = fd.get(nome);
  return typeof v === "string" ? v : "";
}

function lerCampo(fd: FormData, campo: Campo, dados: Record<string, unknown>, erros: Erros) {
  const bruto = limparTexto(texto(fd, campo.nome), campo.tipo === "longo");
  if (!bruto) {
    if (campo.obrigatorio) erros[campo.nome] = "Preencha este campo.";
    else dados[campo.nome] = null;
    return;
  }
  if (bruto.length > campo.max) { erros[campo.nome] = `Use no máximo ${campo.max} caracteres.`; return; }
  switch (campo.tipo) {
    case "email":
      if (!validarEmail(bruto)) erros[campo.nome] = "Informe um e-mail válido.";
      else dados[campo.nome] = bruto.toLowerCase();
      break;
    case "tel": {
      const t = normalizarTelefone(bruto);
      if (!t) erros[campo.nome] = "Informe o telefone com DDD.";
      else dados[campo.nome] = t;
      break;
    }
    case "cnpj": {
      const n = normalizarCnpj(bruto);
      if (!n) erros[campo.nome] = "CNPJ inválido.";
      else dados[campo.nome] = n;
      break;
    }
    case "uf":
      if (!validarUf(bruto)) erros[campo.nome] = "Escolha um estado.";
      else dados[campo.nome] = bruto.toUpperCase();
      break;
    default:
      dados[campo.nome] = bruto;
  }
}

/** Lê e valida os campos de texto do formulário. Arquivos são tratados à parte (arquivos.ts). */
export function lerFormulario(form: Formulario, fd: FormData): Lido {
  const dados: Record<string, unknown> = {};
  const erros: Erros = {};
  for (const campo of CAMPOS[form]) lerCampo(fd, campo, dados, erros);

  if (!interpretarBooleano(texto(fd, "consentimento"))) erros.consentimento = "Marque esta opção para continuar.";
  dados.consentimento = true;

  if (form === "denuncia") {
    const tipos = fd.getAll("tipos").filter((v): v is string => typeof v === "string");
    if (!tipos.length || tipos.some((t) => !TIPOS_DENUNCIA.includes(t))) erros.tipos = "Escolha o tipo de irregularidade.";
    else dados.tipos = [...new Set(tipos)];

    const urg = texto(fd, "urgencia");
    if (!URGENCIAS.includes(urg)) erros.urgencia = "Escolha o grau de urgência."; else dados.urgencia = urg;
    const aut = texto(fd, "comunicada_autoridade");
    if (!AUTORIDADE.includes(aut)) erros.comunicada_autoridade = "Escolha uma opção."; else dados.comunicada_autoridade = aut;

    const identificar = texto(fd, "identificar");
    if (identificar !== "sim" && identificar !== "nao") erros.identificar = "Escolha uma opção.";
    dados.identificar = identificar === "sim";
    if (identificar === "sim") {
      lerCampo(fd, c("nome", "texto", true, 150), dados, erros);
      lerCampo(fd, c("telefone", "tel", false), dados, erros);
      lerCampo(fd, c("email", "email", false, 254), dados, erros);
    } else {
      // Anônima por construção: ignora qualquer dado de identificação que tenha chegado.
      dados.nome = null; dados.telefone = null; dados.email = null;
    }
  }
  return { dados, erros };
}
