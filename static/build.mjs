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

/* Адрес развернутого приложения (FastAPI раздает сайт и API лабораторных
   работ №3 и №4). Статические страницы ссылаются на него из разделов лаб. */
const PROD_URL = 'https://fundslab.alwaysdata.net'

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
  .update(readFileSync(join(SRC, 'catalog.xsl'), 'utf8'))
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

/* XML-каталог инструментов (лабораторная работа №2): выгружается из тех же
   seed-данных, что и остальные страницы, поэтому XML не разъедется с сайтом.
   exchange/sector — код биржи и название сектора (а не id), чтобы документ
   читался человеком без обращения к сайту. */
function buildCatalogXml(instruments, exchanges, sectors) {
  const rows = instruments
    .map((item) => {
      const exchange = exchanges.find((e) => e.id === item.exchangeId)
      const sector = sectors.find((s) => s.id === item.sectorId)
      return `  <instrument id="${esc(item.id)}" ticker="${esc(item.ticker)}">
    <name>${esc(item.name)}</name>
    <type>${esc(item.type)}</type>
    <exchange>${esc(exchange ? exchange.code : '')}</exchange>
    <sector>${esc(sector ? sector.name : '')}</sector>
    <price currency="${esc(item.currency)}">${esc(item.price)}</price>
    <changePercent>${esc(item.changePercent)}</changePercent>
    <volume>${esc(item.volume)}</volume>
  </instrument>`
    })
    .join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>
<catalog>
${rows}
</catalog>
`
}

/* RSS 2.0-лента из seed-новостей (лабораторная работа №4): статический файл
   для хостинга без бэкенда (GitHub Pages). На развернутом приложении тот же
   адрес /rss.xml отдает маршрут FastAPI — динамическую ленту из БД.
   pubDate — RFC-822; даты seed заданы как YYYY-MM-DD, считаем их московскими. */
const RFC_WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const RFC_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function rfc822(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number)
  const weekday = RFC_WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]
  return `${weekday}, ${String(d).padStart(2, '0')} ${RFC_MONTHS[m - 1]} ${y} 00:00:00 +0300`
}

function buildRssXml(news, siteUrl) {
  const base = siteUrl  // с завершающим «/», как в sitemap.xml
  const items = [...news]
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
    .map((item) => `    <item>
      <title>${esc(item.title)}</title>
      <link>${base}news.html#news-${esc(item.id)}</link>
      <guid isPermaLink="true">${base}news.html#news-${esc(item.id)}</guid>
      <pubDate>${rfc822(item.publishedAt)}</pubDate>
      <description>${esc(item.body)}</description>
    </item>`)
    .join('\n')
  const lastBuild = rfc822(
    [...news].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))[0].publishedAt,
  )
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Funds Lab — новости рынка</title>
    <link>${base}news.html</link>
    <description>Новости рынка фондов и акций из учебного сайта Funds Lab (лабораторная работа №4).</description>
    <language>ru</language>
    <lastBuildDate>${lastBuild}</lastBuildDate>
    <atom:link href="${base}rss.xml" rel="self" type="application/rss+xml"/>
${items}
  </channel>
</rss>
`
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
  { id: 'xml', label: 'XML (лаб. №2)', url: 'xml.html' },
  { id: 'db', label: 'БД (лаб. №3)', url: 'db.html' },
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
  <link rel="alternate" type="application/rss+xml" title="Funds Lab — новости рынка" href="rss.xml">
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
          <p class="lab-link"><a href="xml.html">Лабораторная работа №2 — Каталог инструментов (XML + XSLT)</a></p>
          <p class="lab-link"><a href="db.html">Лабораторная работа №3 — Приложение с доступом к БД (FastAPI + PostgreSQL)</a></p>
          <p class="lab-link"><a href="rss.html">Лабораторная работа №4 — Обмен данными: RSS-лента и форматы экспорта</a></p>
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
          <li>XML + XSLT — клиентское XSLT-преобразование (каталог инструментов)</li>
          <li>Backend (лабораторные работы №3 и №4): FastAPI + SQLAlchemy</li>
          <li>База данных: PostgreSQL</li>
          <li>Обмен данными (лабораторная работа №4): RSS 2.0, CSV, ASCII с XML-тегами</li>
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
          <li>Каталог инструментов с сортировкой и фильтрами (XML + XSLT)</li>
          <li>Приложение с доступом к БД: каталог, поиск, агрегаты, графики цен (FastAPI + PostgreSQL)</li>
          <li>Обмен данными: RSS-лента из БД, экспорт новостей в CSV и ASCII с XML-тегами, объединение с внешними RSS-файлами (лабораторная работа №4)</li>
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
        <p>Сайт состоит из 10 статических страниц: Главная, Новости, Биржи, История бирж, Новичку, Глоссарий, Риски, Ссылки, Контакты, О проекте. Кроме статических, на сайте есть сервисные страницы (Поиск, Форум, Сервисы), каталог инструментов на XML + XSLT (лабораторная работа №2), страница лабораторной работы №3 с приложением с доступом к БД, раздел обмена данными RSS (лабораторная работа №4) и техническая страница 404.</p>
        <p>Развитие — по лабораторным работам:</p>
        <ul>
          <li>№2 — каталог инструментов на XML + XSLT — выполнена;</li>
          <li>№3 — приложение с доступом к БД (PostgreSQL + FastAPI, схема в db/schema.sql) — выполнена;</li>
          <li>№4 — обмен данными между приложениями: RSS-лента из БД (/rss.xml), экспорт новостей в CSV и ASCII с XML-тегами, объединенные новости из БД и внешних RSS-файлов, импорт внешних новостей в таблицу imported_news — выполнена.</li>
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

/* --- Каталог инструментов (лабораторная работа №2) -------------------- */

/* Страница каталога: данные живут в catalog.xml, таблица строится
   XSLT-преобразованием в браузере (XSL-шаблон — static/src/catalog.xsl). */
function xmlPage() {
  const sectorOptions = sectors
    .map((sector) => `<option value="${esc(sector.name)}">${esc(sector.name)}</option>`)
    .join('\n            ')

  const body = `      <h1>Каталог инструментов</h1>
      <p class="lead">Данные каталога хранятся в XML-файле, а таблица строится XSLT-преобразованием прямо в браузере: выберите сортировку и фильтры — страница покажет нужную выборку из каталога.</p>

      <form class="catalog-controls" id="catalog-form" aria-label="Управление каталогом" onsubmit="return false">
        <label>Сортировка
          <select id="catalog-sort-key">
            <option value="ticker">по тикеру</option>
            <option value="name">по названию</option>
            <option value="type">по типу</option>
            <option value="exchange">по бирже</option>
            <option value="sector">по сектору</option>
            <option value="price">по цене</option>
            <option value="changePercent">по изменению за день</option>
            <option value="volume">по объёму торгов</option>
          </select>
        </label>
        <label>Направление
          <select id="catalog-sort-dir">
            <option value="ascending">по возрастанию</option>
            <option value="descending">по убыванию</option>
          </select>
        </label>
        <label>Биржа
          <select id="catalog-filter-exchange">
            <option value="">все</option>
            <option value="MOEX">MOEX</option>
            <option value="NASDAQ">NASDAQ</option>
            <option value="NYSE">NYSE</option>
          </select>
        </label>
        <label>Тип
          <select id="catalog-filter-type">
            <option value="">все</option>
            <option value="stock">акции</option>
            <option value="etf">ETF</option>
          </select>
        </label>
        <label>Сектор
          <select id="catalog-filter-sector">
            <option value="">все</option>
            ${sectorOptions}
          </select>
        </label>
        <label>Поиск
          <input type="search" id="catalog-search" placeholder="Название или тикер">
        </label>
        <button type="button" id="catalog-reset">Сбросить</button>
      </form>

      <div class="table-scroll" id="catalog-output" data-asset-version="${ASSET_VERSION}">
        <p class="empty-state">Загрузка каталога…</p>
      </div>
      <p id="catalog-fallback" class="empty-state" hidden>Ваш браузер не поддерживает XSLT-преобразования: таблица каталога недоступна.</p>

      <p class="muted">Исходные данные: <a href="catalog.xml" target="_blank" rel="noopener">catalog.xml</a>, стилевая таблица: <a href="catalog.xsl" target="_blank" rel="noopener">catalog.xsl</a>. Загрузку файлов и преобразование выполняет браузер (XSLTProcessor).</p>`

  register('xml', 'XML (лаб. №2)', 'xml.html')
  return page({
    id: 'xml',
    title: 'Каталог инструментов',
    description: 'Каталог инструментов Funds Lab: акции и ETF с сортировкой, фильтрами и поиском; данные хранятся в XML, таблица строится XSLT-преобразованием в браузере.',
    keywords: 'XML, XSLT, каталог инструментов, акции, ETF, сортировка, фильтры, выборка',
    body,
  })
}

/* --- Приложение с доступом к БД (лабораторная работа №3) -------------- */

/* Страница лабораторной работы №3: само приложение (FastAPI + PostgreSQL)
   размещено на бесплатном хостинге Render — https://funds-lab3.onrender.com */
function dbPage() {
  const body = `      <h1>Лабораторная работа №3 — приложение с доступом к БД</h1>
      <p class="lead">Динамическое веб-приложение поверх базы данных PostgreSQL: каталог инструментов, поиск, агрегаты по секторам, лидеры торгового дня и графики динамики цен. Backend — FastAPI + SQLAlchemy, данные хранятся в PostgreSQL, фронтенд приложения построен на Chart.js.</p>

      <p class="lab-link"><a href="https://funds-lab3.onrender.com/">Открыть приложение онлайн — https://funds-lab3.onrender.com</a></p>
      <p class="muted">Приложение размещено на бесплатном хостинге Render. Интерактивная документация API — <a href="https://funds-lab3.onrender.com/docs">Swagger UI на /docs</a>. Инстанс бесплатный: после ~15 минут без трафика приложение «засыпает», первый запрос будит его за 30–60 секунд.</p>

      <h2>Типы запросов к базе данных</h2>
      <table class="data-table">
        <caption>Пять типов SQL-запросов, реализованных в приложении</caption>
        <thead>
          <tr>
            <th scope="col">№</th>
            <th scope="col">Запрос</th>
            <th scope="col">SQL-приёмы</th>
            <th scope="col">Где в интерфейсе</th>
          </tr>
        </thead>
        <tbody>
          <tr><td>Q1</td><td>Каталог инструментов</td><td>SELECT с JOIN четырёх таблиц, фильтры, сортировка</td><td>Таблица каталога (клик по заголовку колонки)</td></tr>
          <tr><td>Q2</td><td>Поиск по тикеру и названию</td><td>Параметризованный ILIKE с экранированием</td><td>Строка поиска над таблицей</td></tr>
          <tr><td>Q3</td><td>Агрегаты по секторам</td><td>GROUP BY, COUNT / AVG / SUM</td><td>Столбчатая диаграмма и таблица</td></tr>
          <tr><td>Q4</td><td>Лидеры роста и падения</td><td>ORDER BY + LIMIT</td><td>Две таблицы «лидеры дня»</td></tr>
          <tr><td>Q5</td><td>Карточка инструмента и история цен</td><td>Выбор по ключу, срез последних дат</td><td>Линейный график и карточка</td></tr>
        </tbody>
      </table>

      <h2>Структура таблиц</h2>
      <table class="data-table">
        <caption>Схема базы данных funds_lab (db/schema.sql)</caption>
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
          <tr><td>instruments</td><td>Каталог: тикер, название, тип, биржа, сектор, валюта</td><td>FK → exchanges, sectors</td></tr>
          <tr><td>price_snapshots</td><td>Снимки цен: цена, изменение, объём, дата</td><td>FK → instruments</td></tr>
        </tbody>
      </table>

      <p class="muted">Исходники приложения: каталог <code>backend/</code> репозитория (модели — app/models.py, запросы — app/main.py, схема и тестовые данные — db/). Графики построены на локальной копии Chart.js, без внешних CDN.</p>`

  register('db', 'БД (лаб. №3)', 'db.html')
  return page({
    id: 'db',
    title: 'Приложение с доступом к БД',
    description: 'Лабораторная работа №3 Funds Lab: веб-приложение с динамическим доступом к PostgreSQL — FastAPI + SQLAlchemy, каталог, поиск, агрегаты, графики цен.',
    keywords: 'база данных, PostgreSQL, SQLAlchemy, FastAPI, лабораторная работа 3, графики',
    body,
  })
}

/* --- Обмен данными: RSS и форматы экспорта (лабораторная работа №4) ---- */

/* Страница лабораторной работы №4: описание обмена данными (протокол RSS,
   форматы отчетности, схема объединения) и ссылки на развернутое приложение.
   Интерактивная версия с загрузкой внешних RSS-фидов живет на хостинге:
   ${PROD_URL}/rss.html. */
function rssPage() {
  const rssStructure = `&lt;?xml version="1.0" encoding="UTF-8"?&gt;
&lt;rss version="2.0"&gt;
  &lt;channel&gt;                                  — канал: сама лента
    &lt;title&gt;Funds Lab — новости рынка&lt;/title&gt;   — название ленты
    &lt;link&gt;…news.html&lt;/link&gt;                    — сайт-источник
    &lt;description&gt;Новости рынка…&lt;/description&gt;   — описание канала
    &lt;language&gt;ru&lt;/language&gt;
    &lt;lastBuildDate&gt;Mon, 20 Sep 2026 00:00:00 +0300&lt;/lastBuildDate&gt;
    &lt;item&gt;                                     — элемент: одна новость
      &lt;title&gt;Заголовок новости&lt;/title&gt;
      &lt;link&gt;адрес новости на сайте&lt;/link&gt;
      &lt;guid isPermaLink="true"&gt;уникальный идентификатор&lt;/guid&gt;
      &lt;pubDate&gt;дата по RFC-822&lt;/pubDate&gt;
      &lt;description&gt;текст новости&lt;/description&gt;
      &lt;category&gt;тикер связанного инструмента&lt;/category&gt;
    &lt;/item&gt;
    …
  &lt;/channel&gt;
&lt;/rss&gt;`

  const body = `      <h1>Обмен данными: RSS-лента и форматы экспорта</h1>
      <p class="lead">Лабораторная работа №4 — «Организация обмена данными между приложениями». Приложение извлекает новости из базы данных и отдает их другим приложениям в форматах обмена (CSV, XML, ASCII с XML-тегами), а также загружает внешний RSS-файл из Интернета и объединяет его с новостями БД.</p>

      <nav class="toc" aria-label="Содержание страницы">
        <h2>Содержание</h2>
        <ul>
          <li><a href="#stages">Этапы работы</a></li>
          <li><a href="#rss-format">Структура формата RSS 2.0</a></li>
          <li><a href="#formats">Форматы обмена (форма отчетности)</a></li>
          <li><a href="#combined">Объединенные новости</a></li>
          <li><a href="#feed">Лента этого сайта</a></li>
        </ul>
      </nav>

      <section id="stages">
        <h2>Этапы работы</h2>
        <ol class="steps-list">
          <li>Изучить протокол передачи новостных данных RSS (см. следующий раздел).</li>
          <li>Разработать структуру формата передачи на основе XML — лента новостей в формате RSS 2.0.</li>
          <li>Доработать приложение: извлечение новостей из БД в структуру формата обмена (эндпоинты ленты и экспортных форматов).</li>
          <li>Произвести прикладную обработку файла: загрузить внешний RSS из Интернета, объединить его с новостями БД на странице «Объединенные новости» и загрузить разобранные записи в таблицу <code>imported_news</code>.</li>
        </ol>
      </section>

      <section id="rss-format">
        <h2>Структура формата RSS 2.0</h2>
        <p>RSS (Really Simple Syndication) — формат обмена новостными данными: XML-документ, в котором канал <code>&lt;channel&gt;</code> содержит метаданные ленты и набор элементов <code>&lt;item&gt;</code> (новостей). Дата публикуется по стандарту RFC-822, все тексты экранируются по правилам XML.</p>
        <pre><code>${rssStructure}</code></pre>
      </section>

      <section id="formats">
        <h2>Форматы обмена (форма отчетности)</h2>
        <p>Приложение представляет данные таблицы <code>news</code> в трех форматах для использования другими приложениями:</p>
        <table class="data-table">
          <caption>Экспортные адреса развернутого приложения</caption>
          <thead>
            <tr>
              <th scope="col">Формат</th>
              <th scope="col">Что содержит</th>
              <th scope="col">Адрес</th>
            </tr>
          </thead>
          <tbody>
            <tr><td>ASCII через разделитель со списком полей (CSV)</td><td>Первая строка — список полей, далее записи с разделителем «;», кодировка UTF-8 с BOM</td><td><a href="${PROD_URL}/api/export/news.csv" target="_blank" rel="noopener">${PROD_URL}/api/export/news.csv</a></td></tr>
            <tr><td>XML-файл (RSS 2.0)</td><td>Новости БД в структуре канала RSS — для RSS-ридеров и агрегаторов</td><td><a href="${PROD_URL}/api/rss" target="_blank" rel="noopener">${PROD_URL}/api/rss</a> (также <a href="${PROD_URL}/rss.xml" target="_blank" rel="noopener">/rss.xml</a>)</td></tr>
            <tr><td>ASCII-файл, оконтуренный XML-тегами</td><td>Плоский дамп таблицы: поля обрамлены тегами <code>&lt;record&gt;</code>, текст новости — сырой ASCII внутри CDATA</td><td><a href="${PROD_URL}/api/export/news.tagged.txt" target="_blank" rel="noopener">${PROD_URL}/api/export/news.tagged.txt</a></td></tr>
          </tbody>
        </table>
        <p class="muted">Эндпоинты работают на развернутом приложении <a href="${PROD_URL}/">${PROD_URL}</a>. Интерактивная версия этой страницы — <a href="${PROD_URL}/rss.html">${PROD_URL}/rss.html</a>: предпросмотр форматов, выбор внешнего источника, импорт в БД.</p>
      </section>

      <section id="combined">
        <h2>Объединенные новости</h2>
        <p>По схеме обмена из методички приложение скачивает <strong>внешний RSS-файл</strong> (РБК, Lenta.ru, Интерфакс, ТАСС или произвольный адрес), разделяет его на элементы, объединяет их с новостями из <strong>БД</strong> (дедупликация по заголовку, сортировка по дате) и вставляет в подготовленный web-шаблон, генерируя страницу:</p>
        <p><a href="${PROD_URL}/lab4/combined.html" target="_blank" rel="noopener">${PROD_URL}/lab4/combined.html — «Объединенные новости»</a></p>
        <p class="muted">Разобранные внешние новости можно дополнительно загрузить в таблицу <code>imported_news</code> той же БД (POST-запрос из интерактивной версии страницы) — обмен данными замыкается в цикл: БД → форматы → внешний источник → снова БД.</p>
      </section>

      <section id="feed">
        <h2>Лента этого сайта</h2>
        <p>Адрес ленты — <a href="rss.xml" target="_blank" rel="noopener">rss.xml</a>: статический файл, сгенерированный вместе со страницами сайта. На развернутом приложении по тому же адресу отдается динамическая лента прямо из базы данных, поэтому подписчики всегда видят актуальные новости. Ленту можно добавить в любой RSS-ридер или агрегатор новостей.</p>
        <p class="muted">Подписка: в заголовке каждой страницы есть <code>&lt;link rel="alternate" type="application/rss+xml"&gt;</code> — браузеры и ридеры находят ленту автоматически.</p>
      </section>`

  register('rss', 'RSS', 'rss.html')
  return page({
    id: 'rss',
    title: 'Обмен данными: RSS (лаб. №4)',
    description: 'Лабораторная работа №4 Funds Lab — обмен данными между приложениями: RSS 2.0-лента из БД, экспорт в CSV и ASCII с XML-тегами, объединенные новости из БД и внешних RSS-файлов.',
    keywords: 'RSS, обмен данными, XML, CSV, лабораторная работа 4, объединенные новости, экспорт',
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

  /* XML-каталог для лабораторной работы №2 (детерминированный: без дат генерации). */
  writeOut('catalog.xml', buildCatalogXml(instruments, exchanges, sectors))

  /* RSS-лента для лабораторной работы №4 (детерминированная: даты — из seed-новостей). */
  writeOut('rss.xml', buildRssXml(news, SITE_URL))

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
  copyFileSync(join(SRC, 'catalog.xsl'), join(OUT, 'catalog.xsl'))
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
