import { useParams } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { NivelBadge } from "@/components/shared/NivelBadge";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { mensagemErro } from "@/lib/mensagens";
import { useTrabalhador } from "./api";
import { DadosTab } from "./abas/DadosTab";
import { VinculosTab } from "./abas/VinculosTab";
import { BeneficiadosTab } from "./abas/BeneficiadosTab";
import { CartasTab } from "./abas/CartasTab";
import { FaturasTab } from "./abas/FaturasTab";
import { AbaVazia } from "./abas/AbaVazia";

/**
 * Ficha do trabalhador (frontend.md §2.2). Somente leitura na Fase 1.1 — CRUD
 * de vínculos/beneficiados/cartas chega na subetapa 01.2; Solicitações e
 * Atendimentos ficam sinalizados como vazios até a Etapa 02.
 */
export function FichaTrabalhadorPage() {
  const { id } = useParams();
  const trabalhador = useTrabalhador(id);

  if (trabalhador.isLoading) {
    return <p className="text-texto-2">Carregando ficha…</p>;
  }
  if (trabalhador.isError) {
    return <p className="text-estado-erro">{mensagemErro(trabalhador.error)}</p>;
  }
  if (!trabalhador.data) {
    return <p className="text-estado-erro">Trabalhador não encontrado.</p>;
  }

  const t = trabalhador.data;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-3xl font-semibold text-texto-1">{t.nome}</h1>
        {t.nivel && <NivelBadge nivel={t.nivel} />}
        <StatusBadge status={t.status_cadastro} />
      </div>

      <Tabs defaultValue="dados">
        <TabsList className="h-auto flex-wrap">
          <TabsTrigger value="dados">Dados</TabsTrigger>
          <TabsTrigger value="vinculos">Vínculos</TabsTrigger>
          <TabsTrigger value="beneficiados">Beneficiados</TabsTrigger>
          <TabsTrigger value="cartas">Cartas</TabsTrigger>
          <TabsTrigger value="faturas">Faturas</TabsTrigger>
          <TabsTrigger value="solicitacoes">Solicitações</TabsTrigger>
          <TabsTrigger value="atendimentos">Atendimentos</TabsTrigger>
        </TabsList>

        <TabsContent value="dados">
          <DadosTab trabalhador={t} />
        </TabsContent>
        <TabsContent value="vinculos">
          <VinculosTab trabalhadorId={t.id} />
        </TabsContent>
        <TabsContent value="beneficiados">
          <BeneficiadosTab titularId={t.id} />
        </TabsContent>
        <TabsContent value="cartas">
          <CartasTab trabalhadorId={t.id} />
        </TabsContent>
        <TabsContent value="faturas">
          <FaturasTab trabalhadorId={t.id} />
        </TabsContent>
        <TabsContent value="solicitacoes">
          <AbaVazia mensagem="Solicitações de serviço: disponível a partir da Etapa 02 (convênio + motor financeiro)." />
        </TabsContent>
        <TabsContent value="atendimentos">
          <AbaVazia mensagem="Atendimentos jurídicos: disponível a partir da Etapa 02." />
        </TabsContent>
      </Tabs>
    </div>
  );
}
