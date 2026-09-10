import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { AuthProvider } from "@/lib/auth";
import { router } from "@/app/router";
import { AtualizacaoDisponivel } from "@/app/AtualizacaoDisponivel";
import { Toaster } from "@/components/ui/sonner";
import { queryClient, persister, PERSIST_BUSTER, PERSIST_MAX_AGE } from "@/lib/queryClient";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        buster: PERSIST_BUSTER,
        maxAge: PERSIST_MAX_AGE,
        dehydrateOptions: {
          // Nunca persiste mutation nenhuma — ver lib/queryClient.ts sobre
          // por que "sem escrita offline" depende disso.
          shouldDehydrateMutation: () => false,
        },
      }}
    >
      <AuthProvider>
        <RouterProvider router={router} />
        {/* Achado da Subetapa 9.2: `<Toaster />` nunca tinha sido montado
            desde que o shadcn/sonner entrou na ETAPA 01 — ou seja, TODO
            `toast.*()` do app era invisível, inclusive o "Acesso negado" do
            RoleGate e os avisos de notificações. Montar aqui é o que faz as
            mensagens existirem de fato. */}
        <Toaster />
        <AtualizacaoDisponivel />
      </AuthProvider>
    </PersistQueryClientProvider>
  </React.StrictMode>,
);
