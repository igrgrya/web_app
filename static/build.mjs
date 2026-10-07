/* =====================================================================
   Funds Lab — генератор статического сайта (лабораторная работа №1).
   Запуск:  node static/build.mjs
   Результат: папка site/ с готовыми .html-файлами, стилями и скриптами.
   Данные берутся из frontend/src/data/seed.js (общий источник с
   React-версией), поэтому страницы всегда совпадают по содержанию.
   ===================================================================== */

import { createHash } from 'node:crypto'
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  exchanges,
  sectors,
  instruments,
  news,
  externalLinks,
  events,
  initialForumTopics,
  initialGuestbookEntries,
  initialPoll,
} from '../frontend/src/data/seed.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const OUT = join(ROOT, 'site')
const SRC = join(__dirname, 'src')

const SITE_URL = process.env.SITE_URL || 'https://igrgrya.github.io/web_app/'

// Версия ассетов (app.js/styles.css/data.js): меняется при изменении
// содержимого, поэтому браузер не подхватит устаревший файл из кэша
// GitHub Pages (иначе счётчик и другие правки "не применялись").
const ASSET_VERSION = createHash('sha1')
  .update(
    JSON.stringify({
      exchanges, sectors, instruments, news, externalLinks, events,
      initialForumTopics, initialGuestbookEntries, initialPoll,
    }),
  )
  .update(readFileSync(join(SRC, 'app.js'), 'utf8'))
  .update(readFileSync(join(SRC, 'styles.css'), 'utf8'))
  .update(readFileSync(join(SRC, '../assets/hero.png')))
  .digest('hex')
  .slice(0, 10)

/* --- Вспомогательные функции ----------------------------------------- */

function esc(value) {
  return String(value === null || value === undefined ? '' : value).replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[ch]))
}

function findExchange(id) {
  return exchanges.find((e) => e.id === id)
}

function findInstrument(id) {
  return instruments.find((i) => i.id === id)
}

/* Записи о страницах: нужны для статистики и sitemap.xml. */
const registry = []

function register(id, label, url) {
  registry.push({ id, label, url })
}

/* --- Общий каркас страницы -------------------------------------------- */

/* Единое меню из 16 пунктов: 10 статических страниц + сервисные
   страницы и страницы-заглушки лабораторных работ. */
const NAV = [
  { id: 'index', label: 'Главная', url: 'index.html' },
  { id: 'news', label: 'Новости', url: 'news.html' },
  { id: 'exchanges', label: 'Биржи', url: 'exchanges.html' },
  { id: 'history', label: 'История', url: 'history.html' },
  { id: 'beginners', label: 'Новичку', url: 'beginners.html' },
  { id: 'glossary', label: 'Глоссарий', url: 'glossary.html' },
  { id: 'risks', label: 'Риски', url: 'risks.html' },
  { id: 'links', label: 'Ссылки', url: 'links.html' },
  { id: 'contacts', label: 'Контакты', url: 'contacts.html' },
  { id: 'about', label: 'О проекте', url: 'about.html' },
  { id: 'search', label: 'Поиск', url: 'search.html' },
  { id: 'forum', label: 'Форум', url: 'forum.html' },
  { id: 'services', label: 'Сервисы', url: 'services.html' },
  { id: 'xml', label: 'XML', url: 'xml.html' },
  { id: 'db', label: 'БД', url: 'db.html' },
  { id: 'rss', label: 'RSS', url: 'rss.html' },
]

/* Сервисные ссылки ведут на якоря страниц «Сервисы» и «Форум». */
const FOOTER_LINKS = [
  { id: 'guestbook', label: 'Гостевая книга', url: 'forum.html#guestbook' },
  { id: 'poll', label: 'Опрос', url: 'services.html#poll' },
  { id: 'converter', label: 'Конвертер валют', url: 'services.html#converter' },
  { id: 'calculator', label: 'Инвестиционный калькулятор', url: 'services.html#calculator' },
  { id: 'links', label: 'Ссылки', url: 'links.html' },
  { id: 'calendar', label: 'Календарь событий', url: 'services.html#calendar' },
  { id: 'stats', label: 'Статистика посещений', url: 'services.html#stats' },
]

function navLink(item, active) {
  const current = item.id === active ? ' aria-current="page"' : ''
  return `<li><a href="${item.url}"${current}>${esc(item.label)}</a></li>`
}

function header(active) {
  return `<header class="site-header">
    <div class="site-header-inner">
      <a class="brand" href="index.html">Funds Lab</a>
      <form class="site-search" action="search.html" method="get" role="search">
        <input type="search" name="q" placeholder="Поиск по сайту…" aria-label="Поиск по сайту">
        <button type="submit">Найти</button>
      </form>
      <div class="informers">
        <div class="informer informer--weather" id="weather-widget">Погода: загрузка…</div>
        <div class="informer informer--currency" id="currency-widget">Курсы валют: загрузка…</div>
      </div>
    </div>
    <div class="nav-main">
      <nav aria-label="Основная навигация">
        <ul class="nav-list">${NAV.map((item) => navLink(item, active)).join('')}</ul>
      </nav>
    </div>
  </header>`
}

function footer(active) {
  return `<footer class="site-footer">
    <nav aria-label="Дополнительные разделы">
      <ul class="nav-list nav-list--footer">${FOOTER_LINKS.map((item) => navLink(item, active)).join('')}</ul>
    </nav>
    <p class="visit-counter">Всего посещений сайта: <span data-visit-total>0</span></p>
    <p class="author-note">Учебный проект по дисциплине «Веб-программирование». Автор: студент группы БИЗ-Б23, Корнюшкин Игорь.</p>
  </footer>`
}

