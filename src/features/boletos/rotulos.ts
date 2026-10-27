export type TipoBoleto = "taf" | "ca" | "cn" | "pamed";
export type EstadoBoleto = "aguardando_dados" | "fazer" | "enviar" | "enviado" | "pago" | "cancelado";

export const TIPOS_BOLETO: TipoBoleto[] = ["taf", "ca", "cn", "pamed"];

/** `campo` = o que a empresa informa (texto da página pública). `calculado` = o banco calcula o valor. */
export const ROTULO_TIPO: Record<TipoBoleto, { sigla: string; nome: string; campo: string; calculado: boolean }> = {
  taf: {
    sigla: "TAF",
    nome: "Boleto TAF",
    campo: "trabalhadores que irão trabalhar no feriado",
    calculado: true,
  },
  ca: { sigla: "CA", nome: "Boleto CA", campo: "não-opositores (anual)", calculado: false },
  cn: { sigla: "CN", nome: "Boleto CN", campo: "não-opositores (mensal)", calculado: false },
  pamed: { sigla: "PAMED", nome: "Boleto PAMED", campo: "total de trabalhadores", calculado: true },
};

export type TomTag = "neutro" | "alerta" | "erro" | "ok" | "info";

export const ROTULO_ESTADO: Record<EstadoBoleto, string> = {
  aguardando_dados: "Aguardando dados",
  fazer: "Fazer boleto",
  enviar: "Enviar boleto",
  enviado: "Enviado",
  pago: "Pago",
  cancelado: "Cancelado",
};

/** Etiqueta do boleto: o estado, ou `atrasado` (derivado na view). */
export const TAG: Record<string, { rotulo: string; tom: TomTag }> = {
  aguardando_dados: { rotulo: "Aguardando dados", tom: "neutro" },
  fazer: { rotulo: "Fazer", tom: "info" },
  enviar: { rotulo: "Enviar", tom: "info" },
  enviado: { rotulo: "Enviado", tom: "alerta" },
  atrasado: { rotulo: "Atrasado", tom: "erro" },
  pago: { rotulo: "Pago", tom: "ok" },
  cancelado: { rotulo: "Cancelado", tom: "neutro" },
};

export function rotuloTipo(tipo: string | null | undefined): string {
  return tipo && tipo in ROTULO_TIPO ? ROTULO_TIPO[tipo as TipoBoleto].sigla : (tipo ?? "—");
}

/** Estado seguinte e anterior (a máquina é de um passo por vez, como no trigger). */
export const PROXIMO_ESTADO: Partial<Record<EstadoBoleto, EstadoBoleto>> = {
  fazer: "enviar",
  enviar: "enviado",
  enviado: "pago",
};
export const ESTADO_ANTERIOR: Partial<Record<EstadoBoleto, EstadoBoleto>> = {
  enviar: "fazer",
  enviado: "enviar",
  pago: "enviado",
};
