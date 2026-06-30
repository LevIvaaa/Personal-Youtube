#!/usr/bin/env bash
# Останавливает локальный PostgreSQL.
PGBIN=/usr/lib/postgresql/16/bin
DATADIR="$HOME/.personal-youtube/pgdata"
"$PGBIN/pg_ctl" -D "$DATADIR" -w stop && echo "PostgreSQL остановлен."
