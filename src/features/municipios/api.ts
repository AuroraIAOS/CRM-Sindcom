import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

/**
 * Municípios da base territorial (29 flagados em `municipios.base_territorial`,
 * sql/02_seed_municipios.sql). Alimenta filtros e selects em Trabalhadores,
 * Empresas/Estabelecimentos e o mapa do dashboard.
 */
export function useMunicipiosBase() {
  return useQuery({
    queryKey: ["municipios", "base-territorial"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("municipios")
        .select("id, nome, uf")
        .eq("base_territorial", true)
        .order("nome");
      if (error) throw error;
      return data;
    },
    staleTime: 5 * 60_000,
  });
}
