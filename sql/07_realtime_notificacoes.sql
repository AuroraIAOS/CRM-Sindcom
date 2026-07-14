-- Subetapa 01.6: habilita postgres_changes (Realtime) na tabela notificacoes.
alter publication supabase_realtime add table notificacoes;
