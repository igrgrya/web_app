-- =====================================================================
-- funds_lab — история цен за 30 торговых дней (для лабораторной работы №3)
-- =====================================================================
-- Дополняет db/seed.sql: для каждого инструмента создаёт по 30 дневных
-- снимков цены (будние дни) ПЕРЕД последней датой данных. Ряд привязан к
-- последней базовой цене из seed.sql и идёт «назад» детерминированным
-- псевдослучайным обходом (комбинация синусов, без random()) —
-- результат одинаков при каждом запуске. Эти данные нужны линейному
-- графику динамики цены в приложении лабораторной №3.
--
-- change_percent везде считается ИЗ ФАКТИЧЕСКИХ ЦЕН (доходность к
-- предыдущему торговому дню): у исторических дней — через LAG по ряду,
-- у базового снимка — UPDATE по последнему историческому дню.
-- Поэтому значения seed.sql для базового change_percent здесь
-- пересчитываются: источником истины становится связка «цены + история».
-- У самого старого исторического дня предыдущего нет — change_percent
-- у него NULL (в UI не отображается).
--
-- Порядок выполнения: ПОСЛЕ db/schema.sql и db/seed.sql.
-- Повторный запуск безопасен: старая история удаляется в начале скрипта.
-- Выходные дни исключены, праздники не учитываются (данные синтетические).
-- =====================================================================

BEGIN;

-- Сериализуем перегенерацию и фиксируем дату самого свежего набора.
LOCK TABLE price_snapshots IN SHARE ROW EXCLUSIVE MODE;
CREATE TEMP TABLE history_anchor ON COMMIT DROP AS
SELECT max(as_of_date) AS anchor_date FROM price_snapshots;
DO $$
BEGIN
    IF (SELECT anchor_date FROM history_anchor) IS NULL OR EXISTS (
        SELECT 1 FROM instruments i
        WHERE NOT EXISTS (
            SELECT 1 FROM price_snapshots p
            WHERE p.instrument_id = i.id
              AND p.as_of_date = (SELECT anchor_date FROM history_anchor)
              AND p.price > 0
        )
    ) THEN
        RAISE EXCEPTION 'Для генерации нужен полный набор положительных базовых цен. Данные не изменены.';
    END IF;
END $$;

-- Пересоздаём только историю; базовый снимок цены из seed.sql не трогаем
DELETE FROM price_snapshots WHERE as_of_date < (SELECT anchor_date FROM history_anchor);

WITH calendar AS (
    -- последние 30 будних дней до базового
    SELECT day
    FROM (
        SELECT d::date AS day,
               row_number() OVER (ORDER BY d DESC) AS recency
        FROM generate_series((SELECT anchor_date FROM history_anchor) - 45, (SELECT anchor_date FROM history_anchor) - 1, INTERVAL '1 day') AS g(d)
        WHERE EXTRACT(ISODOW FROM d) < 6
    ) ranked
    WHERE recency <= 30
),
base AS (
    -- базовый снимок каждого инструмента — точка привязки ряда
    SELECT instrument_id, price AS cur_price, volume AS cur_volume
    FROM price_snapshots
    WHERE as_of_date = (SELECT anchor_date FROM history_anchor)
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
    -- цена i дней назад = базовая * exp(-сумма доходностей от i-го дня
    -- до конца ряда): последний исторический день стыкуется с базовой
    -- ценой практически без скачка
    SELECT
        s.instrument_id,
        s.day,
        s.i,
        exp(-SUM(s.r) OVER (PARTITION BY s.instrument_id ORDER BY s.day DESC
                            ROWS UNBOUNDED PRECEDING)) AS factor
    FROM steps s
),
priced AS (
    SELECT
        a.instrument_id,
        a.day,
        ROUND((b.cur_price * a.factor)::numeric, 4) AS price,
        ROUND(b.cur_volume * (0.6 + 0.5 * abs(sin((a.i * 11 + b.instrument_id * 7)::numeric / 3.0))))::bigint AS volume
    FROM anchored a
    JOIN base b USING (instrument_id)
),
withprev AS (
    -- предыдущий торговый день внутри сгенерированного ряда
    SELECT p.*,
           LAG(p.price) OVER (PARTITION BY p.instrument_id ORDER BY p.day) AS prev_price
    FROM priced p
)
INSERT INTO price_snapshots (instrument_id, price, change_percent, volume, as_of_date)
SELECT
    instrument_id,
    price,
    CASE
        WHEN prev_price IS NULL THEN NULL                      -- самый старый день ряда
        ELSE ROUND((price / prev_price - 1) * 100, 2)          -- доходность к предыдущему дню
    END,
    volume,
    day
FROM withprev
ORDER BY instrument_id, day;

-- Базовый change_percent = фактический сдвиг от последнего исторического дня
UPDATE price_snapshots ps
SET change_percent = ROUND((ps.price / h.price - 1) * 100, 2)
FROM (
    SELECT DISTINCT ON (instrument_id) instrument_id, price
    FROM price_snapshots
    WHERE as_of_date < (SELECT anchor_date FROM history_anchor)
    ORDER BY instrument_id, as_of_date DESC
) h
WHERE ps.instrument_id = h.instrument_id
  AND ps.as_of_date = (SELECT anchor_date FROM history_anchor);

COMMIT;

-- Проверка: 540 строк истории (18 × 30) и полная стыковка процентов с ценами
SELECT count(*)                     AS history_rows,
       count(DISTINCT instrument_id) AS instruments,
       min(as_of_date)              AS from_date,
       max(as_of_date)              AS to_date
FROM price_snapshots
WHERE as_of_date < (SELECT max(as_of_date) FROM price_snapshots);

SELECT count(*) AS inconsistent_percent
FROM price_snapshots ps
JOIN price_snapshots ps2
  ON ps2.instrument_id = ps.instrument_id
 AND ps2.as_of_date = (SELECT max(as_of_date) FROM price_snapshots
                       WHERE instrument_id = ps.instrument_id AND as_of_date < ps.as_of_date)
WHERE ps.change_percent IS NULL
   OR abs(ROUND((ps.price / ps2.price - 1) * 100, 2) - ps.change_percent) > 0.02;
