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

const TYPE_LABELS = { stock: 'Акция', etf: 'ETF', fund: 'Фонд', bond: 'Облигация' }

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

function findSector(id) {
  return sectors.find((s) => s.id === id)
}

function findInstrument(id) {
  return instruments.find((i) => i.id === id)
}

const dateFmt = (value) => value

/* Записи о страницах: нужны для статистики и sitemap.xml. */
const registry = []

function register(id, label, url) {
  registry.push({ id, label, url })
}

/* --- Общий каркас страницы -------------------------------------------- */

const NAV = [
  { id: 'index', label: 'Главная', url: 'index.html' },
  { id: 'catalog', label: 'Каталог', url: 'catalog.html' },
  { id: 'exchanges', label: 'Биржи', url: 'exchanges.html' },
  { id: 'news', label: 'Новости', url: 'news.html' },
  { id: 'xml', label: 'XML', url: 'xml.html' },
  { id: 'db', label: 'БД', url: 'db.html' },
  { id: 'rss', label: 'RSS', url: 'rss.html' },
  { id: 'search', label: 'Поиск', url: 'search.html' },
  { id: 'forum', label: 'Форум', url: 'forum.html' },
  { id: 'about', label: 'О проекте', url: 'about.html' },
]

const FOOTER_LINKS = [
  { id: 'guestbook', label: 'Гостевая книга', url: 'guestbook.html' },
  { id: 'poll', label: 'Опрос', url: 'poll.html' },
  { id: 'converter', label: 'Конвертер валют', url: 'converter.html' },
  { id: 'calculator', label: 'Инвестиционный калькулятор', url: 'calculator.html' },
  { id: 'links', label: 'Полезные ссылки', url: 'links.html' },
  { id: 'calendar', label: 'Календарь событий', url: 'calendar.html' },
  { id: 'stats', label: 'Статистика посещений', url: 'stats.html' },
]

function navLink(item, active) {
  const current = item.id === active ? ' aria-current="page"' : ''
  return `<li><a href="${item.url}"${current}>${esc(item.label)}</a></li>`
}

function header(active) {
  return `<header class="site-header">
    <div class="site-header-inner">
      <a class="brand" href="index.html">Funds Lab</a>
      <nav aria-label="Основная навигация">
        <ul class="nav-list">${NAV.map((item) => navLink(item, active)).join('')}</ul>
      </nav>
    </div>
    <form class="site-search" action="search.html" method="get" role="search">
      <input type="search" name="q" placeholder="Поиск по сайту: Сбербанк, ETF, дивиденды…" aria-label="Поиск по сайту">
      <button type="submit">Найти</button>
    </form>
    <div class="informers">
      <div class="informer informer--weather" id="weather-widget">Погода: загрузка…</div>
      <div class="informer informer--currency" id="currency-widget">Курсы валют: загрузка…</div>
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

function instrumentTableRows() {
  return instruments
    .map((item) => {
      const exchange = findExchange(item.exchangeId)
      const sector = findSector(item.sectorId)
      const cls = item.changePercent >= 0 ? 'change--up' : 'change--down'
      const sign = item.changePercent >= 0 ? '+' : ''
      return `<tr data-exchange="${item.exchangeId}" data-sector="${item.sectorId}">
          <td>${esc(item.ticker)}</td>
          <td>${esc(item.name)}</td>
          <td>${esc(exchange ? exchange.code : '—')}</td>
          <td>${esc(sector ? sector.name : '—')}</td>
          <td>${esc(item.price)} ${esc(item.currency)}</td>
          <td><span class="${cls}">${sign}${esc(item.changePercent)}%</span></td>
        </tr>`
    })
    .join('\n        ')
}

function instrumentDetails(item) {
  const exchange = findExchange(item.exchangeId)
  const sector = findSector(item.sectorId)
  const cls = item.changePercent >= 0 ? 'change--up' : 'change--down'
  const sign = item.changePercent >= 0 ? '+' : ''
  return `<details class="instrument-card" id="${esc(item.ticker)}">
          <summary><strong>${esc(item.ticker)}</strong> — ${esc(item.name)}
            <span class="${cls}">${sign}${esc(item.changePercent)}%</span></summary>
          <p>${esc(item.description)}</p>
          <dl class="fact-list">
            <div><dt>Тип</dt><dd>${esc(TYPE_LABELS[item.type] || item.type)}</dd></div>
            <div><dt>Биржа</dt><dd>${esc(exchange ? exchange.name + ' (' + exchange.code + ')' : '—')}</dd></div>
            <div><dt>Сектор</dt><dd>${esc(sector ? sector.name : '—')}</dd></div>
            <div><dt>Цена</dt><dd>${esc(item.price)} ${esc(item.currency)}</dd></div>
            <div><dt>Объём торгов</dt><dd>${esc(item.volume.toLocaleString('ru-RU'))}</dd></div>
            <div><dt>Дата листинга</dt><dd>${esc(item.listedDate)}</dd></div>
          </dl>
          <div class="rating" data-ticker="${esc(item.ticker)}">
            <div class="star-rating-stars"></div>
            <p class="muted" data-rating-summary>Оценок пока нет — станьте первым.</p>
          </div>
        </details>`
}

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
      </form>`

  register('forum', 'Форум', 'forum.html')
  return page({
    id: 'forum',
    title: 'Форум',
    description: 'Обсуждения инвесторов: темы про фонды, акции и стратегии на сайте Funds Lab.',
    keywords: 'форум, обсуждение, инвестиции, фонды, акции',
    body,
  })
}

