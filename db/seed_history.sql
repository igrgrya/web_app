-- =====================================================================
-- funds_lab — история цен за 30 торговых дней (для лабораторной работы №3)
-- =====================================================================
-- Дополняет db/seed.sql: для каждого инструмента создаёт по 30 дневных
-- снимков цены (будние дни) ПЕРЕД текущей датой. Ряд привязан к
-- сегодняшней цене из seed.sql и идёт «назад» детерминированным
-- псевдослучайным обходом (комбинация синусов, без random()) —
-- результат одинаков при каждом запуске. Эти данные нужны линейному
-- графику динамики цены в приложении лабораторной №3.
--
-- Порядок выполнения: ПОСЛЕ db/schema.sql и db/seed.sql.
-- Повторный запуск безопасен: старая история удаляется в начале скрипта.
-- Выходные дни исключены, праздники не учитываются (данные синтетические).
-- =====================================================================

BEGIN;

-- Пересоздаём только историю; сегодняшний снимок из seed.sql не трогаем
DELETE FROM price_snapshots WHERE as_of_date < CURRENT_DATE;

WITH calendar AS (
    -- последние 30 будних дней до сегодняшнего
    SELECT day
    FROM (
        SELECT d::date AS day,
               row_number() OVER (ORDER BY d DESC) AS recency
        FROM generate_series(CURRENT_DATE - 45, CURRENT_DATE - 1, INTERVAL '1 day') AS g(d)
        WHERE EXTRACT(ISODOW FROM d) < 6
    ) ranked
    WHERE recency <= 30
),
base AS (
    -- сегодняшний снимок каждого инструмента — точка привязки ряда
    SELECT instrument_id, price AS cur_price, volume AS cur_volume
    FROM price_snapshots
    WHERE as_of_date = CURRENT_DATE
),
steps AS (
    -- дневная доходность (в долях): детерминированная комбинация синусов
    -- со своей фазой у каждого инструмента, амплитуда ~±2.5% в день
    SELECT
        b.instrument_id,
        c.day,
        ROW_NUMBER() OVER (PARTITION BY b.instrument_id ORDER BY c.day) AS i,
        0.018 * sin((ROW_NUMBER() OVER (PARTITION BY b.instrument_id ORDER BY c.day)
                     + b.instrument_id * 5)::numeric * 0.7)
      + 0.009 * sin((ROW_NUMBER() OVER (PARTITION BY b.instrument_id ORDER BY c.day)
                     * 2.3 + b.instrument_id * 1.3)::numeric) AS r
    FROM base b
    CROSS JOIN calendar c
),
anchored AS (
    -- цена i дней назад = сегодняшняя * exp(-сумма доходностей от i-го дня
    -- до конца ряда): последний исторический день стыкуется с сегодняшней
    -- ценой практически без скачка
    SELECT
        s.instrument_id,
        s.day,
        s.i,
        s.r,
        exp(-SUM(s.r) OVER (PARTITION BY s.instrument_id ORDER BY s.day DESC
                            ROWS UNBOUNDED PRECEDING)) AS factor
    FROM steps s
)
INSERT INTO price_snapshots (instrument_id, price, change_percent, volume, as_of_date)
SELECT
    a.instrument_id,
    ROUND((b.cur_price * a.factor)::numeric, 4) AS price,
    ROUND((a.r * 100)::numeric, 2) AS change_percent,
    ROUND(b.cur_volume * (0.6 + 0.5 * abs(sin((a.i * 11 + b.instrument_id * 7)::numeric / 3.0))))::bigint AS volume,
    a.day AS as_of_date
FROM anchored a
JOIN base b USING (instrument_id)
ORDER BY a.instrument_id, a.day;

COMMIT;

-- Проверка: должно получиться 18 инструментов × 30 дней = 540 строк истории
SELECT count(*)                     AS history_rows,
       count(DISTINCT instrument_id) AS instruments,
       min(as_of_date)              AS from_date,
       max(as_of_date)              AS to_date
FROM price_snapshots
WHERE as_of_date < CURRENT_DATE;
