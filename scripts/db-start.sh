#!/usr/bin/env bash
# Поднимает локальный user-space PostgreSQL (без sudo/Docker) на порту 5433.
set -e
PGBIN=/usr/lib/postgresql/16/bin
BASE="$HOME/.personal-youtube"
DATADIR="$BASE/pgdata"
DB=personal_youtube

if [ ! -f "$DATADIR/PG_VERSION" ]; then
  echo "Инициализирую кластер в $DATADIR…"
  mkdir -p "$BASE"
  "$PGBIN/initdb" -D "$DATADIR" -U postgres --auth-local=trust --auth-host=trust >/dev/null
  printf "\nport = 5433\nlisten_addresses = '127.0.0.1'\nunix_socket_directories = '%s'\n" "$BASE" >> "$DATADIR/postgresql.conf"
fi

if "$PGBIN/pg_ctl" -D "$DATADIR" status >/dev/null 2>&1; then
  echo "PostgreSQL уже запущен."
else
  "$PGBIN/pg_ctl" -D "$DATADIR" -l "$DATADIR/server.log" -w start
fi

"$PGBIN/createdb" -h 127.0.0.1 -p 5433 -U postgres "$DB" 2>/dev/null && echo "БД $DB создана." || echo "БД $DB уже есть."
echo "Готово: postgresql://postgres@127.0.0.1:5433/$DB"
