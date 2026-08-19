#!/usr/bin/env bash
#
# Gera o schema.sql a partir do banco REAL, lendo o catálogo do Postgres.
#
# O que faz: consulta o catálogo pela Management API do Supabase e monta um
#            arquivo com extensões, enums, tabelas, índices, funções, triggers,
#            políticas, privilégios, particionamento e jobs de cron.
# Recebe:    o ref do projeto como primeiro argumento (padrão: o de produção).
# Devolve:   escreve o schema.sql na raiz do repositório.
# Implementa: o item "schema.sql gerado do banco real" da seção 15.4 do spec.
#
# Por que não `supabase db dump`: ele exige Docker, e instalar Docker Desktop
# na máquina do dono por causa de um arquivo é desproporcional. O catálogo tem
# a mesma informação, com a vantagem de sair ordenado e legível.
#
# O token vem do .env e nunca é impresso.
set -euo pipefail

cd "$(dirname "$0")/.."
set -a; . ./.env; set +a

REF="${1:-glohvqzopiffdghwppor}"
SAIDA="schema.sql"

# Roda um SELECT e devolve a primeira coluna de cada linha, uma por linha.
consultar() {
  curl -s -X POST "https://api.supabase.com/v1/projects/$REF/database/query" \
    -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
    -H "content-type: application/json" \
    --data-binary @<(python3 -c 'import json,sys; print(json.dumps({"query": sys.stdin.read()}))' <<< "$1") \
  | python3 -c '
import json, sys
linhas = json.load(sys.stdin)
if isinstance(linhas, dict):
    sys.stderr.write(json.dumps(linhas) + "\n"); sys.exit(1)
for l in linhas:
    print(next(iter(l.values())))
'
}

titulo() { printf '\n-- %s\n-- %s\n\n' "$(printf '=%.0s' {1..74})" "$1"; }

{
  echo "-- Esquema do banco de $REF, gerado do catálogo do Postgres."
  echo "-- Gerado por scripts/gerar-schema.sh em $(date -u +%Y-%m-%dT%H:%M:%SZ)."
  echo "--"
  echo "-- NÃO EDITE À MÃO. Quem manda são os arquivos de supabase/migrations/;"
  echo "-- este arquivo é o retrato do que eles produziram no banco de verdade."

  titulo "Extensões"
  consultar "select format('create extension if not exists %I with schema %I;', e.extname, n.nspname)
             from pg_extension e join pg_namespace n on n.oid = e.extnamespace
             where e.extname not in ('plpgsql') order by e.extname"

  titulo "Enums (seção 7.2)"
  consultar "select format(E'create type %I as enum (%s);', t.typname,
                    (select string_agg(quote_literal(e.enumlabel), ', ' order by e.enumsortorder)
                     from pg_enum e where e.enumtypid = t.oid))
             from pg_type t join pg_namespace n on n.oid = t.typnamespace
             where n.nspname = 'public' and t.typtype = 'e' order by t.typname"

  titulo "Papéis"
  consultar "select format('create role %I nologin;', rolname) from pg_roles where rolname = 'visao_mcp_leitor'"

  titulo "Tabelas"
  consultar "with t as (
               select c.oid, c.relname,
                 (select string_agg(format('  %I %s%s%s', a.attname,
                          format_type(a.atttypid, a.atttypmod),
                          case when a.attnotnull then ' not null' else '' end,
                          coalesce(' default ' || pg_get_expr(d.adbin, d.adrelid), '')),
                        E',\n' order by a.attnum)
                  from pg_attribute a
                  left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
                  where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped) as cols,
                 (select string_agg(format('  constraint %I %s', k.conname, pg_get_constraintdef(k.oid)), E',\n' order by k.conname)
                  from pg_constraint k where k.conrelid = c.oid) as cons,
                 pg_get_partkeydef(c.oid) as part
               from pg_class c join pg_namespace n on n.oid = c.relnamespace
               where n.nspname = 'public' and c.relkind in ('r','p')
                 and c.relname !~ '^eventos_(p[0-9]+|default)\$'
             )
             select format(E'create table %I (\n%s%s\n)%s;\n', relname, cols,
                    coalesce(E',\n' || cons, ''),
                    coalesce(' partition by ' || part, ''))
             from t order by relname"

  titulo "Índices"
  consultar "select pg_get_indexdef(i.indexrelid) || ';'
             from pg_index i join pg_class c on c.oid = i.indrelid
             join pg_namespace n on n.oid = c.relnamespace
             where n.nspname = 'public' and c.relname !~ '^eventos_(p[0-9]+|default)\$'
               and not i.indisprimary
             order by c.relname, pg_get_indexdef(i.indexrelid)"

  titulo "Funções (seção 7.10 e as consultas das telas)"
  consultar "select pg_get_functiondef(p.oid) || E';\n'
             from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'public' order by p.proname"

  titulo "Triggers"
  consultar "select pg_get_triggerdef(t.oid) || ';'
             from pg_trigger t join pg_class c on c.oid = t.tgrelid
             join pg_namespace n on n.oid = c.relnamespace
             where not t.tgisinternal and n.nspname in ('public','auth')
             order by c.relname, t.tgname"

  titulo "Row Level Security"
  consultar "select format('alter table %I enable row level security;', c.relname)
             from pg_class c join pg_namespace n on n.oid = c.relnamespace
             where n.nspname = 'public' and c.relrowsecurity
               and c.relname !~ '^eventos_(p[0-9]+|default)\$'
             order by c.relname"

  echo
  echo "-- As partições de eventos são tabelas de verdade e recebem RLS uma a uma."
  echo "-- Quem faz isso é fn_protege_particoes_eventos(), chamada pelo job diário."
  echo

  titulo "Políticas — todas com predicado de propriedade (seção 6.2)"
  consultar "select format(E'create policy %I on %I\n  for %s to %s\n  using (%s)%s;\n',
                    pol.polname, c.relname,
                    case pol.polcmd when 'r' then 'select' when 'a' then 'insert'
                                    when 'w' then 'update' when 'd' then 'delete' else 'all' end,
                    (select string_agg(quote_ident(r.rolname), ', ') from pg_roles r where r.oid = any(pol.polroles)),
                    pg_get_expr(pol.polqual, pol.polrelid),
                    coalesce(format(E'\n  with check (%s)', pg_get_expr(pol.polwithcheck, pol.polrelid)), ''))
             from pg_policy pol join pg_class c on c.oid = pol.polrelid
             join pg_namespace n on n.oid = c.relnamespace
             where n.nspname = 'public' order by c.relname, pol.polname"

  titulo "Privilégios de tabela"
  consultar "select format('grant %s on %I to %I;', lower(privilege_type), table_name, grantee)
             from information_schema.role_table_grants
             where table_schema = 'public' and grantee in ('anon','authenticated','service_role','visao_mcp_leitor')
               and table_name !~ '^eventos_(p[0-9]+|default)\$'
             order by table_name, grantee, privilege_type"

  titulo "Jobs agendados (pg_cron, seção 7.10)"
  consultar "select format('select cron.schedule(%L, %L, %L);', jobname, schedule, command)
             from cron.job order by jobname"

  titulo "Particionamento (pg_partman, regras 11.8 e 11.18)"
  consultar "select format('-- %s: intervalo %s, premake %s, retenção %s, apaga a tabela: %s',
                    parent_table, partition_interval, premake, retention, retention_keep_table)
             from partman.part_config"

  echo
  echo "-- Fim."
} > "$SAIDA"

echo "$SAIDA gerado: $(wc -l < "$SAIDA") linhas"