function page({ id, title, description, keywords, body, extraScripts = '' }) {
  const html = `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(title)} — Funds Lab</title>
  <meta name="description" content="${esc(description)}">
  <meta name="keywords" content="${esc(keywords)}">
  <meta name="author" content="Funds Lab">
  <meta property="og:title" content="${esc(title)} — Funds Lab">
  <meta property="og:description" content="${esc(description)}">
  <meta property="og:type" content="website">
  <link rel="icon" type="image/svg+xml" href="assets/favicon.svg?v=${ASSET_VERSION}">
  <link rel="stylesheet" href="styles.css?v=${ASSET_VERSION}">
</head>
<body data-page="${esc(id)}">
  <div class="site-shell">
    ${header(id)}
    <main class="site-main">
${body}
    </main>
    ${footer(id)}
  </div>
  <script src="data.js?v=${ASSET_VERSION}"></script>
${extraScripts}  <script src="app.js?v=${ASSET_VERSION}"></script>
</body>
</html>
`
  return html
}

/* --- Общие фрагменты -------------------------------------------------- */

function guestbookItems(entries) {
  return entries
    .map(
      (entry) => `<li class="card"><p>${esc(entry.message)}</p>
        <p class="muted">${esc(entry.authorName)} &middot; ${esc(entry.createdAt)}</p></li>`,
    )
    .join('\n      ')
}

function forumTopicBlocks(topics) {
  return topics
    .map(
      (topic) => `<details class="forum-topic-block" id="topic-${esc(topic.id)}">
          <summary><strong>${esc(topic.title)}</strong> — ${esc(topic.authorName)}, ${esc(topic.createdAt)} &middot; ответов: ${topic.replies ? topic.replies.length : 0}</summary>
          <ul class="card-list">
            ${(topic.replies || [])
              .map(
                (reply) => `<li class="card"><p>${esc(reply.message)}</p>
              <p class="muted">${esc(reply.authorName)} &middot; ${esc(reply.createdAt)}</p></li>`,
              )
              .join('\n            ')}
            ${topic.replies && topic.replies.length ? '' : '<li class="empty-state">Ответов пока нет.</li>'}
          </ul>
          <form class="stacked-form reply-form" data-topic-id="${esc(topic.id)}">
            <label>Ваше имя <input name="authorName" required></label>
            <label>Сообщение <textarea name="message" rows="3" required></textarea></label>
            <button type="submit">Ответить</button>
          </form>
        </details>`,
    )
    .join('\n      ')
}

function forumPage() {
  const body = `      <h1>Форум</h1>
      <p class="lead">Обсуждайте фонды, акции и инвестиционные стратегии с другими читателями сайта.</p>

      <div id="forum-list">
      ${forumTopicBlocks(initialForumTopics)}
      </div>

      <h2>Создать новую тему</h2>
      <form class="stacked-form" id="forum-form">
        <label>Ваше имя
          <input name="authorName" required>
        </label>
        <label>Заголовок темы
          <input name="title" required>
        </label>
        <button type="submit">Создать тему</button>
      </form>

      <h2 id="guestbook">Гостевая книга</h2>
      <p class="lead">Напишите нам, что думаете о сайте — сообщение сразу появится в списке ниже.</p>

      <form class="stacked-form" id="guestbook-form">
        <label>Имя
          <input name="authorName" required>
        </label>
        <label>Email (необязательно)
          <input type="email" name="email">
        </label>
        <label>Сообщение
          <textarea name="message" rows="4" required></textarea>
        </label>
        <button type="submit">Оставить запись</button>
      </form>

      <h3>Записи посетителей</h3>
      <ul class="card-list" id="guestbook-list">
      ${guestbookItems(initialGuestbookEntries)}
      </ul>`

  register('forum', 'Форум', 'forum.html')
  return page({
    id: 'forum',
    title: 'Форум',
    description: 'Обсуждения инвесторов и гостевая книга: темы про фонды, акции и стратегии на сайте Funds Lab.',
    keywords: 'форум, гостевая книга, обсуждение, инвестиции, фонды, акции, отзывы',
    body,
  })
}

function pollInitial() {
  const total = initialPoll.options.reduce((sum, option) => sum + option.votes, 0)
  const items = initialPoll.options
    .map((option) => `<li><button type="button" data-option="${option.id}">${esc(option.text)}</button></li>`)
    .join('\n        ')
  return `<p class="lead" data-poll-question>${esc(initialPoll.question)}</p>
      <ul class="poll-options">
        ${items}
      </ul>
      <p class="muted" data-poll-note>Всего голосов: ${total}.</p>`
}

/* --- Страницы --------------------------------------------------------- */

function homePage() {
  const latestNews = news
    .slice(0, 3)
    .map(
      (item) => `<li class="card">
          <a href="news.html#news-${esc(item.id)}">${esc(item.title)}</a>
          <p class="muted">${esc(item.publishedAt)}</p>
        </li>`,
    )
    .join('\n          ')

  const body = `      <div class="hero-block">
        <img src="assets/hero.png?v=${ASSET_VERSION}" alt="Иллюстрация: график роста биржевых инструментов" width="170" height="179" class="hero-image">
        <div>
          <h1>Funds Lab</h1>
          <p class="lead">Учебный проект по дисциплине «Веб-программирование»: интерактивный сайт о фондах, акциях и биржах, с новостями рынка, биржами и сервисами для сообщества инвесторов.</p>
        </div>
      </div>

      <nav class="toc" aria-label="Содержание страницы">
        <h2>Содержание</h2>
        <ul>
          <li><a href="#latest-news">Последние новости</a></li>
        </ul>
      </nav>

      <section id="latest-news">
        <h2>Последние новости</h2>
        <ul class="card-list">
        ${latestNews}
        </ul>
        <p><a href="news.html">Все новости →</a></p>
      </section>`

  register('index', 'Главная', 'index.html')
  return page({
    id: 'index',
    title: 'Главная',
    description:
      'Funds Lab — учебный сайт о фондах, акциях и биржах: каталог инструментов, новости рынка и сервисы для инвесторов.',
    keywords: 'фонды, акции, биржи, инвестиции, ETF, Funds Lab',
    body,
  })
}

