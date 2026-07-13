import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ImportarEmpresas } from "./ImportarEmpresas";
import { ImportarEstabelecimentos } from "./ImportarEstabelecimentos";
import { ImportarTrabalhadores } from "./ImportarTrabalhadores";
import { ImportarBeneficiados } from "./ImportarBeneficiados";

/**
 * /importacao (specs/importacao.md) — exclusivo do Admin (RLS já garante).
 * As tabelas de referência (naturezas jurídicas, qualificações, CNAEs,
 * motivos de situação cadastral) já estão carregadas desde a Fase 0 — a aba
 * de setup do spec (§2) não é necessária nesta instalação.
 */
export function ImportacaoPage() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-3xl font-semibold text-texto-1">Importação de CSV</h1>
      <p className="text-sm text-texto-2">
        Ordem recomendada: Empresas → Estabelecimentos → Trabalhadores → Beneficiados. Linhas com
        erro bloqueante não impedem a importação das demais — o sistema oferece o CSV de
        rejeitadas para corrigir e reenviar.
      </p>

      <Tabs defaultValue="empresas">
        <TabsList>
          <TabsTrigger value="empresas">Empresas</TabsTrigger>
          <TabsTrigger value="estabelecimentos">Estabelecimentos</TabsTrigger>
          <TabsTrigger value="trabalhadores">Trabalhadores</TabsTrigger>
          <TabsTrigger value="beneficiados">Beneficiados</TabsTrigger>
        </TabsList>
        <TabsContent value="empresas"><ImportarEmpresas /></TabsContent>
        <TabsContent value="estabelecimentos"><ImportarEstabelecimentos /></TabsContent>
        <TabsContent value="trabalhadores"><ImportarTrabalhadores /></TabsContent>
        <TabsContent value="beneficiados"><ImportarBeneficiados /></TabsContent>
      </Tabs>
    </div>
  );
}
