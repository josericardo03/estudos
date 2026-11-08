-- APAGA TODOS OS DADOS do Foco e recria o banco do zero, sem blocos.
-- Use só se quiser recomeçar. Não há como desfazer.
--
-- O que este arquivo apaga: matérias, PDFs, grifos, post-its, cards, tentativas,
-- editais, tópicos, lançamentos e sessões de estudo.
-- O que ele NÃO apaga: o seu usuário (login) e os arquivos dentro dos buckets
-- "pdfs" e "marcas". Esvazie os buckets em Storage antes ou depois.
--
-- Rode inteiro, de uma vez, no SQL Editor.

drop table if exists tentativas cascade;
drop table if exists questoes cascade;
drop table if exists estudos cascade;
drop table if exists lancamentos cascade;
drop table if exists edital_topicos cascade;
drop table if exists edital_materias cascade;
drop table if exists editais cascade;
drop table if exists postits cascade;
drop table if exists grifos cascade;
drop table if exists blocos cascade;
drop table if exists pdfs cascade;
drop table if exists materias cascade;

drop policy if exists pdfs_leitura on storage.objects;
drop policy if exists pdfs_envio on storage.objects;
drop policy if exists pdfs_troca on storage.objects;
drop policy if exists pdfs_remocao on storage.objects;

create table materias (
  id uuid primary key,
  user_id uuid not null default auth.uid(),
  nome text not null,
  created_at timestamptz not null default now()
);

create table pdfs (
  id uuid primary key,
  user_id uuid not null default auth.uid(),
  materia_id uuid not null references materias (id) on delete cascade,
  nome text not null,
  storage_path text not null,
  num_pages integer not null check (num_pages > 0),
  ultima_pagina integer,
  maior_pagina integer,
  created_at timestamptz not null default now()
);

create table editais (
  id uuid primary key,
  user_id uuid not null default auth.uid(),
  nome text not null,
  orgao text not null default '',
  data_prova date,
  created_at timestamptz not null default now()
);

create table edital_materias (
  id uuid primary key,
  user_id uuid not null default auth.uid(),
  edital_id uuid not null references editais (id) on delete cascade,
  materia_id uuid not null references materias (id) on delete cascade,
  unique (edital_id, materia_id)
);

create table edital_topicos (
  id uuid primary key,
  user_id uuid not null default auth.uid(),
  edital_id uuid not null references editais (id) on delete cascade,
  materia_id uuid references materias (id) on delete set null,
  nome text not null,
  peso integer not null default 3 check (peso between 1 and 5),
  pdf_id uuid references pdfs (id) on delete set null,
  pagina_inicio integer check (pagina_inicio > 0),
  pagina_fim integer check (pagina_fim >= pagina_inicio),
  feito boolean not null default false,
  created_at timestamptz not null default now()
);

create table grifos (
  id uuid primary key,
  user_id uuid not null default auth.uid(),
  pdf_id uuid not null references pdfs (id) on delete cascade,
  pagina integer not null check (pagina > 0),
  texto text not null,
  cor text not null check (cor in ('alta', 'media', 'baixa', 'importante')),
  rects jsonb not null,
  imagem_path text,
  created_at timestamptz not null default now()
);

create table postits (
  id uuid primary key,
  user_id uuid not null default auth.uid(),
  pdf_id uuid not null references pdfs (id) on delete cascade,
  pagina integer not null check (pagina > 0),
  texto text not null,
  x double precision not null,
  y double precision not null,
  created_at timestamptz not null default now()
);

create table questoes (
  id uuid primary key,
  user_id uuid not null default auth.uid(),
  materia_id uuid not null references materias (id) on delete cascade,
  pdf_id uuid references pdfs (id) on delete set null,
  pagina integer check (pagina > 0),
  topico_id uuid references edital_topicos (id) on delete set null,
  tipo text not null default 'basico' check (tipo in ('basico', 'lacuna')),
  enunciado text not null,
  resposta text not null default '',
  imagem_path text,
  suspensa boolean not null default false,
  status_revisao text not null check (status_revisao in ('nova', 'revisar', 'dominada')),
  sequencia integer not null default 0,
  facilidade double precision,
  intervalo_dias integer,
  proxima_em timestamptz,
  created_at timestamptz not null default now()
);

create table tentativas (
  id uuid primary key,
  user_id uuid not null default auth.uid(),
  questao_id uuid not null references questoes (id) on delete cascade,
  materia_id uuid not null references materias (id) on delete cascade,
  pdf_id uuid references pdfs (id) on delete set null,
  topico_id uuid references edital_topicos (id) on delete set null,
  pagina integer,
  acertou boolean not null,
  nota smallint check (nota between 1 and 4),
  confianca smallint check (confianca between 1 and 3),
  motivo text check (motivo in ('nao-sabia', 'confundi', 'distracao', 'chute')),
  em timestamptz not null default now()
);

create table lancamentos (
  id uuid primary key,
  user_id uuid not null default auth.uid(),
  materia_id uuid not null references materias (id) on delete cascade,
  feitas integer not null check (feitas > 0),
  acertos integer not null check (acertos >= 0 and acertos <= feitas),
  fonte text not null default '',
  em timestamptz not null default now()
);

create table estudos (
  id uuid primary key,
  user_id uuid not null default auth.uid(),
  materia_id uuid references materias (id) on delete set null,
  segundos integer not null check (segundos > 0),
  em timestamptz not null default now()
);

create index pdfs_materia_id_idx on pdfs (materia_id);
create index edital_materias_materia_id_idx on edital_materias (materia_id);
create index edital_topicos_edital_id_idx on edital_topicos (edital_id);
create index edital_topicos_materia_id_idx on edital_topicos (materia_id);
create index edital_topicos_pdf_id_idx on edital_topicos (pdf_id);
create index grifos_pdf_id_idx on grifos (pdf_id);
create index postits_pdf_id_idx on postits (pdf_id);
create index questoes_materia_id_idx on questoes (materia_id);
create index questoes_pdf_id_idx on questoes (pdf_id);
create index questoes_topico_id_idx on questoes (topico_id);
create index questoes_proxima_em_idx on questoes (proxima_em);
create index tentativas_questao_id_idx on tentativas (questao_id);
create index tentativas_materia_id_idx on tentativas (materia_id);
create index tentativas_pdf_id_idx on tentativas (pdf_id);
create index tentativas_topico_id_idx on tentativas (topico_id);
create index tentativas_em_idx on tentativas (em);
create index lancamentos_materia_id_idx on lancamentos (materia_id);
create index estudos_materia_id_idx on estudos (materia_id);
create index estudos_em_idx on estudos (em);

do $$
declare
  tabela text;
begin
  foreach tabela in array array[
    'materias', 'pdfs', 'editais', 'edital_materias', 'edital_topicos', 'grifos',
    'postits', 'questoes', 'tentativas', 'lancamentos', 'estudos'
  ]
  loop
    execute format('alter table %I enable row level security', tabela);
    execute format(
      'create policy %I on %I for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())',
      tabela || '_dono',
      tabela
    );
  end loop;
end $$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('pdfs', 'pdfs', false, 104857600, array['application/pdf']),
  ('marcas', 'marcas', false, 5242880, array['image/png'])
on conflict (id) do nothing;

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