/* Часы торгов сессий: MOEX — пн–пт 10:00–18:45, NASDAQ и NYSE — пн–пт 9:30–16:00 (местное время биржи). */
const SESSION_HOURS = {
  MOEX: ['10:00', '18:45'],
  NASDAQ: ['09:30', '16:00'],
  NYSE: ['09:30', '16:00'],
}

function exchangesPage() {
  const rows = exchanges
    .map((exchange) => {
      const count = instruments.filter((item) => item.exchangeId === exchange.id).length
      return `<tr>
          <td>${esc(exchange.code)}</td>
          <td>${esc(exchange.name)}</td>
          <td>${esc(exchange.country)}</td>
          <td>${esc(exchange.timezone)}</td>
          <td>${count}</td>
          <td><a href="${esc(exchange.websiteUrl)}" target="_blank" rel="noopener">${esc(exchange.websiteUrl)}</a></td>
        </tr>`
    })
    .join('\n        ')

  const clockCards = exchanges
    .map((exchange) => {
      const hours = SESSION_HOURS[exchange.code] || ['00:00', '00:00']
      return `<li class="card clock-card" data-tz="${esc(exchange.timezone)}" data-open="${hours[0]}" data-close="${hours[1]}">
          <h3>${esc(exchange.name)}</h3>
          <p class="clock-time">--:--</p>
          <p class="session-badge">…</p>
        </li>`
    })
    .join('\n        ')

  const body = `      <h1>Биржи</h1>
      <p class="lead">Площадки, на которых торгуются инструменты из каталога сайта.</p>

      <section id="clocks">
        <h2>Сейчас на биржах</h2>
        <ul class="clock-grid">
        ${clockCards}
        </ul>
      </section>

      <table class="data-table">
        <caption>Биржи каталога</caption>
        <thead>
          <tr>
            <th scope="col">Код</th>
            <th scope="col">Название</th>
            <th scope="col">Страна</th>
            <th scope="col">Часовой пояс</th>
            <th scope="col">Инструментов в каталоге</th>
            <th scope="col">Сайт</th>
          </tr>
        </thead>
        <tbody>
        ${rows}
        </tbody>
      </table>`

  register('exchanges', 'Биржи', 'exchanges.html')
  return page({
    id: 'exchanges',
    title: 'Биржи',
    description: 'Список бирж, представленных в каталоге Funds Lab, с количеством торгуемых инструментов.',
    keywords: 'биржи, MOEX, NASDAQ, NYSE, фондовый рынок',
    body,
  })
}

function historyPage() {
  const rows = [
    ['1602', 'Амстердам', 'Открылась первая в мире фондовая биржа; здесь начали торговаться акции Ост-Индской компании.'],
    ['1698', 'Лондон', 'Кофейня Джонатана в лондонском Сити — предшественница Лондонской фондовой биржи (LSE).'],
    ['1792', 'Нью-Йорк', '«Соглашение под платаном», подписанное 24 брокерами, — считается датой основания NYSE.'],
    ['1878', 'Токио', 'Основана Токийская фондовая биржа — будущий центр азиатского фондового рынка.'],
    ['1971', 'Нью-Йорк', 'Запущена NASDAQ — первая в мире электронная фондовая биржа.'],
    ['1992', 'Москва', 'Начала работу ММВБ — Московская межбанковская валютная биржа.'],
    ['1995', 'Москва', 'Заработала РТС — Российская торговая система.'],
    ['2011', 'Москва', 'Слияние ММВБ и РТС: образована Московская биржа (MOEX).'],
  ]
    .map(
      ([year, place, text]) => `<tr>
          <td>${esc(year)}</td>
          <td>${esc(place)}</td>
          <td>${esc(text)}</td>
        </tr>`,
    )
    .join('\n        ')

  const body = `      <h1>История бирж</h1>
      <p class="lead">Ключевые вехи в развитии фондовых бирж мира — от первой биржи в Амстердаме до Московской биржи.</p>

      <table class="data-table">
        <caption>Основные даты истории бирж</caption>
        <thead>
          <tr>
            <th scope="col">Год</th>
            <th scope="col">Биржа</th>
            <th scope="col">Событие</th>
          </tr>
        </thead>
        <tbody>
        ${rows}
        </tbody>
      </table>

      <p><a href="exchanges.html">Биржи, представленные на сайте →</a></p>`

  register('history', 'История бирж', 'history.html')
  return page({
    id: 'history',
    title: 'История бирж',
    description: 'Ключевые даты истории фондовых бирж: Амстердам, Лондон, Нью-Йорк, NASDAQ, ММВБ, РТС и Московская биржа.',
    keywords: 'история бирж, фондовая биржа, NASDAQ, NYSE, ММВБ, РТС, Московская биржа',
    body,
  })
}

