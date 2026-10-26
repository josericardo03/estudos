-- Cada Acertei/Errei do simulado vira uma linha. Trocar o julgamento
-- na mesma prova regrava a mesma linha. A média do desempenho sai daqui.

create table tentativas (
  id uuid primary key,
  questao_id uuid not null references questoes (id) on delete cascade,
  pdf_id uuid not null references pdfs (id) on delete cascade,
  materia_id uuid not null references materias (id) on delete cascade,
  bloco_id uuid not null references blocos (id) on delete cascade,
  acertou boolean not null,
  em timestamptz not null default now()
);

create index tentativas_pdf_id_idx on tentativas (pdf_id);
create index tentativas_questao_id_idx on tentativas (questao_id);
create index tentativas_bloco_id_idx on tentativas (bloco_id);
