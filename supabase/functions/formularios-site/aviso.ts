// Monta os e-mails entregues às caixas institucionais. Puro. A denúncia gera SÓ AVISO: nunca o relato
// nem dado de quem denunciou (decisão do Maxwell, 2026-10-29; Termos, seção 6).
import type { Formulario } from "./esquemas.ts";

export interface Mensagem {
  para: string;
  responderPara?: string;
  assunto: string;
  texto: string;
}

const ROTULOS: Record<string, string> = {
  nome: "Nome", telefone: "Telefone", email: "E-mail", cidade: "Cidade", estado: "Estado", assunto: "Assunto",
  mensagem: "Mensagem", area_interesse: "Área de interesse", empresa: "Empresa", cnpj: "CNPJ",
  contato_nome: "Responsável", cargo: "Cargo", descricao: "Descrição", requisitos: "Requisitos",
};

const linhas = (dados: Record<string, unknown>, ordem: string[]) =>
  ordem.filter((k) => dados[k]).map((k) => `${ROTULOS[k] ?? k}: ${dados[k]}`).join("\n");

export interface Destinos { contato: string; juridico: string }

export function montarMensagem(
  form: Formulario,
  dados: Record<string, unknown>,
  extra: { protocolo?: string; anexos: number; destinos: Destinos; quando?: Date },
): Mensagem {
  const quando = (extra.quando ?? new Date()).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
  const rodape = `\n\nRecebido pelo site em ${quando}. Anexos: ${extra.anexos}.`;

  switch (form) {
    case "contato":
      return {
        para: extra.destinos.contato, responderPara: dados.email as string,
        assunto: `[Site] Contato: ${dados.assunto}`,
        texto: linhas(dados, ["nome", "telefone", "email", "cidade", "estado", "assunto"]) + `\n\n${dados.mensagem}` + rodape,
      };
    case "curriculo":
      return {
        para: extra.destinos.contato, responderPara: dados.email as string,
        assunto: `[Site] Currículo: ${dados.nome}`,
        texto: linhas(dados, ["nome", "telefone", "email", "cidade", "area_interesse"]) + rodape,
      };
    case "vaga":
      return {
        para: extra.destinos.contato, responderPara: dados.email as string,
        assunto: `[Site] Vaga para moderação: ${dados.cargo} (${dados.empresa})`,
        texto: linhas(dados, ["empresa", "cnpj", "contato_nome", "telefone", "email", "cargo", "descricao", "requisitos"]) +
          "\n\nA vaga só será divulgada depois de aprovada no CRM." + rodape,
      };
    case "denuncia": {
      const tipos = (dados.tipos as string[]).join(", ");
      return {
        para: extra.destinos.juridico,
        assunto: `[Site] Nova denúncia ${extra.protocolo} (urgência ${dados.urgencia})`,
        texto: `Protocolo: ${extra.protocolo}\nUrgência: ${dados.urgencia}\nTipos: ${tipos}\n\n` +
          "O relato e os demais dados estão no CRM (aba Jurídico), com acesso restrito." + rodape,
      };
    }
  }
}