function glossaryPage() {
  const terms = [
    ['Акция', 'Долевая ценная бумага: даёт владельцу долю в компании, право на часть прибыли (дивиденды) и участие в управлении.'],
    ['Облигация', 'Долговая ценная бумага: инвестор даёт компании или государству деньги в долг и получает проценты (купон) и номинал к погашению.'],
    ['ETF', 'Биржевой инвестиционный фонд (Exchange-Traded Fund): акции фонда торгуются на бирже, а внутри — готовый портфель из десятков и сотен инструментов.'],
    ['ПИФ', 'Паевой инвестиционный фонд: объединённые средства вкладчиков, которыми управляет управляющая компания; доля инвестора — пай.'],
    ['Дивиденды', 'Часть прибыли компании, которую она распределяет между акционерами; обычно выплачиваются деньгами раз в квартал или год.'],
    ['Дивидендная отсечка', 'Дата, после которой покупатель акции уже не получит ближайшие дивиденды; в этот день цена акции обычно снижается на размер выплаты.'],
    ['Капитализация', 'Рыночная стоимость всех акций компании: текущая цена, умноженная на количество акций в обращении.'],
    ['Тикер', 'Краткое буквенное обозначение инструмента на бирже, например SBER или GAZP.'],
    ['Ликвидность', 'Способность быстро купить или продать инструмент по рыночной цене без большой потери в стоимости.'],
    ['Волатильность', 'Размах колебаний цены инструмента: чем выше волатильность, тем сильнее цена меняется за день и тем выше риск.'],
    ['Фондовый индекс', 'Показатель состояния рынка или его части: корзина акций (например, индекс Мосбиржи или S&P 500), по изменению стоимости которой судят о рынке.'],
    ['IPO', 'Первичное публичное размещение акций: компания впервые выходит на биржу и продаёт акции широкому кругу инвесторов.'],
    ['Брокер', 'Лицензированный посредник между инвестором и биржей: по поручению клиента покупает и продаёт ценные бумаги.'],
    ['Портфель', 'Набор всех инструментов инвестора — акции, облигации, фонды и деньги на счёте, рассматриваемые как единое целое.'],
    ['Диверсификация', 'Распределение денег между разными инструментами и рынками, чтобы падение одного актива не обвалило весь портфель.'],
  ]
    .map(
      ([term, definition]) => `<details class="glossary-item">
          <summary><strong>${esc(term)}</strong></summary>
          <p>${esc(definition)}</p>
        </details>`,
    )
    .join('\n      ')

  const body = `      <h1>Глоссарий</h1>
      <p class="lead">Основные термины фондового рынка, которые встречаются на страницах сайта. Нажмите на термин, чтобы раскрыть определение.</p>
      ${terms}`

  register('glossary', 'Глоссарий', 'glossary.html')
  return page({
    id: 'glossary',
    title: 'Глоссарий',
    description: 'Глоссарий Funds Lab: акции, облигации, ETF, дивиденды, ликвидность, волатильность и другие термины фондового рынка.',
    keywords: 'глоссарий, термины, акция, облигация, ETF, дивиденды, ликвидность, волатильность, IPO',
    body,
  })
}

function beginnersPage() {
  const steps = [
    'Определите цель и срок: на что копите (квартира, образование, пассивный доход) и через сколько лет понадобятся деньги. От срока зависит выбор инструментов.',
    'Соберите финансовую подушку — 3–6 месяцев расходов на отдельном вкладе, чтобы не приходилось продавать инвестиции в неудачный момент.',
    'Выберите брокера: сравните комиссии, удобство приложения и наличие лицензии Банка России.',
    'Откройте брокерский счёт (или ИИС) — обычно это можно сделать онлайн за несколько дней.',
    'Начинайте с широкой диверсификации: индексные фонды и ETF вместо ставок на одну-две акции.',
    'Инвестируйте регулярно: фиксированная сумма каждый месяц работает лучше попыток «поймать момент».',
    'Следите за издержками — комиссии съедают доходность — и раз в год ребалансируйте портфель.',
  ]
    .map((step) => `<li>${esc(step)}</li>`)
    .join('\n          ')

  const body = `      <h1>С чего начать инвестору</h1>
      <p class="lead">Семь простых шагов для тех, кто только начинает разбираться в инвестициях.</p>

      <ol class="steps-list">
          ${steps}
      </ol>

      <p class="muted">Материал носит образовательный характер и не является инвестиционной рекомендацией.</p>`

  register('beginners', 'Новичку', 'beginners.html')
  return page({
    id: 'beginners',
    title: 'Новичку',
    description: 'С чего начать инвестору: цель и срок, финансовая подушка, выбор брокера, диверсификация и регулярные инвестиции.',
    keywords: 'новичку, с чего начать, инвестиции, подушка безопасности, брокер, диверсификация',
    body,
  })
}

function risksPage() {
  const riskCards = [
    ['Рыночный риск', 'Цены акций и фондов падают вместе с рынком: кризисы, санкции, паника инвесторов. Диверсификация и длинный горизонт смягчают, но не отменяют этот риск.'],
    ['Валютный риск', 'Доходность активов в иностранной валюте для рублёвого инвестора зависит ещё и от курса: укрепление рубля снижает результат.'],
    ['Кредитный риск', 'Эмитент облигации может не выплатить купоны или номинал. У компаний с низким рейтингом доходность выше именно за этот риск.'],
    ['Инфляционный риск', 'Если доходность ниже инфляции, покупательная способность денег уменьшается, даже когда сумма на счёте растёт.'],
    ['Риск ликвидности', 'Некоторые инструменты сложно быстро продать по адекватной цене: мало покупателей и широкие спреды.'],
    ['Процентный риск', 'Изменение ключевой ставки двигает цены облигаций: при росте ставки ранее выпущенные облигации дешевеют.'],
  ]
    .map(
      ([title, text]) => `<li class="card">
          <h2>${esc(title)}</h2>
          <p>${esc(text)}</p>
        </li>`,
    )
    .join('\n        ')

  const body = `      <h1>Риски и доходность</h1>
      <p class="lead">Доходность и риск всегда идут в паре: чем выше обещанная доходность, тем больше шансы потерять часть вложений. Основные типы рисков, с которыми сталкивается частный инвестор:</p>

      <ul class="card-list">
        ${riskCards}
      </ul>`

  register('risks', 'Риски', 'risks.html')
  return page({
    id: 'risks',
    title: 'Риски и доходность',
    description: 'Основные риски частного инвестора: рыночный, валютный, кредитный, инфляционный, риск ликвидности и процентный.',
    keywords: 'риски, доходность, рыночный риск, валютный риск, кредитный риск, инфляция, ликвидность',
    body,
  })
}

