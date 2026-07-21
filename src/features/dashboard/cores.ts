/**
 * Paleta dos gráficos e do mapa — derivada de `docs/design-tokens.md`.
 * Nada de cor inventada aqui: cada valor tem origem declarada no token.
 */

/** Níveis de proteção (design-tokens §7) — usa o tom de TEXTO de cada nível,
 *  que tem contraste suficiente para linha e preenchimento de gráfico (os
 *  tons `-bg` são fundos de badge, claros demais para série). */
export const COR_NIVEL = {
  bronze: "#7A4F2A",
  prata: "#5A5A5A",
  ouro: "#8A6D1D",
} as const;

/** Estados semânticos (design-tokens §7). */
export const COR_ESTADO = {
  sucesso: "#2E7D32",
  alerta: "#B98700",
  erro: "#C62828",
  neutro: "#565656",
} as const;

/** Paleta oficial (design-tokens §2). */
export const COR_MARCA = {
  realce: "#C62828",
  texto1: "#424242",
  texto2: "#565656",
  fundo1: "#F5F5F5",
  fundo2: "#EFEEE7",
  branco: "#FFFFFF",
} as const;

/**
 * Escala do mapa coroplético: 5 faixas do creme (`fundo-02`) ao vermelho
 * institucional (`realce`), como manda dashboard.md §2/M1. Os 3 tons
 * intermediários são interpolações entre esses dois extremos — não são cores
 * novas, são o caminho entre duas cores da identidade.
 */
export const ESCALA_MAPA = ["#EFEEE7", "#E7C9BE", "#DFA495", "#D6796B", "#C62828"] as const;

/** Cinza para município sem nenhum registro — ausência de dado não é
 *  intensidade baixa, é ausência, e precisa se distinguir visualmente. */
export const COR_MAPA_SEM_DADO = "#FFFFFF";

/** Eixos e grades — `texto-02` sem competir com as séries. */
export const COR_EIXO = "#565656";
export const COR_GRADE = "#E0E0E0";
