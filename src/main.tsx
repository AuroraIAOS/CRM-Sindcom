import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { AuthProvider } from "@/lib/auth";
import { router } from "@/app/router";
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
      </AuthProvider>
    </PersistQueryClientProvider>
  </React.StrictMode>,
);