function newsListPage() {
  const items = news
    .map(
      (item) => `<details class="news-item" id="news-${esc(item.id)}">
          <summary><strong>${esc(item.title)}</strong> <span class="muted">${esc(item.publishedAt)}</span></summary>
          <p>${esc(item.body)}</p>
        </details>`,
    )
    .join('\n      ')

  const body = `      <h1>Новости</h1>
      <p class="lead">Новости рынка фондов и акций: отчётности компаний, дивиденды, обзоры рынка.</p>
      <div id="news-list">
      ${items}
      </div>

      <h2 id="add-news">Добавить новость</h2>
      <form class="stacked-form" id="news-form">
        <label>Заголовок
          <input name="title" required>
        </label>
        <label>Текст
          <textarea name="body" rows="4" required></textarea>
        </label>
        <button type="submit">Опубликовать</button>
      </form>
      <p class="muted">Новость сохраняется в вашем браузере; в лабораторной работе №3 новости переедут в базу данных.</p>

      <h2>Подписка на рассылку</h2>
      <p class="lead">Оставьте email, чтобы получать сводку новостей рынка (в рамках лабораторной — без реальной отправки писем).</p>

      <form class="stacked-form" id="subscribe-form">
        <label>Email
          <input type="email" name="email" required>
        </label>
        <button type="submit">Подписаться</button>
      </form>

      <p class="success-state" id="subscribe-success" hidden>Спасибо! Вы подписаны на рассылку.</p>
      <p class="muted">Всего подписчиков: <span id="subscriber-count">0</span></p>`

  register('news', 'Новости', 'news.html')
  return page({
    id: 'news',
    title: 'Новости',
    description: 'Новости рынка фондов и акций: отчётности компаний, дивиденды, обзоры рынка.',
    keywords: 'новости, фонды, акции, дивиденды, рынок',
    body,
  })
}

function linksPage() {
  const linkCategories = [...new Set(externalLinks.map((link) => link.category))]
  const linkSections = linkCategories
    .map((category, i) => {
      const items = externalLinks
        .filter((link) => link.category === category)
        .map(
          (link) => `<li class="card">
            <a href="${esc(link.url)}" target="_blank" rel="noopener">${esc(link.title)}</a>
            <p class="muted">${esc(link.description)}</p>
          </li>`,
        )
        .join('\n          ')
      return `<section id="cat-${i}">
          <h2>${esc(category)}</h2>
          <ul class="card-list">
            ${items}
          </ul>
        </section>`
    })
    .join('\n      ')

  const body = `      <h1>Ссылки</h1>
      <p class="lead">Подборка внешних ресурсов, сгруппированных по категориям.</p>
      ${linkSections}`

  register('links', 'Ссылки', 'links.html')
  return page({
    id: 'links',
    title: 'Ссылки',
    description: 'Полезные ссылки для инвесторов: биржи, обучающие ресурсы и аналитика рынка.',
    keywords: 'ссылки, полезные ресурсы, биржи, обучение, аналитика, инвестиции',
    body,
  })
}

function searchPage() {
  const body = `      <h1>Поиск по сайту</h1>
      <p class="lead">Поиск по новостям и страницам Funds Lab по ключевому слову.</p>

      <form class="stacked-form" onsubmit="return false">
        <label>Ключевое слово
          <input type="search" id="search-input" placeholder="Например: Сбербанк, ETF, дивиденды">
        </label>
      </form>

      <div id="search-results"></div>`

  register('search', 'Поиск по сайту', 'search.html')
  return page({
    id: 'search',
    title: 'Поиск по сайту',
    description: 'Поиск по новостям и страницам сайта Funds Lab по ключевому слову.',
    keywords: 'поиск, поиск по сайту, новости, страницы',
    body,
    extraScripts: `  <script src="search-index.js?v=${ASSET_VERSION}"></script>\n`,
  })
}

