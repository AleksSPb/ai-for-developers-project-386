#!/bin/sh
#
# Точка входа образа приложения.
#
# Приложение в контейнере нужно всегда, а база — только там, где её неоткуда
# взять снаружи. Поэтому работа делится на две части: поднять встроенную базу,
# если сервер собирается идти на localhost, и запустить JVM.
#
# Процесс приложения запускается не под root, но и не обёрткой: `setpriv` не
# форкается, а делает exec. Поэтому первым процессом контейнера (PID 1)
# остаётся JVM, и сигнал остановки достаётся ей, а не прослойке.

set -eu

# Умолчания совпадают с `application.yml`: сервер сам пойдёт на
# `localhost:5432` именно с этими именем, паролем и базой, поэтому встроенная
# база обязана быть заведена ровно такими же.
host="${POSTGRES_HOST:-localhost}"
user="${POSTGRES_USER:-calendar}"
password="${POSTGRES_PASSWORD:-calendar}"
database="${POSTGRES_DB:-calendar}"

# Значение подставляется в SQL-литерал, и одинарная кавычка в нём закрыла бы
# литерал раньше времени. Кавычка удваивается — это и есть экранирование в SQL.
literal() { printf '%s' "$1" | sed "s/'/''/g"; }

case "$host" in
  localhost | 127.0.0.1 | ::1) embedded=yes ;;
  *) embedded=no ;;
esac

if [ "$embedded" = yes ]; then
  echo "entrypoint: внешней базы нет — поднимаю PostgreSQL в контейнере"

  # Мажорную версию называть не приходится: кластер заводит пакет при сборке
  # образа, а имя его колонок даёт `pg_lsclusters`.
  cluster="$(pg_lsclusters -h | awk 'NR==1 {print $1, $2}')"
  pg_ctlcluster $cluster start

  # Без этого при сбое Liquibase в выводе контейнера видно только «connection
  # refused» и ничего о том, почему база не поднялась.
  tail -n +1 -F /var/log/postgresql/postgresql-*.log &

  # Ждать надо готовность принимать подключения, а не запуск процесса: Liquibase
  # стартует вместе с приложением и падает, если база ещё только встаёт.
  ready=no
  for _ in $(seq 1 60); do
    if pg_isready -q -h localhost -p 5432; then
      ready=yes
      break
    fi
    sleep 1
  done
  if [ "$ready" != yes ]; then
    echo "entrypoint: PostgreSQL не поднялся за минуту" >&2
    exit 1
  fi

  # Заведение идемпотентно: контейнер может перезапуститься поверх той же базы.
  # `%I` в `format` сам ставит кавычки идентификатору, `\gexec` выполняет
  # собранный текст — так имя роли не приходится склеивать вручную. Вывод psql
  # гасится: он повторил бы те же команды, а сбой всё равно виден по коду выхода.
  init_sql="$(mktemp)"
  trap 'rm -f "$init_sql"' EXIT
  cat > "$init_sql" <<SQL
SELECT format('CREATE ROLE %I LOGIN PASSWORD %L', '$(literal "$user")', '$(literal "$password")')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '$(literal "$user")');
\gexec
SELECT format('CREATE DATABASE %I OWNER %I', '$(literal "$database")', '$(literal "$user")')
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = '$(literal "$database")');
\gexec
SQL

  su postgres -c "psql -q -v ON_ERROR_STOP=1 -f -" < "$init_sql" > /dev/null

  echo "entrypoint: PostgreSQL готов на localhost:5432"
fi

exec setpriv --reuid=calendar --init-groups java -jar /app/server.jar
