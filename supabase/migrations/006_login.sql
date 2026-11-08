-- Fecha o banco: só o usuário logado enxerga e altera os próprios dados.
--
-- ORDEM (importa, senão você se tranca para fora):
--   1. Rode a 005_estudo_ativo.sql.
--   2. Publique esta versão do app e entre uma vez com o seu e-mail.
--      Isso cria o seu usuário em auth.users.
--   3. Só então rode este arquivo. Ele entrega os dados que já existem
--      ao primeiro usuário cadastrado e troca as políticas abertas.
--   4. Em Authentication → Sign In / Providers, desligue "Allow new users to sign up".
--
-- Em Authentication → URL Configuration, ponha o endereço do app em Site URL
-- e em Redirect URLs (o link do e-mail volta para lá).

do $$
declare
  dono uuid := (select id from auth.users order by created_at limit 1);
  tabela text;
begin
  if dono is null then
    raise exception 'Entre no app com o seu e-mail antes de rodar este script.';
  end if;

  foreach tabela in array array[
    'materias', 'pdfs', 'blocos', 'grifos', 'postits', 'questoes', 'tentativas',
    'editais', 'edital_materias', 'edital_topicos', 'lancamentos', 'estudos'
  ]
  loop
    execute format('alter table %I add column if not exists user_id uuid default auth.uid()', tabela);
    execute format('update %I set user_id = %L where user_id is null', tabela, dono);
    execute format('alter table %I alter column user_id set not null', tabela);
    execute format('drop policy if exists %I on %I', tabela || '_pessoal', tabela);
    execute format('drop policy if exists %I on %I', tabela || '_dono', tabela);
    execute format(
      'create policy %I on %I for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())',
      tabela || '_dono',
      tabela
    );
  end loop;
end $$;

drop policy if exists pdfs_leitura on storage.objects;
drop policy if exists pdfs_envio on storage.objects;
drop policy if exists pdfs_troca on storage.objects;
drop policy if exists pdfs_remocao on storage.objects;

create policy pdfs_leitura on storage.objects
  for select to authenticated
  using (bucket_id in ('pdfs', 'marcas'));

create policy pdfs_envio on storage.objects
  for insert to authenticated
  with check (bucket_id in ('pdfs', 'marcas'));

create policy pdfs_troca on storage.objects
  for update to authenticated
  using (bucket_id in ('pdfs', 'marcas'));

create policy pdfs_remocao on storage.objects
  for delete to authenticated
  using (bucket_id in ('pdfs', 'marcas'));