function servicesPage() {
  const calendarSorted = [...events].sort((a, b) => a.eventDate.localeCompare(b.eventDate))
  const calendarRows = calendarSorted
    .map((event) => {
      const instrument = event.relatedInstrumentId ? findInstrument(event.relatedInstrumentId) : null
      const link = instrument ? esc(instrument.ticker) : '—'
      return `<tr>
          <td>${esc(event.eventDate)}</td>
          <td>${esc(event.title)}</td>
          <td>${esc(event.description)}</td>
          <td>${link}</td>
        </tr>`
    })
    .join('\n        ')

  const body = `      <h1 id="services-top">Сервисы сайта</h1>
      <p class="lead">Интерактивные сервисы Funds Lab: опрос, конвертер валют, инвестиционный калькулятор, календарь событий и статистика посещений.</p>

      <nav class="toc" aria-label="Содержание страницы">
        <h2>Содержание</h2>
        <ul>
          <li><a href="#poll">Опрос</a></li>
          <li><a href="#converter">Конвертер валют</a></li>
          <li><a href="#calculator">Инвестиционный калькулятор</a></li>
          <li><a href="#calendar">Календарь событий</a></li>
          <li><a href="#stats">Статистика посещений</a></li>
        </ul>
      </nav>

      <section id="poll">
        <h2>Опрос</h2>
        ${pollInitial()}
      </section>

      <section id="converter">
        <h2>Конвертер валют</h2>
        <p class="lead">Пересчёт суммы между рублём, долларом, евро и юанем по актуальному курсу ЦБ РФ.</p>

        <form class="stacked-form" id="converter-form">
          <label>Сумма
            <input type="number" name="amount" value="1000" min="0" step="any" required>
          </label>
          <label>Из валюты
            <select name="from">
              <option value="RUB">RUB — рубль</option>
              <option value="USD">USD — доллар США</option>
              <option value="EUR">EUR — евро</option>
              <option value="CNY">CNY — юань</option>
            </select>
          </label>
          <label>В валюту
            <select name="to">
              <option value="USD">USD — доллар США</option>
              <option value="EUR">EUR — евро</option>
              <option value="CNY">CNY — юань</option>
              <option value="RUB">RUB — рубль</option>
            </select>
          </label>
          <button type="submit">Перевести</button>
        </form>

        <p id="converter-result" hidden></p>
        <p class="muted" id="converter-rate"></p>
      </section>

      <section id="calculator">
        <h2>Инвестиционный калькулятор</h2>
        <p class="lead">Расчёт будущей суммы вклада с учётом ежемесячных пополнений и сложного процента (капитализация раз в год).</p>

        <form class="stacked-form" id="calculator-form">
          <label>Начальная сумма
            <input type="number" name="initial" value="100000" min="0" step="any" required>
          </label>
          <label>Ежемесячное пополнение
            <input type="number" name="monthly" value="10000" min="0" step="any" required>
          </label>
          <label>Доходность, % годовых
            <input type="number" name="rate" value="10" min="0" max="100" step="any" required>
          </label>
          <label>Срок, лет
            <input type="number" name="years" value="5" min="1" max="50" step="1" required>
          </label>
          <button type="submit">Рассчитать</button>
        </form>

        <p id="calculator-result" hidden></p>

        <table class="data-table" id="calculator-years" hidden>
          <caption>Баланс по годам</caption>
          <thead>
            <tr>
              <th scope="col">Год</th>
              <th scope="col">Баланс</th>
              <th scope="col">Вложено</th>
            </tr>
          </thead>
          <tbody></tbody>
        </table>
      </section>

      <section id="calendar">
        <h2>Календарь событий</h2>
        <p class="lead">Ближайшие корпоративные события: отчётность, дивидендные отсечки, заседания регуляторов.</p>
        <table class="data-table">
          <caption>Ближайшие события</caption>
          <thead>
            <tr>
              <th scope="col">Дата</th>
              <th scope="col">Событие</th>
              <th scope="col">Описание</th>
              <th scope="col">Инструмент</th>
            </tr>
          </thead>
          <tbody>
          ${calendarRows}
          </tbody>
        </table>
      </section>

      <section id="stats">
        <h2>Статистика посещений по разделам</h2>
        <p class="lead">Сколько раз был открыт каждый раздел сайта (данные хранятся в вашем браузере).</p>
        <table class="data-table">
          <caption>Просмотры разделов сайта</caption>
          <thead>
            <tr>
              <th scope="col">Раздел</th>
              <th scope="col">Адрес</th>
              <th scope="col">Просмотров</th>
            </tr>
          </thead>
          <tbody id="stats-body">
          </tbody>
        </table>
        <p><a href="#services-top">↑ Вверх</a></p>
      </section>`

  register('services', 'Сервисы', 'services.html')
  return page({
    id: 'services',
    title: 'Сервисы сайта',
    description: 'Сервисы Funds Lab: опрос, конвертер валют по курсу ЦБ РФ, инвестиционный калькулятор, календарь событий, статистика посещений.',
    keywords: 'сервисы, опрос, конвертер валют, калькулятор, календарь, статистика',
    body,
  })
}

function contactsPage() {
  const body = `      <h1>Контакты</h1>
      <p class="lead">Автор и учебные реквизиты проекта Funds Lab.</p>

      <table class="data-table">
        <caption>Контактная информация</caption>
        <tbody>
          <tr>
            <td>Автор</td>
            <td>Корнюшкин Игорь</td>
          </tr>
          <tr>
            <td>Группа</td>
            <td>БИЗ-Б23</td>
          </tr>
          <tr>
            <td>Адрес сайта</td>
            <td><a href="https://igrgrya.github.io/web_app/" target="_blank" rel="noopener">igrgrya.github.io/web_app</a></td>
          </tr>
          <tr>
            <td>Репозиторий</td>
            <td><a href="https://github.com/igrgrya/web_app" target="_blank" rel="noopener">github.com/igrgrya/web_app</a></td>
          </tr>
        </tbody>
      </table>`

  register('contacts', 'Контакты', 'contacts.html')
  return page({
    id: 'contacts',
    title: 'Контакты',
    description: 'Контакты проекта Funds Lab: автор, учебная группа, адрес сайта и репозиторий.',
    keywords: 'контакты, автор, обратная связь, Funds Lab',
    body,
  })
}

