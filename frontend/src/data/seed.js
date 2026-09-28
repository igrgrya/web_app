// Захардкоженные ("seed") данные для лабораторной работы №1.
//
// В следующих лабораторных работах эти массивы заменятся на реальные
// запросы к backend (FastAPI + PostgreSQL, схема которой лежит в
// db/schema.sql). Поэтому форма объектов здесь специально повторяет
// будущие таблицы БД (те же поля, тот же смысл), чтобы миграция на
// реальный API была простой заменой источника данных, а не переписыванием
// компонентов.

// Биржи, на которых торгуются инструменты.
export const exchanges = [
  { id: 1, code: 'MOEX', name: 'Московская биржа', country: 'Россия', timezone: 'Europe/Moscow', websiteUrl: 'https://www.moex.com' },
  { id: 2, code: 'NASDAQ', name: 'NASDAQ Stock Market', country: 'США', timezone: 'America/New_York', websiteUrl: 'https://www.nasdaq.com' },
  { id: 3, code: 'NYSE', name: 'New York Stock Exchange', country: 'США', timezone: 'America/New_York', websiteUrl: 'https://www.nyse.com' },
]

// Отраслевые секторы для классификации инструментов.
export const sectors = [
  { id: 1, name: 'Технологии' },
  { id: 2, name: 'Финансы' },
  { id: 3, name: 'Энергетика' },
  { id: 4, name: 'Потребительский сектор' },
  { id: 5, name: 'Здравоохранение' },
]

// Каталог инструментов (акции/ETF/фонды). Цена — условное "текущее"
// значение, зафиксированное вручную (аналог price_snapshots из БД).
export const instruments = [
  { id: 1, ticker: 'SBER', name: 'Сбербанк', type: 'stock', exchangeId: 1, sectorId: 2, currency: 'RUB', description: 'Крупнейший банк России, предоставляет полный спектр банковских услуг.', listedDate: '1996-01-01', price: 285.5, changePercent: 1.2, volume: 15000000 },
  { id: 2, ticker: 'GAZP', name: 'Газпром', type: 'stock', exchangeId: 1, sectorId: 3, currency: 'RUB', description: 'Крупнейшая газовая компания страны, добыча и транспортировка газа.', listedDate: '1996-10-28', price: 168.2, changePercent: -0.85, volume: 9800000 },
  { id: 3, ticker: 'LKOH', name: 'Лукойл', type: 'stock', exchangeId: 1, sectorId: 3, currency: 'RUB', description: 'Одна из крупнейших нефтяных компаний мира.', listedDate: '1995-04-25', price: 7150, changePercent: 0.4, volume: 1200000 },
  { id: 4, ticker: 'FXIT', name: 'FinEx Технологии ETF', type: 'etf', exchangeId: 1, sectorId: 1, currency: 'RUB', description: 'Биржевой фонд на сектор технологических компаний.', listedDate: '2013-11-27', price: 42.3, changePercent: 2.1, volume: 320000 },
  { id: 5, ticker: 'AAPL', name: 'Apple Inc.', type: 'stock', exchangeId: 2, sectorId: 1, currency: 'USD', description: 'Производитель электроники, программного обеспечения и цифровых сервисов.', listedDate: '1980-12-12', price: 227.8, changePercent: 0.55, volume: 48000000 },
  { id: 6, ticker: 'MSFT', name: 'Microsoft Corporation', type: 'stock', exchangeId: 2, sectorId: 1, currency: 'USD', description: 'Разработчик операционных систем, офисного ПО и облачных сервисов.', listedDate: '1986-03-13', price: 415.1, changePercent: 0.9, volume: 21000000 },
  { id: 7, ticker: 'SPY', name: 'SPDR S&P 500 ETF Trust', type: 'etf', exchangeId: 3, sectorId: 2, currency: 'USD', description: 'Фонд, отслеживающий индекс широкого рынка S&P 500.', listedDate: '1993-01-22', price: 560.75, changePercent: 0.3, volume: 60000000 },
  { id: 8, ticker: 'JNJ', name: 'Johnson & Johnson', type: 'stock', exchangeId: 3, sectorId: 5, currency: 'USD', description: 'Фармацевтика, медицинские изделия и товары для здоровья.', listedDate: '1944-09-25', price: 158.4, changePercent: -0.15, volume: 6500000 },
]

