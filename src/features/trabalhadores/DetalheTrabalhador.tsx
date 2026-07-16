import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Card } from "@/components/ui/card";
import { NivelBadge } from "@/components/shared/NivelBadge";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { mensagemErro } from "@/lib/mensagens";
import { useTrabalhador } from "./api";
import { DadosTab } from "./abas/DadosTab";
import { VinculosTab } from "./abas/VinculosTab";
import { BeneficiadosTab } from "./abas/BeneficiadosTab";
import { CartasTab } from "./abas/CartasTab";
import { FaturasTab } from "./abas/FaturasTab";
import { SolicitacoesTab } from "./abas/SolicitacoesTab";
import { AbaVazia } from "./abas/AbaVazia";

/**
 * Painel de detalhe do trabalhador — layout mestre-detalhe (Tarefa 02.1),
 * mesmo padrão same-page de `empresas/ListaEmpresasPage.tsx` (DetalheEmpresa).
 * Os 7 acordeões reaproveitam exatamente o conteúdo das abas já existentes em
 * `abas/*` — troca estrutural de Tabs para Accordion, lógica interna intacta.
 */
export function DetalheTrabalhador({ trabalhadorId }: { trabalhadorId: string }) {
  const trabalhador = useTrabalhador(trabalhadorId);

  if (trabalhador.isLoading) {
    return (
      <Card className="p-8 text-center text-sm text-texto-2">Carregando ficha…</Card>
    );
  }
  if (trabalhador.isError) {
    return (
      <Card className="p-8 text-center text-sm text-estado-erro">
        {mensagemErro(trabalhador.error)}
      </Card>
    );
  }
  if (!trabalhador.data) {
    return <Card className="p-8 text-center text-sm text-estado-erro">Trabalhador não encontrado.</Card>;
  }

  const t = trabalhador.data;

  return (
    <Card className="flex flex-col gap-4 p-6">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-xl font-semibold text-texto-1">{t.nome}</h2>
        {t.nivel && <NivelBadge nivel={t.nivel} />}
        <StatusBadge status={t.status_cadastro} />
      </div>

      <Accordion type="multiple" defaultValue={["dados"]} className="flex flex-col">
        <AccordionItem value="dados">
          <AccordionTrigger>Dados</AccordionTrigger>
          <AccordionContent>
            <DadosTab trabalhador={t} />
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="vinculos">
          <AccordionTrigger>Vínculos</AccordionTrigger>
          <AccordionContent>
            <VinculosTab trabalhadorId={t.id} />
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="beneficiados">
          <AccordionTrigger>Beneficiados</AccordionTrigger>
          <AccordionContent>
            <BeneficiadosTab titularId={t.id} />
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="cartas">
          <AccordionTrigger>Cartas</AccordionTrigger>
          <AccordionContent>
            <CartasTab trabalhadorId={t.id} />
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="faturas">
          <AccordionTrigger>Faturas</AccordionTrigger>
          <AccordionContent>
            <FaturasTab trabalhadorId={t.id} />
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="solicitacoes">
          <AccordionTrigger>Solicitações</AccordionTrigger>
          <AccordionContent>
            <SolicitacoesTab trabalhadorId={t.id} />
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="atendimentos">
          <AccordionTrigger>Atendimentos</AccordionTrigger>
          <AccordionContent>
            <AbaVazia mensagem="Atendimentos jurídicos: disponível a partir da Etapa 02." />
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </Card>
  );
}
