-- Estudo ativo: nota de 1 a 4, confiança, motivo do erro, intervalo adaptativo,
-- resumo e releitura de bloco, data da prova, tópicos do edital, questões
-- resolvidas fora do app e sessões de estudo cronometradas.
-- Rode uma vez no SQL Editor. Não apaga nada.

alter table blocos add column resumo text;
alter table blocos add column proxima_revisao_em timestamptz;
alter table blocos add column revisoes integer;

alter table questoes add column facilidade double precision;
alter table questoes add column intervalo_dias integer;

alter table tentativas add column nota smallint check (nota between 1 and 4);
alter table tentativas add column confianca smallint check (confianca between 1 and 3);
alter table tentativas add column motivo text
  check (motivo in ('nao-sabia', 'confundi', 'distracao', 'chute'));

alter table editais add column data_prova date;

create table edital_topicos (
  id uuid primary key,
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
  materia_id uuid not null references materias (id) on delete cascade,
  feitas integer not null check (feitas > 0),
  acertos integer not null check (acertos >= 0 and acertos <= feitas),
  fonte text not null default '',
  em timestamptz not null default now()
);

create table estudos (
  id uuid primary key,
  materia_id uuid references materias (id) on delete set null,
  segundos integer not null check (segundos > 0),
  em timestamptz not null default now()
);

create index edital_topicos_edital_id_idx on edital_topicos (edital_id);
create index edital_topicos_materia_id_idx on edital_topicos (materia_id);
create index edital_topicos_bloco_id_idx on edital_topicos (bloco_id);
create index lancamentos_materia_id_idx on lancamentos (materia_id);
create index estudos_materia_id_idx on estudos (materia_id);
create index estudos_em_idx on estudos (em);

alter table edital_topicos enable row level security;
alter table lancamentos enable row level security;
alter table estudos enable row level security;

-- Mesmo regime das outras tabelas até você rodar a 006_login.sql.
create policy edital_topicos_pessoal on edital_topicos for all to anon, authenticated using (true) with check (true);
create policy lancamentos_pessoal on lancamentos for all to anon, authenticated using (true) with check (true);
create policy estudos_pessoal on estudos for all to anon, authenticated using (true) with check (true);
