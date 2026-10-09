--liquibase formatted sql

--changeset calendar:010-seed-windows context:seed splitStatements:true endDelimiter:;
--comment: Сид окон на 14 дней вперёд, 09:00–18:00 Europe/Moscow (D20).
--comment: Даты относительные — считаются от now() базы, поэтому changeset остаётся
--comment: верным через полгода после написания.
--
--comment: Даты считаются по часам БД, а сервер живёт по часам JVM (D22): расхождение
--comment: возможно и принимается. Поэтому тесты сидят на фикстуре, а не на этом changeset.
--
--comment: Моменты выражены в зоне константы и приходят в базу уже приведёнными:
--comment: `AT TIME ZONE 'Europe/Moscow'` переводит местное время окна в timestamptz,
--comment: то есть в момент, который переживёт перевод часов.
--
--comment: Сегодняшнее окно заводится целиком и окажется в прошлом уже завтра — за это
--comment: отвечает правило «окно, целиком закончившееся, не возвращается» (D25).
--
--comment: КОНТЕКСТ `seed`. Режим без сида — прогон с `--contexts=!seed`: схема
--comment: создаётся, окна не заводятся. Нужен, чтобы увидеть состояние «база пуста,
--comment: гость видит пустой календарь», и чтобы тесты начинали с чистой таблицы.
INSERT INTO windows (start_dt, end_dt)
SELECT (day + INTERVAL '9 hours')  AT TIME ZONE 'Europe/Moscow',
       (day + INTERVAL '18 hours') AT TIME ZONE 'Europe/Moscow'
FROM generate_series(
         date_trunc('day', now() AT TIME ZONE 'Europe/Moscow'),
         date_trunc('day', now() AT TIME ZONE 'Europe/Moscow') + INTERVAL '13 days',
         INTERVAL '1 day'
     ) AS day;
