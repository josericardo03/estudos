-- Marcação "importante": só o contorno na página e o recorte da área
-- (figuras inclusas) vai para o cadernão. No navegador o recorte fica na
-- coluna imagem do IndexedDB. No Supabase vai para o Storage e
-- imagem_path guarda a chave.

alter table grifos drop constraint grifos_cor_check;
alter table grifos
  add constraint grifos_cor_check check (cor in ('alta', 'media', 'baixa', 'importante'));
alter table grifos add column imagem_path text;
