--liquibase formatted sql

--changeset calendar:001-extensions splitStatements:true endDelimiter:;
--comment: Исключающее ограничение ниже опирается на оператор gist по типу varchar.
--comment: Расширение btree_gist даёт gist-индексы не только по геометрии, но и по
--comment: равенству обычных значений, без него `event_type_id WITH =` не собрался бы.
--comment: IF NOT EXISTS — чтобы changeset был безопасен на базе, где расширение
--comment: уже заведено вручную; повторный прогон всё равно идёт через DATABASECHANGELOG.
CREATE EXTENSION IF NOT EXISTS btree_gist;


--changeset calendar:002-windows splitStatements:true endDelimiter:;
--comment: Имена в snake_case (D16). Ключ — суррогатный, у байт-а есть только PK (D13):
--comment: уникального индекса на start_dt нет сознательно, единственный барьер против
--comment: дублей окон — сам changeset.
--
--comment: CHECK на конец после начала — из прозы контракта (TimeRange): момент окончания
--comment: всегда позже начала. Моменты настоящие, а не минуты от полуночи.
CREATE TABLE windows (
    id        bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    start_dt  timestamptz NOT NULL,
    end_dt    timestamptz NOT NULL,
    CONSTRAINT windows_end_after_start CHECK (end_dt > start_dt)
);


--changeset calendar:003-event-types splitStatements:true endDelimiter:;
--comment: Идентификатор — slug, который пишет Владелец, varchar(40) по ID_MAX из
--comment: контракта, поэтому колонка обязана быть ровно такой длины: идентификатор
--comment: уходит прямо в адрес гостевой ссылки (D14).
--
--comment: CHECK на длительность НЕ заводится намеренно. Правило «кратна 15» проверяет
--comment: сервер (D42) — единственное правило, которого нет в OpenAPI 3.0, — и дублировать
--comment: его в базе значит завести второе место, где правда о длительности.
CREATE TABLE event_types (
    id               varchar(40)  PRIMARY KEY,
    name             varchar(100) NOT NULL,
    description      varchar(600) NOT NULL,
    duration_minutes integer      NOT NULL
);


--changeset calendar:004-bookings splitStatements:true endDelimiter:;
--comment: event_type_id — varchar(40), а не uuid: внешний ключ на event_types(id)
--comment: требует совпадения типов, и uuid со varchar(40) не собирается (D15).
--comment: Удаление Типа ограничено, поэтому существующая Бронь не осиротеет.
CREATE TABLE bookings (
    id            uuid         PRIMARY KEY,
    event_type_id varchar(40)  NOT NULL REFERENCES event_types (id) ON DELETE RESTRICT,
    start_dt      timestamptz  NOT NULL,
    end_dt        timestamptz  NOT NULL,
    guest_name    varchar(100) NOT NULL,
    guest_email   varchar(254) NOT NULL,
    created_at    timestamptz  NOT NULL,
    CONSTRAINT bookings_end_after_start CHECK (end_dt > start_dt)
);


--changeset calendar:005-bookings-no-overlap splitStatements:true endDelimiter:;
--comment: Пересечения запрещены на уровне базы (D17). Интервал — tstzrange с
--comment: полуоткрытой границей '[)': Бронь 10:00–10:30 и Бронь 10:30–11:00 не
--comment: пересекаются, а Бронь 10:15–10:45 пересекается с первой и отбивается здесь.
--
--comment: Это единственное место, где рождается 409 slot_taken при гонке двух Гостей,
--comment: поэтому проверять пересечение в коде сервера обязательно, а база — последний
--comment: рубеж, а не основной.
ALTER TABLE bookings
    ADD CONSTRAINT bookings_no_overlap
        EXCLUDE USING gist (event_type_id WITH =, tstzrange(start_dt, end_dt, '[)') WITH &&);
