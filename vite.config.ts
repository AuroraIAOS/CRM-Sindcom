import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import path from "node:path";

// PWA: precache do shell; a página pública do QR (/guia/*) fica FORA do
// fallback do SPA offline — deve sempre buscar status em tempo real (rede).
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["assets/brand/logo_horizontal_colorido.png"],
      workbox: {
        navigateFallbackDenylist: [/^\/guia\//],
      },
      manifest: {
        name: "CRM Sindcom",
        short_name: "Sindcom",
        description: "CRM do Sindicato dos Empregados no Comércio de Passos e Região",
        lang: "pt-BR",
        theme_color: "#C62828",
        background_color: "#F5F5F5",
        display: "standalone",
        icons: [
          { src: "/icons/icon_pwa_vermelho_192x192.png", sizes: "192x192", type: "image/png" },
          { src: "/icons/icon_pwa_vermelho_512x512.png", sizes: "512x512", type: "image/png" },
          { src: "/icons/icon_pwa_vermelho_512x512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