function pollInitial() {
  const total = initialPoll.options.reduce((sum, option) => sum + option.votes, 0)
  const items = initialPoll.options
    .map((option) => `<li><button type="button" data-option="${option.id}">${esc(option.text)}</button></li>`)
    .join('\n        ')
  return `<div id="poll">
      <h2 data-poll-question>${esc(initialPoll.question)}</h2>
      <ul class="poll-options">
        ${items}
      </ul>
      <p class="muted" data-poll-note>Всего голосов: ${total}.</p>
    </div>`
}

/* --- Страницы --------------------------------------------------------- */

function homePage() {
  const topMovers = [...instruments].sort((a, b) => b.changePercent - a.changePercent).slice(0, 3)
  const movers = topMovers
    .map((item) => {
      const cls = item.changePercent >= 0 ? 'change--up' : 'change--down'
      const sign = item.changePercent >= 0 ? '+' : ''
      return `<li class="card">
          <a href="catalog.html#${esc(item.ticker)}"><strong>${esc(item.ticker)}</strong> — ${esc(item.name)}</a>
          <p class="${cls}">${sign}${esc(item.changePercent)}%</p>
        </li>`
    })
    .join('\n          ')

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
          <p class="lead">Учебный проект по дисциплине «Веб-программирование»: интерактивный сайт о фондах, акциях и биржах, с каталогом инструментов, новостями и сервисами для сообщества инвесторов.</p>
        </div>
      </div>

      <nav class="toc" aria-label="Содержание страницы">
        <h2>Содержание</h2>
        <ul>
          <li><a href="#top-movers">Растут быстрее всех сегодня</a></li>
          <li><a href="#latest-news">Последние новости</a></li>
        </ul>
      </nav>

      <div class="section-grid">
        <section id="top-movers">
          <h2>Растут быстрее всех сегодня</h2>
          <ul class="card-list">
          ${movers}
          </ul>
          <p><a href="catalog.html">Смотреть весь каталог →</a></p>
        </section>

        <section id="latest-news">
          <h2>Последние новости</h2>
          <ul class="card-list">
          ${latestNews}
          </ul>
          <p><a href="news.html">Все новости →</a></p>
        </section>
      </div>`

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

function catalogPage() {
  const exchangeOptions = exchanges
    .map((exchange) => `<option value="${exchange.id}">${esc(exchange.code)}</option>`)
    .join('')
  const sectorOptions = sectors
    .map((sector) => `<option value="${sector.id}">${esc(sector.name)}</option>`)
    .join('')

  const body = `      <h1 id="catalog-top">Каталог инструментов</h1>
      <p class="lead">Список фондов и акций, представленных на сайте. Отфильтруйте по бирже или сектору.</p>

      <div class="filter-bar">
        <label>Биржа:
          <select id="exchange-filter">
            <option value="all">Все</option>
            ${exchangeOptions}
          </select>
        </label>
        <label>Сектор:
          <select id="sector-filter">
            <option value="all">Все</option>
            ${sectorOptions}
          </select>
        </label>
      </div>

      <table class="data-table" id="catalog-table">
        <caption>Инструменты каталога Funds Lab</caption>
        <thead>
          <tr>
            <th scope="col">Тикер</th>
            <th scope="col">Название</th>
            <th scope="col">Биржа</th>
            <th scope="col">Сектор</th>
            <th scope="col">Цена</th>
            <th scope="col">Изменение</th>
          </tr>
        </thead>
        <tbody>
        ${instrumentTableRows()}
        </tbody>
      </table>

      <h2>Подробно об инструменте</h2>
      <p class="muted">Нажмите на строку, чтобы раскрыть описание, характеристики и оценить инструмент.</p>
      ${instruments.map((item) => instrumentDetails(item)).join('\n      ')}

      <p><a href="#catalog-top">↑ Вверх к началу таблицы</a></p>`

  register('catalog', 'Каталог инструментов', 'catalog.html')
  return page({
    id: 'catalog',
    title: 'Каталог инструментов',
    description: 'Полный список фондов, акций и ETF, доступных на сайте Funds Lab, с фильтром по бирже и сектору.',
    keywords: 'каталог, акции, ETF, фонды, биржа, сектор',
    body,
  })
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

  const body = `      <h1>Биржи</h1>
      <p class="lead">Площадки, на которых торгуются инструменты из каталога сайта.</p>
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

function newsListPage() {
  const items = news
    .map((item) => {
      const related = item.relatedInstrumentId ? findInstrument(item.relatedInstrumentId) : null
      const relatedHtml = related
        ? `<p>Связанный инструмент: <a href="catalog.html#${esc(related.ticker)}">${esc(related.ticker)} — ${esc(related.name)}</a></p>`
        : ''
      return `<details class="news-item" id="news-${esc(item.id)}">
          <summary><strong>${esc(item.title)}</strong> <span class="muted">${esc(item.publishedAt)}</span></summary>
          <p>${esc(item.body)}</p>
          ${relatedHtml}
        </details>`
    })
    .join('\n      ')

  const body = `      <h1>Новости</h1>
      <p class="lead">Новости рынка фондов и акций: отчётности компаний, дивиденды, обзоры рынка.</p>
      ${items}

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

function guestbookPage() {
  const body = `      <h1>Гостевая книга</h1>
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

      <h2>Записи посетителей</h2>
      <ul class="card-list" id="guestbook-list">
      ${guestbookItems(initialGuestbookEntries)}
      </ul>`

  register('guestbook', 'Гостевая книга', 'guestbook.html')
  return page({
    id: 'guestbook',
    title: 'Гостевая книга',
    description: 'Оставьте отзыв о сайте Funds Lab или почитайте, что пишут другие посетители.',
    keywords: 'гостевая книга, отзывы, обратная связь',
    body,
  })
}

function searchPage() {
  const body = `      <h1>Поиск по сайту</h1>
      <p class="lead">Поиск по каталогу инструментов и новостям Funds Lab по ключевому слову.</p>

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
    description: 'Поиск по каталогу инструментов и новостям Funds Lab по ключевому слову.',
    keywords: 'поиск, поиск по сайту, каталог, новости',
    body,
    extraScripts: `  <script src="search-index.js?v=${ASSET_VERSION}"></script>\n`,
  })
}

