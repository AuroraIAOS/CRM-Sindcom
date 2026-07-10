/** @type {import('tailwindcss').Config} */
// Tokens derivados de docs/design-tokens.md — não inventar paleta fora daqui.
// A camada semântica (background/primary/…) do shadcn é mapeada, via CSS vars
// em src/index.css, para a MESMA paleta SindCom (primary = realce #C62828).
import tailwindcssAnimate from "tailwindcss-animate";

export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // --- Tokens SindCom (design-tokens.md) ---
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

        // --- Camada semântica shadcn/ui (via CSS vars, mesma paleta) ---
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
      },
      fontFamily: {
        titulo: ['"Playfair Display"', "Georgia", "serif"],
        corpo: ["Lato", "sans-serif"],
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [tailwindcssAnimate],
};
