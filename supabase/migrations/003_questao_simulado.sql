-- Agenda do simulado. Acerto aumenta a sequência e empurra proxima_em.
-- Erro zera a sequência e deixa proxima_em no passado, então a questão
-- continua entrando no próximo simulado. Null em proxima_em também entra.

alter table questoes add column sequencia integer not null default 0;
alter table questoes add column proxima_em timestamptz;
