-- Foco. Rode este arquivo uma vez, no SQL Editor de um projeto vazio.
-- Não precisa rodar os arquivos de supabase/migrations/: este script já é o banco inteiro.
--
-- 1. Crie o projeto em supabase.com.
-- 2. Abra SQL Editor, cole este arquivo e execute.
-- 3. Em Project Settings → API, copie a Project URL e a chave anon.
-- 4. Guarde as duas em .env.local e, na hora da Vercel, nas mesmas variáveis.
--    Não coloque a service_role no navegador.
--
-- O PDF vai para o bucket privado "pdfs". A figura do Importante vai para "marcas".
-- Grifo, post-it e o restante ficam nas tabelas. Ao abrir o PDF, o app lê essas
-- linhas e desenha as marcações de novo. O arquivo em si continua limpo.

create table materias (
  id uuid primary key,
  nome text not null,
  created_at timestamptz not null default now()
);

create table pdfs (
  id uuid primary key,
  materia_id uuid not null references materias (id) on delete cascade,
  nome text not null,
  storage_path text not null,
  num_pages integer not null check (num_pages > 0),
  created_at timestamptz not null default now()
);

create table blocos (
  id uuid primary key,
  pdf_id uuid not null references pdfs (id) on delete cascade,
  titulo text not null,
  pagina_inicio integer not null check (pagina_inicio > 0),
  pagina_fim integer not null check (pagina_fim >= pagina_inicio),
  status text not null check (status in ('estudando', 'finalizado')),
  created_at timestamptz not null default now()
);

create table grifos (
  id uuid primary key,
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
  bloco_id uuid not null references blocos (id) on delete cascade,
  materia_id uuid not null references materias (id) on delete cascade,
  pdf_id uuid not null references pdfs (id) on delete cascade,
  enunciado text not null,
  resposta text not null,
  status_revisao text not null check (status_revisao in ('nova', 'revisar', 'dominada')),
  sequencia integer not null default 0,
  proxima_em timestamptz,
  created_at timestamptz not null default now()
);

create table tentativas (
  id uuid primary key,
  questao_id uuid not null references questoes (id) on delete cascade,
  pdf_id uuid not null references pdfs (id) on delete cascade,
  materia_id uuid not null references materias (id) on delete cascade,
  bloco_id uuid not null references blocos (id) on delete cascade,
  acertou boolean not null,
  em timestamptz not null default now()
);

create table editais (
  id uuid primary key,
  nome text not null,
  orgao text not null default '',
  created_at timestamptz not null default now()
);

create table edital_materias (
  id uuid primary key,
  edital_id uuid not null references editais (id) on delete cascade,
  materia_id uuid not null references materias (id) on delete cascade,
  unique (edital_id, materia_id)
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

alter table materias enable row level security;
alter table pdfs enable row level security;
alter table blocos enable row level security;
alter table grifos enable row level security;
alter table postits enable row level security;
alter table questoes enable row level security;
alter table tentativas enable row level security;
alter table editais enable row level security;
alter table edital_materias enable row level security;

-- Uso pessoal com a chave anon, que vai para o navegador e para a Vercel.
-- Antes de divulgar o endereço, troque estas políticas por usuário autenticado.
do $$
declare
  tabela text;
begin
  foreach tabela in array array[
    'materias', 'pdfs', 'blocos', 'grifos', 'postits',
    'questoes', 'tentativas', 'editais', 'edital_materias'
  ]
  loop
    execute format(
      'create policy %I on %I for all to anon, authenticated using (true) with check (true)',
      tabela || '_pessoal',
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
  for select to anon, authenticated
  using (bucket_id in ('pdfs', 'marcas'));

create policy pdfs_envio on storage.objects
  for insert to anon, authenticated
  with check (bucket_id in ('pdfs', 'marcas'));

create policy pdfs_troca on storage.objects
  for update to anon, authenticated
  using (bucket_id in ('pdfs', 'marcas'));

create policy pdfs_remocao on storage.objects
  for delete to anon, authenticated
  using (bucket_id in ('pdfs', 'marcas'));
