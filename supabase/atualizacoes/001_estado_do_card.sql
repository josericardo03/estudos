-- Estado derivado do card e marca de "primeira vez" na tentativa.
-- Com isso, a fila do dia e os avisos de gargalo não precisam ler o histórico inteiro de
-- tentativas (que cresce sem parar e, no Supabase, vem cortado em 1000 linhas).
-- Não apaga nada. Pode rodar mais de uma vez.

alter table questoes add column if not exists julgada_em timestamptz;
alter table questoes add column if not exists erros_seguidos integer not null default 0;
alter table questoes add column if not exists erro_com_certeza boolean not null default false;
alter table tentativas add column if not exists nova boolean not null default false;

-- Cards que já tinham histórico: preenche o que dá a partir das tentativas.
update questoes q
set julgada_em = t.primeira
from (select questao_id, min(em) as primeira from tentativas group by questao_id) t
where t.questao_id = q.id and q.julgada_em is null;