function aboutPage() {
  const body = `      <h1 id="about-top">О проекте</h1>
      <p class="lead">Funds Lab — учебный сайт, созданный в рамках лабораторных работ по дисциплине «Веб-программирование». Тема сайта — фонды, акции и биржи.</p>

      <nav class="toc" aria-label="Содержание страницы">
        <h2>Содержание</h2>
        <ul>
          <li><a href="#technologies">Технологии</a></li>
          <li><a href="#services">Реализованные сервисы</a></li>
          <li><a href="#plan">Структура сайта и план развития</a></li>
        </ul>
      </nav>

      <section id="technologies">
        <h2>Технологии</h2>
        <ul>
          <li>Frontend: HTML5, CSS3, JavaScript (статические страницы)</li>
          <li>Backend (со следующих лабораторных работ): FastAPI + SQLAlchemy</li>
          <li>База данных: PostgreSQL</li>
        </ul>
      </section>

      <section id="services">
        <h2>Реализованные сервисы</h2>
        <ul>
          <li>Счётчик посещаемости и статистика по разделам</li>
          <li>Поиск по сайту (форма в шапке)</li>
          <li>Информеры в шапке: погода Обнинска и курсы ЦБ РФ</li>
          <li>Добавление новостей (форма на странице новостей)</li>
          <li>Мировые часы и статус сессий бирж</li>
          <li>Форум</li>
          <li>Гостевая книга</li>
          <li>Опрос</li>
          <li>Подписка на рассылку</li>
          <li>Конвертер валют</li>
          <li>Инвестиционный калькулятор</li>
          <li>Календарь событий</li>
        </ul>
      </section>

      <section id="plan">
        <h2>Структура сайта и план развития</h2>
        <p>Сайт состоит из 10 статических страниц: Главная, Новости, Биржи, История бирж, Новичку, Глоссарий, Риски, Ссылки, Контакты, О проекте. Кроме статических, на сайте есть сервисные страницы (Поиск, Форум, Сервисы), страницы-заглушки XML, БД и RSS под лабораторные работы №2–4 и техническая страница 404.</p>
        <p>Дальнейшее развитие — по лабораторным работам:</p>
        <ul>
          <li>№2 — раздел «Каталог инструментов» на XML + XSL-преобразование;</li>
          <li>№3 — PostgreSQL + FastAPI (схема в db/schema.sql), новости переедут в БД;</li>
          <li>№4 — RSS-лента из новостей БД.</li>
        </ul>
      </section>

      <p><a href="#about-top">↑ Вверх</a></p>`

  register('about', 'О проекте', 'about.html')
  return page({
    id: 'about',
    title: 'О проекте',
    description: 'Funds Lab — учебный проект по дисциплине «Веб-программирование», лабораторная работа №1.',
    keywords: 'о проекте, лабораторная работа, веб-программирование',
    body,
  })
}

function notFoundPage() {
  const body = `      <h1>Страница не найдена</h1>
      <p class="lead">Такой страницы не существует или она была перемещена.</p>
      <p><a href="index.html">Вернуться на главную</a></p>`

  register('404', 'Страница не найдена', '404.html')
  return page({
    id: '404',
    title: 'Страница не найдена',
    description: 'Запрошенная страница не найдена на сайте Funds Lab.',
    keywords: '404, страница не найдена',
    body,
  })
}

/* --- Страницы-заглушки для следующих лабораторных работ --------------- */

function xmlPage() {
  const sample = instruments
    .slice(0, 2)
    .map(
      (item) => `  <instrument ticker="${esc(item.ticker)}">
    <name>${esc(item.name)}</name>
    <type>${esc(item.type)}</type>
    <exchange>${esc(findExchange(item.exchangeId) ? findExchange(item.exchangeId).code : '')}</exchange>
    <price currency="${esc(item.currency)}">${esc(item.price)}</price>
    <changePercent>${esc(item.changePercent)}</changePercent>
  </instrument>`,
    )
    .join('\n')
  const xmlSample = `<?xml version="1.0" encoding="UTF-8"?>
<catalog>
${sample}
</catalog>`

  const body = `      <h1>XML-данные каталога</h1>
      <p class="lead">Раздел „Каталог инструментов" появится на сайте в лабораторной работе №2: реестр инструментов будет храниться в XML-файле и загружаться на страницу средствами JavaScript.</p>

      <h2>Планируемая структура XML-документа</h2>
      <p>Пример XML-описания инструментов каталога (фрагмент):</p>
      <pre class="code-block"><code>${esc(xmlSample)}</code></pre>

      <h2>Что будет реализовано</h2>
      <ul>
        <li>XML-файл с полным каталогом инструментов (элементы, атрибуты, вложенность).</li>
        <li>Загрузка и разбор XML на клиенте (DOM Parser / fetch).</li>
        <li>Отрисовка таблицы каталога из XML-данных с фильтрацией по бирже и сектору.</li>
      </ul>

      <p class="muted">Страница-заглушка: раздел будет реализован в лабораторной работе №2.</p>`

  register('xml', 'XML', 'xml.html')
  return page({
    id: 'xml',
    title: 'XML',
    description: 'XML-хранение данных каталога Funds Lab — заглушка лабораторной работы №2.',
    keywords: 'XML, данные, каталог, разметка',
    body,
  })
}

