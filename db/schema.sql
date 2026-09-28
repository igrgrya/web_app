-- =====================================================================
-- funds_lab — схема базы данных
-- =====================================================================
-- Домен: каталог биржевых инструментов (акции/фонды/ETF), новости,
-- пользовательская активность (гостевая книга, форум, рейтинги,
-- подписка, опросы) и служебные данные сайта (счётчик посещений).
--
-- В лабораторной работе №1 фронтенд ещё НЕ обращается к этой базе —
-- он работает на захардкоженных (seed) данных. Эта схема создаётся
-- заранее, чтобы в лабораторной работе №3 backend на FastAPI +
-- SQLAlchemy просто подключился к готовым таблицам вместо того,
-- чтобы проектировать их с нуля.
--
-- Как выполнить: открыть в DBeaver подключение к своему локальному
-- PostgreSQL, создать пустую базу данных `funds_lab`, открыть этот
-- файл в SQL-редакторе DBeaver на базе `funds_lab` и выполнить целиком
-- (Execute SQL Script, обычно Alt+X).
-- =====================================================================


-- ---------------------------------------------------------------------
-- Справочники: биржи и секторы
-- ---------------------------------------------------------------------

-- Биржи, на которых торгуются инструменты (напр. MOEX, NASDAQ, NYSE).
CREATE TABLE exchanges (
    id          SERIAL PRIMARY KEY,
    code        VARCHAR(20)  NOT NULL UNIQUE,   -- короткий код биржи, напр. "MOEX"
    name        VARCHAR(255) NOT NULL,          -- полное название
    country     VARCHAR(100),
    timezone    VARCHAR(50),
    website_url TEXT
);

-- Отраслевые секторы для классификации инструментов (напр. "Технологии", "Энергетика").
CREATE TABLE sectors (
    id   SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE
);


-- ---------------------------------------------------------------------
-- Каталог инструментов и цены
-- ---------------------------------------------------------------------

-- Один инструмент — акция, ETF, фонд или облигация. Это ядро каталога,
-- на него ссылаются новости, рейтинги, события и снимки цен.
CREATE TABLE instruments (
    id              SERIAL PRIMARY KEY,
    ticker          VARCHAR(20)  NOT NULL UNIQUE,   -- биржевой тикер, напр. "SBER"
    name            VARCHAR(255) NOT NULL,
    instrument_type VARCHAR(20)  NOT NULL CHECK (instrument_type IN ('stock', 'etf', 'fund', 'bond')),
    exchange_id     INTEGER REFERENCES exchanges(id),
    sector_id       INTEGER REFERENCES sectors(id),
    currency        VARCHAR(10)  NOT NULL DEFAULT 'RUB',
    description     TEXT,
    listed_date     DATE
);

-- Снимок цены инструмента на конкретную дату. В лабораторной работе №1
-- сюда пойдут придуманные (seed) значения; в лабораторной работе №4
-- эта таблица начнёт наполняться реальными котировками через yfinance.
CREATE TABLE price_snapshots (
    id              SERIAL PRIMARY KEY,
    instrument_id   INTEGER NOT NULL REFERENCES instruments(id) ON DELETE CASCADE,
    price           NUMERIC(14, 4) NOT NULL,
    change_percent  NUMERIC(6, 2),
    volume          BIGINT,
    as_of_date      DATE NOT NULL,
    UNIQUE (instrument_id, as_of_date)
);


-- ---------------------------------------------------------------------
-- Контент сайта: новости, полезные ссылки, события
-- ---------------------------------------------------------------------

-- Новостная лента. related_instrument_id необязателен — не каждая
-- новость привязана к конкретному инструменту.
CREATE TABLE news (
    id                   SERIAL PRIMARY KEY,
    title                VARCHAR(255) NOT NULL,
    body                 TEXT NOT NULL,
    published_at         TIMESTAMP NOT NULL DEFAULT now(),
    related_instrument_id INTEGER REFERENCES instruments(id)
);

