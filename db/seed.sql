-- =====================================================================
-- funds_lab — тестовые данные для проверки схемы (db/schema.sql)
-- =====================================================================
-- Эти данные нужны только чтобы убедиться, что схема БД рабочая —
-- в лабораторной работе №1 фронтенд их ещё не читает (у него свой
-- набор seed-данных в frontend/src/data/seed.js). Подключение
-- backend к этой базе появится в лабораторной работе №3.
--
-- Как выполнить: после db/schema.sql, в том же SQL-редакторе DBeaver
-- на базе funds_lab, выполнить этот файл целиком.
-- =====================================================================

-- Биржи
INSERT INTO exchanges (code, name, country, timezone, website_url) VALUES
    ('MOEX',   'Московская биржа',          'Россия', 'Europe/Moscow',    'https://www.moex.com'),
    ('NASDAQ', 'NASDAQ Stock Market',       'США',    'America/New_York', 'https://www.nasdaq.com'),
    ('NYSE',   'New York Stock Exchange',   'США',    'America/New_York', 'https://www.nyse.com');

-- Секторы
INSERT INTO sectors (name) VALUES
    ('Технологии'), ('Финансы'), ('Энергетика'), ('Потребительский сектор'), ('Здравоохранение');

-- Инструменты (каталог фондов/акций)
INSERT INTO instruments (ticker, name, instrument_type, exchange_id, sector_id, currency, description, listed_date) VALUES
    ('SBER', 'Сбербанк',                       'stock', 1, 2, 'RUB', 'Крупнейший банк России.',                     '1996-01-01'),
    ('GAZP', 'Газпром',                        'stock', 1, 3, 'RUB', 'Крупнейшая газовая компания страны.',         '1996-10-28'),
    ('LKOH', 'Лукойл',                         'stock', 1, 3, 'RUB', 'Одна из крупнейших нефтяных компаний мира.',  '1995-04-25'),
    ('FXIT', 'FinEx Технологии ETF',           'etf',   1, 1, 'RUB', 'ETF на сектор технологий.',                   '2013-11-27'),
    ('AAPL', 'Apple Inc.',                     'stock', 2, 1, 'USD', 'Производитель электроники и ПО.',             '1980-12-12'),
    ('MSFT', 'Microsoft Corporation',          'stock', 2, 1, 'USD', 'Разработчик программного обеспечения.',       '1986-03-13'),
    ('SPY',  'SPDR S&P 500 ETF Trust',         'etf',   3, 2, 'USD', 'Фонд, отслеживающий индекс S&P 500.',         '1993-01-22'),
    ('JNJ',  'Johnson & Johnson',              'stock', 3, 5, 'USD', 'Фармацевтика и медицинские изделия.',         '1944-09-25');

-- Снимки цен (по одному на инструмент, условная "текущая" дата)
INSERT INTO price_snapshots (instrument_id, price, change_percent, volume, as_of_date) VALUES
    (1, 285.50,  1.20, 15000000, CURRENT_DATE),
    (2, 168.20, -0.85,  9800000, CURRENT_DATE),
    (3, 7150.00, 0.40,  1200000, CURRENT_DATE),
    (4, 42.30,   2.10,   320000, CURRENT_DATE),
    (5, 227.80,  0.55, 48000000, CURRENT_DATE),
    (6, 415.10,  0.90, 21000000, CURRENT_DATE),
    (7, 560.75,  0.30, 60000000, CURRENT_DATE),
    (8, 158.40, -0.15,  6500000, CURRENT_DATE);

-- Новости
INSERT INTO news (title, body, related_instrument_id) VALUES
    ('Сбербанк отчитался о рекордной прибыли', 'Банк опубликовал квартальную отчётность, превысив ожидания аналитиков.', 1),
    ('Газпром объявил дивиденды', 'Совет директоров рекомендовал выплату дивидендов по итогам года.', 2),
    ('Apple представила новый продукт', 'Компания анонсировала обновление линейки устройств на ежегодной презентации.', 5),
    ('S&P 500 обновил исторический максимум', 'Индекс закрылся на новом рекордном уровне на фоне позитивной статистики.', 7),
    ('Обзор рынка: итоги недели', 'Общий обзор движения основных индексов и инструментов за прошедшую неделю.', NULL);

-- Полезные ссылки (каталог сервиса)
INSERT INTO external_links (title, url, category, description) VALUES
    ('Московская биржа', 'https://www.moex.com', 'Биржи', 'Официальный сайт Московской биржи.'),
    ('NASDAQ', 'https://www.nasdaq.com', 'Биржи', 'Официальный сайт биржи NASDAQ.'),
    ('Банк России', 'https://www.cbr.ru', 'Регуляторы', 'Центральный банк Российской Федерации.'),
    ('SEC.gov', 'https://www.sec.gov', 'Регуляторы', 'Комиссия по ценным бумагам и биржам США.'),
    ('РБК Инвестиции', 'https://quote.rbc.ru', 'Новости', 'Финансовые новости и котировки.');

-- Календарь событий
INSERT INTO events (title, description, event_date, related_instrument_id) VALUES
    ('Публикация отчётности Сбербанка', 'Ожидается публикация квартального отчёта.', CURRENT_DATE + INTERVAL '7 day', 1),
    ('Дивидендная отсечка Газпрома', 'Последний день покупки акций для получения дивидендов.', CURRENT_DATE + INTERVAL '14 day', 2),
    ('Отчётность Apple за квартал', 'Публикация финансовых результатов компании.', CURRENT_DATE + INTERVAL '21 day', 5),
    ('Заседание ФРС США', 'Решение по ключевой ставке.', CURRENT_DATE + INTERVAL '30 day', NULL);

-- Гостевая книга
INSERT INTO guestbook_entries (author_name, email, message) VALUES
    ('Алексей', 'alexey@example.com', 'Отличный сайт, удобно следить за фондами!'),
    ('Мария', NULL, 'Было бы здорово добавить больше валютных пар.');

-- Форум: тема + ответы
INSERT INTO forum_topics (title, author_name) VALUES
    ('Как выбрать первый ETF?', 'Дмитрий');
INSERT INTO forum_replies (topic_id, author_name, message) VALUES
    (1, 'Ирина', 'Начните с широких индексных фондов вроде SPY.'),
    (1, 'Дмитрий', 'Спасибо, посмотрю подробнее про диверсификацию.');

-- Рейтинги инструментов
INSERT INTO ratings (instrument_id, stars) VALUES
    (1, 5), (1, 4), (5, 5), (7, 4), (7, 5);

-- Счётчик посещений по разделам (стартовые значения)
INSERT INTO page_views (page_path, view_count, last_viewed_at) VALUES
    ('/', 0, NULL),
    ('/catalog', 0, NULL),
    ('/news', 0, NULL);

-- Подписчики рассылки
INSERT INTO subscribers (email) VALUES
    ('test.subscriber@example.com');

-- Опрос
INSERT INTO poll_questions (question_text) VALUES
    ('Какой класс активов вам интереснее всего?');
INSERT INTO poll_options (poll_id, option_text, vote_count) VALUES
    (1, 'Акции', 3),
    (1, 'ETF / фонды', 5),
    (1, 'Облигации', 1);