function pollPage() {
  const body = `      <h1>Опрос</h1>
      <p class="lead">Примите участие в опросе Funds Lab.</p>
      ${pollInitial()}`

  register('poll', 'Опрос', 'poll.html')
  return page({
    id: 'poll',
    title: 'Опрос',
    description: 'Примите участие в опросе Funds Lab: какой класс активов вам интереснее всего?',
    keywords: 'опрос, голосование, активы, инвестиции',
    body,
  })
}

function linksPage() {
  const categories = [...new Set(externalLinks.map((link) => link.category))]
  const toc = categories
    .map((category, i) => `<li><a href="#cat-${i}">${esc(category)}</a></li>`)
    .join('')
  const sections = categories
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

  const body = `      <h1>Полезные ссылки</h1>
      <p class="lead">Подборка внешних ресурсов, сгруппированных по категориям.</p>

      <nav class="toc" aria-label="Содержание страницы">
        <h2>Категории</h2>
        <ul>${toc}</ul>
      </nav>

      ${sections}`

  register('links', 'Полезные ссылки', 'links.html')
  return page({
    id: 'links',
    title: 'Полезные ссылки',
    description: 'Подборка официальных сайтов бирж, регуляторов и финансовых СМИ.',
    keywords: 'ссылки, биржи, регуляторы, финансовые СМИ, каталог',
    body,
  })
}

function calendarPage() {
  const sorted = [...events].sort((a, b) => a.eventDate.localeCompare(b.eventDate))
  const rows = sorted
    .map((event) => {
      const instrument = event.relatedInstrumentId ? findInstrument(event.relatedInstrumentId) : null
      const link = instrument ? `<a href="catalog.html#${esc(instrument.ticker)}">${esc(instrument.ticker)}</a>` : '—'
      return `<tr>
          <td>${esc(event.eventDate)}</td>
          <td>${esc(event.title)}</td>
          <td>${esc(event.description)}</td>
          <td>${link}</td>
        </tr>`
    })
    .join('\n        ')

  const body = `      <h1>Календарь событий</h1>
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
        ${rows}
        </tbody>
      </table>`

  register('calendar', 'Календарь событий', 'calendar.html')
  return page({
    id: 'calendar',
    title: 'Календарь событий',
    description: 'Ближайшие даты отчётности и дивидендов по инструментам из каталога Funds Lab.',
    keywords: 'календарь, события, дивиденды, отчётность',
    body,
  })
}

