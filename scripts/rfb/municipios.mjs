// Os 29 municípios com base_territorial = true, por código TOM (Receita Federal).
// Fonte: SELECT id, nome, codigo_rfb FROM municipios WHERE base_territorial (2026-07-23).
// Não editar à mão — se a lista de municípios representados mudar, regenerar a partir do banco.
export const MUNICIPIOS_TOM = new Set([
  724, 4037, 4039, 4081, 4151, 4247, 4255, 4287, 4301, 4341, 4423, 4525, 4561,
  4593, 4609, 4657, 4695, 4863, 4901, 4957, 5029, 5057, 5243, 5277, 5285,
  5293, 5301, 5411, 5731,
]);

export const CNAE_PREFIXOS = ["45", "46", "47"];

export const SITUACAO_ATIVA = "02";

// Amostra de controle usada na Subetapa 06.1 para validar o parser contra um
// número já medido manualmente (docs/plano_importacao_rfb.md §2.1): os 8
// maiores municípios da base territorial. NÃO usar em produção (06.2+) — lá
// o filtro é sempre MUNICIPIOS_TOM inteiro.
export const AMOSTRA_CONTROLE_8 = new Set([
  4957, // Passos
  5293, // São Sebastião do Paraíso
  4863, // Monte Santo de Minas
  5029, // Piumhi
  4301, // Cássia
  4287, // Carmo do Rio Claro
  4255, // Capitólio
  4037, // Alpinópolis
]);

export const CONTAGEM_CONTROLE_ESPERADA = 2853; // medida em estabelecimentos1.csv (awk, sessão de 2026-07-23)