function dbPage() {
  const body = `      <h1>База данных</h1>
      <p class="lead">Сейчас данные сайта встроены в статические страницы. В лабораторной работе №3 каталог, новости и события переедут в базу данных PostgreSQL, а доступ к ним появится через backend на FastAPI + SQLAlchemy.</p>

      <h2>Планируемая структура таблиц</h2>
      <table class="data-table">
        <caption>Проект схемы базы данных</caption>
        <thead>
          <tr>
            <th scope="col">Таблица</th>
            <th scope="col">Содержимое</th>
            <th scope="col">Связи</th>
          </tr>
        </thead>
        <tbody>
          <tr><td>exchanges</td><td>Биржи: код, название, страна, часовой пояс</td><td>1—M instruments</td></tr>
          <tr><td>sectors</td><td>Секторы экономики</td><td>1—M instruments</td></tr>
          <tr><td>instruments</td><td>Каталог: тикер, название, тип, цена, объём торгов</td><td>FK → exchanges, sectors</td></tr>
          <tr><td>news</td><td>Новости рынка, связь с инструментами</td><td>FK → instruments</td></tr>
          <tr><td>events</td><td>Календарь событий (отчётности, дивиденды)</td><td>FK → instruments</td></tr>
          <tr><td>ratings</td><td>Оценки инструментов пользователями</td><td>FK → instruments</td></tr>
        </tbody>
      </table>

      <p class="muted">Страница-заглушка: раздел будет реализован в лабораторной работе №3.</p>`

  register('db', 'БД', 'db.html')
  return page({
    id: 'db',
    title: 'БД',
    description: 'База данных PostgreSQL для каталога и новостей Funds Lab — заглушка лабораторной работы №3.',
    keywords: 'база данных, PostgreSQL, SQLAlchemy, FastAPI',
    body,
  })
}

function rssPage() {
  const body = `      <h1>RSS-лента</h1>
      <p class="lead">Лента новостей сайта в формате RSS позволит подписываться на обновления «Последних новостей» через любой RSS-ридер.</p>

      <h2>Как это будет работать</h2>
      <ul>
        <li>При сборке сайта будет генерироваться файл <code>rss.xml</code> с последними новостями каталога.</li>
        <li>В заголовке страниц появится ссылка <code>&lt;link rel="alternate" type="application/rss+xml"&gt;</code>.</li>
        <li>Адрес ленты: <code>rss.xml</code> — её можно добавить в любой агрегатор новостей.</li>
      </ul>

      <p class="muted">Страница-заглушка: лента будет реализована в лабораторной работе №4.</p>`

  register('rss', 'RSS', 'rss.html')
  return page({
    id: 'rss',
    title: 'RSS',
    description: 'RSS-лента новостей Funds Lab — заглушка лабораторной работы №4.',
    keywords: 'RSS, лента новостей, подписка',
    body,
  })
}

/* --- Сборка ------------------------------------------------------------ */

function buildSearchIndex() {
  const entries = []
  news.forEach((item) => {
    entries.push({ type: 'Новость', title: item.title, url: `news.html#news-${item.id}`, text: `${item.title} ${item.body}` })
  })
  registry.forEach((item) => {
    entries.push({ type: 'Страница', title: item.label, url: item.url, text: item.label })
  })
  return entries
}

function writeOut(relativePath, content) {
  const target = join(OUT, relativePath)
  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(target, content, 'utf8')
}

function main() {
  rmSync(OUT, { recursive: true, force: true })
  mkdirSync(join(OUT, 'assets'), { recursive: true })

  const files = {}
  files['index.html'] = homePage()
  files['exchanges.html'] = exchangesPage()
  files['history.html'] = historyPage()
  files['beginners.html'] = beginnersPage()
  files['glossary.html'] = glossaryPage()
  files['risks.html'] = risksPage()
  files['news.html'] = newsListPage()
  files['contacts.html'] = contactsPage()
  files['xml.html'] = xmlPage()
  files['db.html'] = dbPage()
  files['rss.html'] = rssPage()
  files['search.html'] = searchPage()
  files['forum.html'] = forumPage()
  files['services.html'] = servicesPage()
  files['links.html'] = linksPage()
  files['about.html'] = aboutPage()
  files['404.html'] = notFoundPage()

  Object.entries(files).forEach(([name, content]) => writeOut(name, content))

  /* Данные для клиентских сервисов. */
  const data = {
    forumTopics: initialForumTopics,
    guestbookEntries: initialGuestbookEntries,
    poll: initialPoll,
  }
  writeOut('data.js', `window.FUNDS_LAB_SEED = ${JSON.stringify(data, null, 2)};\nwindow.FUNDS_LAB_PAGES = ${JSON.stringify(registry, null, 2)};\n`)
  writeOut('search-index.js', `window.FUNDS_LAB_SEARCH = ${JSON.stringify(buildSearchIndex(), null, 2)};\n`)

  /* Стили, скрипты, картинки. */
  copyFileSync(join(SRC, 'styles.css'), join(OUT, 'styles.css'))
  copyFileSync(join(SRC, 'app.js'), join(OUT, 'app.js'))
  copyFileSync(join(SRC, '../assets/hero.png'), join(OUT, 'assets/hero.png'))
  copyFileSync(join(ROOT, 'frontend/public/favicon.svg'), join(OUT, 'assets/favicon.svg'))

  /* Файлы для хостинга и поисковых систем. */
  writeOut('.nojekyll', '')
  writeOut('robots.txt', `User-agent: *\nAllow: /\nSitemap: ${SITE_URL}sitemap.xml\n`)
  const urls = registry
    .filter((item) => item.id !== '404')
    .map((item) => `  <url><loc>${SITE_URL}${item.url}</loc></url>`)
    .join('\n')
  writeOut(
    'sitemap.xml',
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`,
  )

  console.log(`Готово: сгенерировано ${Object.keys(files).length} страниц в ${OUT}`)
  console.log(`Всего записей в поисковом индексе: ${buildSearchIndex().length}`)
}

main()