function statsPage() {
  const body = `      <h1 id="stats-top">Статистика посещений по разделам</h1>
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
      <p><a href="#stats-top">↑ Вверх</a></p>`

  register('stats', 'Статистика посещений', 'stats.html')
  return page({
    id: 'stats',
    title: 'Статистика посещений',
    description: 'Разбивка просмотров сайта Funds Lab по разделам.',
    keywords: 'статистика, счётчик посещений, аналитика',
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
          <li>Поиск по сайту (форма в шапке на каждой странице)</li>
          <li>Информеры в шапке — погода Обнинска (open-meteo) и курсы ЦБ РФ</li>
          <li>Фильтр каталога по бирже и сектору</li>
          <li>Рейтинг инструментов звёздами (в каталоге)</li>
          <li>Форум</li>
          <li>Гостевая книга</li>
          <li>Опрос</li>
          <li>Подписка на рассылку (на странице новостей)</li>
          <li>Конвертер валют (курсы ЦБ РФ)</li>
          <li>Инвестиционный калькулятор сложного процента</li>
          <li>Календарь событий</li>
          <li>Коллекция полезных ссылок</li>
        </ul>
      </section>

      <section id="plan">
        <h2>Структура сайта и план развития</h2>
        <p>Сайт состоит из 18 статических страниц: 10 разделов главного меню (Главная, Каталог, Биржи, Новости, XML, БД, RSS, Поиск, Форум, О проекте), 7 сервисных страниц в футере (Гостевая книга, Опрос, Конвертер валют, Инвестиционный калькулятор, Полезные ссылки, Календарь событий, Статистика посещений) и страница 404.</p>
        <p>Дальнейшее развитие — по лабораторным работам:</p>
        <ul>
          <li>№2 — каталог инструментов переедет в XML с XSL-преобразованием;</li>
          <li>№3 — данные в PostgreSQL с backend на FastAPI (схема уже в db/schema.sql);</li>
          <li>№4 — RSS-лента из новостей, хранящихся в БД.</li>
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
      <p class="lead">Каталог инструментов — это плоский статический список-реестр. В лабораторной работе №2 такие данные будут храниться в XML-файле и загружаться на страницу средствами JavaScript.</p>

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
    description: 'RSS-лента новостей Funds Lab — заглушка следующей лабораторной работы.',
    keywords: 'RSS, лента новостей, подписка',
    body,
  })
}

/* --- Дополнительные сервисы ------------------------------------------- */

function converterPage() {
  const body = `      <h1>Конвертер валют</h1>
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
      <p class="muted" id="converter-rate"></p>`

  register('converter', 'Конвертер валют', 'converter.html')
  return page({
    id: 'converter',
    title: 'Конвертер валют',
    description: 'Конвертер валют по актуальному курсу ЦБ РФ: рубль, доллар, евро, юань.',
    keywords: 'конвертер валют, курс ЦБ РФ, доллар, евро, юань',
    body,
  })
}

function calculatorPage() {
  const body = `      <h1>Инвестиционный калькулятор</h1>
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
      </table>`

  register('calculator', 'Инвестиционный калькулятор', 'calculator.html')
  return page({
    id: 'calculator',
    title: 'Инвестиционный калькулятор',
    description: 'Расчёт доходности инвестиций с ежемесячными пополнениями и сложным процентом.',
    keywords: 'инвестиционный калькулятор, сложный процент, доходность, вклад',
    body,
  })
}

/* --- Сборка ------------------------------------------------------------ */

function buildSearchIndex() {
  const entries = []
  instruments.forEach((item) => {
    entries.push({
      type: 'Инструмент',
      title: `${item.ticker} — ${item.name}`,
      url: `catalog.html#${item.ticker}`,
      text: `${item.ticker} ${item.name} ${item.description}`,
    })
  })
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
  files['catalog.html'] = catalogPage()
  files['exchanges.html'] = exchangesPage()
  files['news.html'] = newsListPage()
  files['xml.html'] = xmlPage()
  files['db.html'] = dbPage()
  files['rss.html'] = rssPage()
  files['search.html'] = searchPage()
  files['forum.html'] = forumPage()
  files['guestbook.html'] = guestbookPage()
  files['poll.html'] = pollPage()
  files['converter.html'] = converterPage()
  files['calculator.html'] = calculatorPage()
  files['links.html'] = linksPage()
  files['calendar.html'] = calendarPage()
  files['stats.html'] = statsPage()
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
