-- Melhorias de usabilidade pós-Etapa 01: converte beneficiados.parentesco de
-- texto livre para ENUM fechado (Tarefa 02.1 do documento de melhorias).
-- Valores pedidos por Maxwell + "cônjuge" (7ª opção, adicionada após checar
-- dados reais: já existia 1 beneficiado cadastrado como "Cônjuge" e nenhuma
-- das 6 categorias pedidas cobre esse caso).
create type parentesco_beneficiado as enum (
  'progenitor/a', 'irmão/a', 'filho/a', 'sogro/a', 'enteado/a',
  'independentes', 'cônjuge'
);

-- Verificado via execute_sql antes da migração: só existem 4 linhas não-nulas
-- hoje (Filha×2, Pai×1, Cônjuge×1) — todas cobertas pelo mapeamento abaixo,
-- sem perda de dado. Qualquer valor não mapeado vira NULL (nenhum caso hoje).
alter table beneficiados
  alter column parentesco type parentesco_beneficiado
  using (case parentesco
    when 'Pai' then 'progenitor/a'
    when 'Mãe' then 'progenitor/a'
    when 'Filho' then 'filho/a'
    when 'Filha' then 'filho/a'
    when 'Cônjuge' then 'cônjuge'
    else null
  end)::parentesco_beneficiado;