-- Каталог полезных внешних ссылок (сайты бирж, регуляторов, СМИ) —
-- один из "дополнительных сервисов" лабораторной работы №1.
CREATE TABLE external_links (
    id          SERIAL PRIMARY KEY,
    title       VARCHAR(255) NOT NULL,
    url         TEXT NOT NULL,
    category    VARCHAR(100),
    description TEXT
);

-- Календарь событий (даты отчётности, дивидендов и т.д.) — тоже
-- дополнительный сервис лабораторной работы №1.
CREATE TABLE events (
    id                    SERIAL PRIMARY KEY,
    title                 VARCHAR(255) NOT NULL,
    description           TEXT,
    event_date            DATE NOT NULL,
    related_instrument_id INTEGER REFERENCES instruments(id)
);


-- ---------------------------------------------------------------------
-- Пользовательская активность: гостевая книга, форум, рейтинги
-- ---------------------------------------------------------------------

-- Простая гостевая книга — один из обязательных сервисов лабораторной
-- работы №1 (плоская лента сообщений, без тем).
CREATE TABLE guestbook_entries (
    id          SERIAL PRIMARY KEY,
    author_name VARCHAR(100) NOT NULL,
    email       VARCHAR(255),
    message     TEXT NOT NULL,
    created_at  TIMESTAMP NOT NULL DEFAULT now()
);

-- Форум — отдельный обязательный сервис (в отличие от гостевой книги,
-- здесь есть темы и ответы внутри темы).
CREATE TABLE forum_topics (
    id          SERIAL PRIMARY KEY,
    title       VARCHAR(255) NOT NULL,
    author_name VARCHAR(100) NOT NULL,
    created_at  TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE forum_replies (
    id          SERIAL PRIMARY KEY,
    topic_id    INTEGER NOT NULL REFERENCES forum_topics(id) ON DELETE CASCADE,
    author_name VARCHAR(100) NOT NULL,
    message     TEXT NOT NULL,
    created_at  TIMESTAMP NOT NULL DEFAULT now()
);

-- Оценки инструментов пользователями (звёзды 1-5) — обязательный
-- сервис "рейтинг".
CREATE TABLE ratings (
    id            SERIAL PRIMARY KEY,
    instrument_id INTEGER NOT NULL REFERENCES instruments(id) ON DELETE CASCADE,
    stars         SMALLINT NOT NULL CHECK (stars BETWEEN 1 AND 5),
    created_at    TIMESTAMP NOT NULL DEFAULT now()
);


-- ---------------------------------------------------------------------
-- Служебные таблицы сайта: счётчик посещений, рассылка, опросы
-- ---------------------------------------------------------------------

-- Счётчик посещений по разделам сайта. Одна строка = один маршрут
-- (напр. "/catalog"). Общий счётчик на сайте — это сумма view_count по
-- всем строкам; постраничная разбивка — дополнительный сервис "статистика
-- посещений по разделам".
CREATE TABLE page_views (
    id             SERIAL PRIMARY KEY,
    page_path      VARCHAR(255) NOT NULL UNIQUE,
    view_count     INTEGER NOT NULL DEFAULT 0,
    last_viewed_at TIMESTAMP
);

-- Подписчики email-рассылки — дополнительный сервис "список рассылки".
CREATE TABLE subscribers (
    id            SERIAL PRIMARY KEY,
    email         VARCHAR(255) NOT NULL UNIQUE,
    subscribed_at TIMESTAMP NOT NULL DEFAULT now()
);

-- Опрос с вариантами ответа — дополнительный сервис "голосование".
-- Для простоты лабораторной работы голоса не привязываются к
-- конкретному пользователю, только счётчик на варианте ответа.
CREATE TABLE poll_questions (
    id            SERIAL PRIMARY KEY,
    question_text VARCHAR(255) NOT NULL,
    created_at    TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE poll_options (
    id          SERIAL PRIMARY KEY,
    poll_id     INTEGER NOT NULL REFERENCES poll_questions(id) ON DELETE CASCADE,
    option_text VARCHAR(255) NOT NULL,
    vote_count  INTEGER NOT NULL DEFAULT 0
);
