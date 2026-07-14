import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

/**
 * Leitura mínima de estabelecimentos — alimenta o seletor do form de vínculo
 * empregatício (features/trabalhadores). O CRUD completo de Empresas /
 * Estabelecimentos é escopo da subetapa 01.3.
 */
export function useEstabelecimentosSimples() {
  return useQuery({
    queryKey: ["estabelecimentos", "simples"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("estabelecimentos")
        .select("id, nome_fantasia, cnpj_completo, convencao_id, empresa:empresas(razao_social)")
        .order("nome_fantasia");
      if (error) throw error;
      return data as Array<{
        id: string;
        nome_fantasia: string | null;
        cnpj_completo: string | null;
        convencao_id: string | null;
        empresa: { razao_social: string } | null;
      }>;
    },
    staleTime: 60_000,
  });
}
