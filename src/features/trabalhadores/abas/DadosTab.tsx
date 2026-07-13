import { formatarCpf, formatarDataBR } from "@/lib/formatters";
import type { TrabalhadorFicha } from "../api";

const ROTULO_ORIGEM = {
  formulario_site: "Formulário do site",
  manual: "Cadastro manual",
  csv: "Importação CSV",
  agente_whatsapp: "Agente WhatsApp",
} as const;

const ROTULO_PAGAMENTO = { holerite: "Holerite", boleto_direto: "Boleto direto" } as const;

function Campo({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs uppercase tracking-wide text-texto-2">{rotulo}</dt>
      <dd className="text-sm text-texto-1">{valor}</dd>
    </div>
  );
}

/**
 * Somente leitura (Fase 1.1). O nível é coluna computada no banco a partir das
 * duas flags abaixo — mudar de nível é ato deliberado (carta de oposição,
 * reclassificação da CCT, aprovação do convênio), não edição de campo aqui.
 */
export function DadosTab({ trabalhador: t }: { trabalhador: TrabalhadorFicha }) {
  return (
    <div className="flex flex-col gap-6 rounded-lg border bg-card p-6">
      <dl className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
        <Campo rotulo="CPF" valor={formatarCpf(t.cpf)} />
        <Campo rotulo="Data de nascimento" valor={formatarDataBR(t.data_nascimento) || "—"} />
        <Campo rotulo="Telefone (WhatsApp)" valor={t.telefone_whatsapp || "—"} />
        <Campo rotulo="E-mail" valor={t.email || "—"} />
        <Campo
          rotulo="Município"
          valor={t.municipio ? `${t.municipio.nome}/${t.municipio.uf}` : "—"}
        />
        <Campo rotulo="Data de filiação" valor={formatarDataBR(t.data_filiacao) || "—"} />
        <Campo
          rotulo="Forma de pagamento preferida"
          valor={ROTULO_PAGAMENTO[t.forma_pagamento_preferida]}
        />
        <Campo rotulo="Origem do cadastro" valor={ROTULO_ORIGEM[t.origem_cadastro]} />
      </dl>

      <div className="border-t border-black/10 pt-4">
        <h2 className="mb-2 text-sm font-bold text-texto-1">Flags que determinam o nível</h2>
        <p className="mb-3 text-xs text-texto-2">
          O nível (Bronze/Prata/Ouro) é calculado automaticamente pelo banco a partir destas duas
          flags — não é um campo editável nesta ficha.
        </p>
        <dl className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
          <Campo
            rotulo="Recolhe contribuição sindical"
            valor={t.recolhe_contribuicao_sindical ? "Sim" : "Não"}
          />
          <Campo
            rotulo="Recolhe mensalidade do convênio"
            valor={t.recolhe_mensalidade_convenio ? "Sim" : "Não"}
          />
        </dl>
      </div>

      {t.observacoes && (
        <div className="border-t border-black/10 pt-4">
          <h2 className="mb-2 text-sm font-bold text-texto-1">Observações</h2>
          <p className="text-sm text-texto-2">{t.observacoes}</p>
        </div>
      )}
    </div>
  );
}
