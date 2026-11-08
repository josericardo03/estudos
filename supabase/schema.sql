-- Foco. Rode este arquivo uma vez, no SQL Editor de um projeto vazio.
-- Não precisa rodar os arquivos de supabase/migrations/: este script já é o banco inteiro.
--
-- 1. Crie o projeto em supabase.com.
-- 2. Abra SQL Editor, cole este arquivo e execute.
-- 3. Em Project Settings → API, copie a Project URL e a chave anon/publishable.
-- 4. Guarde as duas em .env.local e, na hora da Vercel, nas mesmas variáveis.
--    Não coloque a service_role no navegador.
-- 5. Em Authentication → URL Configuration, ponha o endereço do app em Site URL
--    e em Redirect URLs. Entre no app com o seu e-mail (link mágico) e, depois,
--    desligue "Allow new users to sign up" em Authentication → Sign In / Providers.
--
-- Cada linha pertence a um usuário (user_id). Só o dono lê e altera.
-- O PDF vai para o bucket privado "pdfs". A figura do Importante vai para "marcas".
-- Grifo, post-it e o restante ficam nas tabelas. Ao abrir o PDF, o app lê essas
-- linhas e desenha as marcações de novo. O arquivo em si continua limpo.

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
  created_at timestamptz not null default now()
);

create table blocos (
  id uuid primary key,
  user_id uuid not null default auth.uid(),
  pdf_id uuid not null references pdfs (id) on delete cascade,
  titulo text not null,
  pagina_inicio integer not null check (pagina_inicio > 0),
  pagina_fim integer not null check (pagina_fim >= pagina_inicio),
  status text not null check (status in ('estudando', 'finalizado')),
  resumo text,
  proxima_revisao_em timestamptz,
  revisoes integer,
  created_at timestamptz not null default now()
);

create table grifos (
  id uuid primary key,
  user_id uuid not null default auth.uid(),
  pdf_id uuid not null references pdfs (id) on delete cascade,
  bloco_id uuid references blocos (id) on delete set null,
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
  bloco_id uuid references blocos (id) on delete set null,
  pagina integer not null check (pagina > 0),
  texto text not null,
  x double precision not null,
  y double precision not null,
  created_at timestamptz not null default now()
);

create table questoes (
  id uuid primary key,
  user_id uuid not null default auth.uid(),
  bloco_id uuid not null references blocos (id) on delete cascade,
  materia_id uuid not null references materias (id) on delete cascade,
  pdf_id uuid not null references pdfs (id) on delete cascade,
  enunciado text not null,
  resposta text not null,
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
  pdf_id uuid not null references pdfs (id) on delete cascade,
  materia_id uuid not null references materias (id) on delete cascade,
  bloco_id uuid not null references blocos (id) on delete cascade,
  acertou boolean not null,
  nota smallint check (nota between 1 and 4),
  confianca smallint check (confianca between 1 and 3),
  motivo text check (motivo in ('nao-sabia', 'confundi', 'distracao', 'chute')),
  em timestamptz not null default now()
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
  bloco_id uuid references blocos (id) on delete set null,
  feito boolean not null default false,
  created_at timestamptz not null default now()
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
create index blocos_pdf_id_idx on blocos (pdf_id);
create index grifos_pdf_id_idx on grifos (pdf_id);
create index grifos_bloco_id_idx on grifos (bloco_id);
create index postits_pdf_id_idx on postits (pdf_id);
create index postits_bloco_id_idx on postits (bloco_id);
create index questoes_bloco_id_idx on questoes (bloco_id);
create index questoes_materia_id_idx on questoes (materia_id);
create index questoes_pdf_id_idx on questoes (pdf_id);
create index tentativas_pdf_id_idx on tentativas (pdf_id);
create index tentativas_questao_id_idx on tentativas (questao_id);
create index tentativas_bloco_id_idx on tentativas (bloco_id);
create index edital_materias_materia_id_idx on edital_materias (materia_id);
create index edital_topicos_edital_id_idx on edital_topicos (edital_id);
create index edital_topicos_materia_id_idx on edital_topicos (materia_id);
create index edital_topicos_bloco_id_idx on edital_topicos (bloco_id);
create index lancamentos_materia_id_idx on lancamentos (materia_id);
create index estudos_materia_id_idx on estudos (materia_id);
create index estudos_em_idx on estudos (em);

do $$
declare
  tabela text;
begin
  foreach tabela in array array[
    'materias', 'pdfs', 'blocos', 'grifos', 'postits', 'questoes', 'tentativas',
    'editais', 'edital_materias', 'edital_topicos', 'lancamentos', 'estudos'
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