// Новостная лента.
export const news = [
  { id: 1, title: 'Сбербанк отчитался о рекордной прибыли', body: 'Банк опубликовал квартальную отчётность, превысив ожидания аналитиков рынка. Чистая прибыль выросла на фоне роста кредитного портфеля и комиссионных доходов.', publishedAt: '2026-09-20', relatedInstrumentId: 1 },
  { id: 2, title: 'Газпром объявил дивиденды', body: 'Совет директоров рекомендовал выплату дивидендов по итогам года. Финальное решение будет принято на годовом собрании акционеров.', publishedAt: '2026-09-18', relatedInstrumentId: 2 },
  { id: 3, title: 'Apple представила новый продукт', body: 'Компания анонсировала обновление линейки устройств на ежегодной презентации, включая улучшенные характеристики и новые функции.', publishedAt: '2026-09-15', relatedInstrumentId: 5 },
  { id: 4, title: 'S&P 500 обновил исторический максимум', body: 'Индекс закрылся на новом рекордном уровне на фоне позитивной макроэкономической статистики и сильных корпоративных отчётов.', publishedAt: '2026-09-12', relatedInstrumentId: 7 },
  { id: 5, title: 'Обзор рынка: итоги недели', body: 'Общий обзор движения основных индексов и инструментов за прошедшую неделю: что выросло, что просело и почему.', publishedAt: '2026-09-10', relatedInstrumentId: null },
]

// Каталог полезных внешних ссылок — сервис "служба каталогов".
export const externalLinks = [
  { id: 1, title: 'Московская биржа', url: 'https://www.moex.com', category: 'Биржи', description: 'Официальный сайт Московской биржи.' },
  { id: 2, title: 'NASDAQ', url: 'https://www.nasdaq.com', category: 'Биржи', description: 'Официальный сайт биржи NASDAQ.' },
  { id: 3, title: 'NYSE', url: 'https://www.nyse.com', category: 'Биржи', description: 'Официальный сайт Нью-Йоркской фондовой биржи.' },
  { id: 4, title: 'Банк России', url: 'https://www.cbr.ru', category: 'Регуляторы', description: 'Центральный банк Российской Федерации.' },
  { id: 5, title: 'SEC.gov', url: 'https://www.sec.gov', category: 'Регуляторы', description: 'Комиссия по ценным бумагам и биржам США.' },
  { id: 6, title: 'РБК Инвестиции', url: 'https://quote.rbc.ru', category: 'Новости', description: 'Финансовые новости и котировки.' },
]

// Календарь событий — сервис "календарь".
export const events = [
  { id: 1, title: 'Публикация отчётности Сбербанка', description: 'Ожидается публикация квартального отчёта.', eventDate: '2026-10-05', relatedInstrumentId: 1 },
  { id: 2, title: 'Дивидендная отсечка Газпрома', description: 'Последний день покупки акций для получения дивидендов.', eventDate: '2026-10-12', relatedInstrumentId: 2 },
  { id: 3, title: 'Отчётность Apple за квартал', description: 'Публикация финансовых результатов компании.', eventDate: '2026-10-19', relatedInstrumentId: 5 },
  { id: 4, title: 'Заседание ФРС США', description: 'Решение по ключевой ставке.', eventDate: '2026-10-28', relatedInstrumentId: null },
]

// Начальное состояние форума — одна тема с двумя ответами. Дальше
// пользователь может добавлять свои темы/ответы, они сохранятся в
// localStorage (см. src/lib/storage.js).
export const initialForumTopics = [
  {
    id: 1,
    title: 'Как выбрать первый ETF?',
    authorName: 'Дмитрий',
    createdAt: '2026-09-14',
    replies: [
      { id: 1, authorName: 'Ирина', message: 'Начните с широких индексных фондов вроде SPY.', createdAt: '2026-09-14' },
      { id: 2, authorName: 'Дмитрий', message: 'Спасибо, посмотрю подробнее про диверсификацию.', createdAt: '2026-09-15' },
    ],
  },
]

// Начальное состояние гостевой книги.
export const initialGuestbookEntries = [
  { id: 1, authorName: 'Алексей', email: 'alexey@example.com', message: 'Отличный сайт, удобно следить за фондами!', createdAt: '2026-09-10' },
  { id: 2, authorName: 'Мария', email: '', message: 'Было бы здорово добавить больше валютных пар.', createdAt: '2026-09-11' },
]

// Единственный активный опрос — сервис "голосование".
export const initialPoll = {
  question: 'Какой класс активов вам интереснее всего?',
  options: [
    { id: 1, text: 'Акции', votes: 3 },
    { id: 2, text: 'ETF / фонды', votes: 5 },
    { id: 3, text: 'Облигации', votes: 1 },
  ],
}

export function findInstrumentByTicker(ticker) {
  return instruments.find((item) => item.ticker.toLowerCase() === String(ticker).toLowerCase())
}

export function findExchange(id) {
  return exchanges.find((exchange) => exchange.id === id)
}

export function findSector(id) {
  return sectors.find((sector) => sector.id === id)
}

export function findNewsById(id) {
  return news.find((item) => item.id === Number(id))
}
