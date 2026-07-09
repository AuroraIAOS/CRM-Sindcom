/** @type {import('tailwindcss').Config} */
// Tokens derivados de docs/design-tokens.md — não inventar paleta fora daqui.
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        texto: { 1: "#424242", 2: "#565656" },
        fundo: { 1: "#F5F5F5", 2: "#EFEEE7" },
        realce: "#C62828",
        // Níveis de proteção (design-tokens §7)
        nivel: {
          "bronze-bg": "#EFE3D9", "bronze-fg": "#7A4F2A",
          "prata-bg": "#E8E8E8", "prata-fg": "#5A5A5A",
          "ouro-bg": "#F3E9C6", "ouro-fg": "#8A6D1D",
        },
        // Estados semânticos (design-tokens §7)
        estado: {
          sucesso: "#2E7D32",
          alerta: "#B98700",
          erro: "#C62828",
          neutro: "#565656",
        },
      },
      fontFamily: {
        titulo: ['"Playfair Display"', "Georgia", "serif"],
        corpo: ["Lato", "sans-serif"],
      },
      borderRadius: { sm: "4px", md: "8px", lg: "16px" },
    },
  },
  plugins: [],
};
