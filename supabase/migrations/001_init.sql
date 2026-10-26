-- Espelho do IndexedDB em lib/db.ts e das operações em lib/repo.ts.
-- No navegador o PDF fica na coluna blob. No Supabase o arquivo vai para
-- o Storage e storage_path guarda a chave. Os ids são gerados pelo app.

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
  cor text not null check (cor in ('alta', 'media', 'baixa')),
  rects jsonb not null,
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
  created_at timestamptz not null default now()
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
create index edital_materias_materia_id_idx on edital_materias (materia_id);

-- No máximo 15 questões por bloco e faixas sem sobreposição no mesmo PDF
-- ficam a cargo do app, em lib/repo.ts.
