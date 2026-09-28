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

function instrumentUrl(ticker) {
  return `instrument-${ticker}.html`
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
  { id: 'search', label: 'Поиск', url: 'search.html' },
]

const FOOTER_LINKS = [
  { id: 'forum', label: 'Форум', url: 'forum.html' },
  { id: 'guestbook', label: 'Гостевая книга', url: 'guestbook.html' },
  { id: 'poll', label: 'Опрос', url: 'poll.html' },
  { id: 'subscribe', label: 'Рассылка', url: 'subscribe.html' },
  { id: 'links', label: 'Полезные ссылки', url: 'links.html' },
  { id: 'calendar', label: 'Календарь', url: 'calendar.html' },
  { id: 'stats', label: 'Статистика посещений', url: 'stats.html' },
  { id: 'about', label: 'О проекте', url: 'about.html' },
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
  </header>`
}

function footer() {
  return `<footer class="site-footer">
    <nav aria-label="Дополнительные разделы">
      <ul class="nav-list nav-list--footer">${FOOTER_LINKS.map((item) => navLink(item, active)).join('')}</ul>
    </nav>
    <p class="visit-counter">Всего посещений сайта: <span data-visit-total>0</span></p>
    <p class="author-note">Учебный проект по дисциплине «Веб-программирование». Автор: студент группы БИЗ-Б23, Корнюшкин Игорь.</p>
  </footer>`
}

let active = ''

function page({ id, title, description, keywords, body, extraScripts = '' }) {
  active = id
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
  <link rel="icon" type="image/svg+xml" href="assets/favicon.svg">
  <link rel="stylesheet" href="styles.css?v=${ASSET_VERSION}">
</head>
<body data-page="${esc(id)}">
  <div class="site-shell">
    ${header(id)}
    <main class="site-main">
${body}
    </main>
    ${footer()}
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
          <td><a href="${instrumentUrl(item.ticker)}">${esc(item.ticker)}</a></td>
          <td>${esc(item.name)}</td>
          <td>${esc(exchange ? exchange.code : '—')}</td>
          <td>${esc(sector ? sector.name : '—')}</td>
          <td>${esc(item.price)} ${esc(item.currency)}</td>
          <td><span class="${cls}">${sign}${esc(item.changePercent)}%</span></td>
        </tr>`
    })
    .join('\n        ')
}

function newsCards(items) {
  return items
    .map((item) => {
      const related = item.relatedInstrumentId ? findInstrument(item.relatedInstrumentId) : null
      const link = related
        ? ` &middot; <a href="${instrumentUrl(related.ticker)}">${esc(related.ticker)}</a>`
        : ''
      return `<li class="card">
        <h2><a href="news-${item.id}.html">${esc(item.title)}</a></h2>
        <p class="muted">${esc(dateFmt(item.publishedAt))}${link}</p>
        <p>${esc(item.body.slice(0, 140))}…</p>
      </li>`
    })
    .join('\n      ')
}

function guestbookItems(entries) {
  return entries
    .map(
      (entry) => `<li class="card"><p>${esc(entry.message)}</p>
        <p class="muted">${esc(entry.authorName)} &middot; ${esc(entry.createdAt)}</p></li>`,
    )
    .join('\n      ')
}

function forumItems(topics) {
  return topics
    .map(
      (topic) => `<li class="card">
        <h2><a href="forum-topic.html?id=${topic.id}">${esc(topic.title)}</a></h2>
        <p class="muted">Автор: ${esc(topic.authorName)} &middot; ${esc(topic.createdAt)} &middot; Ответов: ${topic.replies ? topic.replies.length : 0}</p>
      </li>`,
    )
    .join('\n      ')
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
          <a href="${instrumentUrl(item.ticker)}"><strong>${esc(item.ticker)}</strong> — ${esc(item.name)}</a>
          <p class="${cls}">${sign}${esc(item.changePercent)}%</p>
        </li>`
    })
    .join('\n          ')

  const latestNews = news
    .slice(0, 3)
    .map(
      (item) => `<li class="card">
          <a href="news-${item.id}.html">${esc(item.title)}</a>
          <p class="muted">${esc(item.publishedAt)}</p>
        </li>`,
    )
    .join('\n          ')

  const body = `      <div class="hero-block">
        <img src="assets/hero.png" alt="Иллюстрация: график роста биржевых инструментов" width="170" height="179" class="hero-image">
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
          <li><a href="#banners">Дополнительные сервисы</a></li>
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
      </div>

      <section id="banners">
        <h2>Дополнительные сервисы</h2>
        <div class="banner-grid">
          <div class="banner">
            <h3>Поиск в Яндексе</h3>
            <form action="https://yandex.ru/search/" method="get" target="_blank" rel="noopener">
              <input type="text" name="text" placeholder="Что найти?" aria-label="Поисковый запрос">
              <button type="submit">Искать</button>
            </form>
          </div>
          <div class="banner">
            <h3>Погода</h3>
            <p id="weather-widget">Загрузка…</p>
          </div>
          <div class="banner">
            <h3>Курсы валют</h3>
            <p id="currency-widget">Загрузка…</p>
          </div>
        </div>
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

function instrumentPage(item) {
  const exchange = findExchange(item.exchangeId)
  const sector = findSector(item.sectorId)
  const body = `      <p class="breadcrumb"><a href="catalog.html">← Назад в каталог</a></p>
      <h1>${esc(item.ticker)} — ${esc(item.name)}</h1>
      <p class="lead">${esc(item.description)}</p>

      <dl class="fact-list">
        <div><dt>Тип</dt><dd>${esc(TYPE_LABELS[item.type] || item.type)}</dd></div>
        <div><dt>Биржа</dt><dd>${esc(exchange ? exchange.name + ' (' + exchange.code + ')' : '—')}</dd></div>
        <div><dt>Сектор</dt><dd>${esc(sector ? sector.name : '—')}</dd></div>
        <div><dt>Цена</dt><dd>${esc(item.price)} ${esc(item.currency)}</dd></div>
        <div><dt>Объём торгов</dt><dd>${esc(item.volume.toLocaleString('ru-RU'))}</dd></div>
        <div><dt>Дата листинга</dt><dd>${esc(item.listedDate)}</dd></div>
      </dl>

      <h2>Оценка сообщества</h2>
      <div id="rating" data-ticker="${esc(item.ticker)}">
        <div class="star-rating-stars"></div>
        <p class="muted" data-rating-summary>Оценок пока нет — станьте первым.</p>
      </div>`

  register(`instrument-${item.ticker}`, `${item.ticker} — ${item.name}`, instrumentUrl(item.ticker))
  return page({
    id: `instrument-${item.ticker}`,
    title: `${item.ticker} — ${item.name}`,
    description: item.description,
    keywords: `${item.ticker}, ${item.name}, ${sector ? sector.name : ''}, ${TYPE_LABELS[item.type]}`,
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
  const body = `      <h1>Новости</h1>
      <p class="lead">Новости рынка фондов и акций: отчётности компаний, дивиденды, обзоры рынка.</p>
      <ul class="card-list">
      ${newsCards(news)}
      </ul>`

  register('news', 'Новости', 'news.html')
  return page({
    id: 'news',
    title: 'Новости',
    description: 'Новости рынка фондов и акций: отчётности компаний, дивиденды, обзоры рынка.',
    keywords: 'новости, фонды, акции, дивиденды, рынок',
    body,
  })
}

function newsDetailPage(item) {
  const related = item.relatedInstrumentId ? findInstrument(item.relatedInstrumentId) : null
  const relatedHtml = related
    ? `<p>Связанный инструмент: <a href="${instrumentUrl(related.ticker)}">${esc(related.ticker)} — ${esc(related.name)}</a></p>`
    : ''
  const body = `      <p class="breadcrumb"><a href="news.html">← Все новости</a></p>
      <h1>${esc(item.title)}</h1>
      <p class="muted">${esc(item.publishedAt)}</p>
      <p class="lead">${esc(item.body)}</p>
      ${relatedHtml}`

  register(`news-${item.id}`, `Новость: ${item.title}`, `news-${item.id}.html`)
  return page({
    id: `news-${item.id}`,
    title: item.title,
    description: item.body.slice(0, 160),
    keywords: 'новость, фонды, акции, рынок',
    body,
  })
}

function forumPage() {
  const body = `      <h1>Форум</h1>
      <p class="lead">Обсуждайте фонды, акции и инвестиционные стратегии с другими читателями сайта.</p>

      <ul class="card-list" id="forum-list">
      ${forumItems(initialForumTopics)}
      </ul>

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

function forumTopicPage() {
  const body = `      <p class="breadcrumb"><a href="forum.html">← Все темы</a></p>
      <h1 data-topic-title>Тема форума</h1>
      <p class="muted" data-topic-meta>Загрузка…</p>

      <ul class="card-list" id="reply-list"></ul>

      <h2 id="reply-heading">Ответить</h2>
      <form class="stacked-form" id="reply-form" data-topic-id="">
        <label>Ваше имя
          <input name="authorName" required>
        </label>
        <label>Сообщение
          <textarea name="message" rows="4" required></textarea>
        </label>
        <button type="submit">Отправить ответ</button>
      </form>
      <p class="empty-state" id="topic-missing" hidden>Тема не найдена. <a href="forum.html">Вернуться к списку тем</a>.</p>`

  register('forum-topic', 'Тема форума', 'forum-topic.html')
  return page({
    id: 'forum-topic',
    title: 'Тема форума',
    description: 'Обсуждение на форуме Funds Lab.',
    keywords: 'форум, тема, обсуждение',
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

function subscribePage() {
  const body = `      <h1>Подписка на рассылку</h1>
      <p class="lead">Оставьте email, чтобы получать сводку новостей рынка (в рамках лабораторной — без реальной отправки писем).</p>

      <form class="stacked-form" id="subscribe-form">
        <label>Email
          <input type="email" name="email" required>
        </label>
        <button type="submit">Подписаться</button>
      </form>

      <p class="success-state" id="subscribe-success" hidden>Спасибо! Вы подписаны на рассылку.</p>
      <p class="muted">Всего подписчиков: <span id="subscriber-count">0</span></p>`

  register('subscribe', 'Подписка на рассылку', 'subscribe.html')
  return page({
    id: 'subscribe',
    title: 'Подписка на рассылку',
    description: 'Подпишитесь на рассылку новостей о фондах и акциях от Funds Lab.',
    keywords: 'рассылка, подписка, новости, email',
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
      const link = instrument ? `<a href="${instrumentUrl(instrument.ticker)}">${esc(instrument.ticker)}</a>` : '—'
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
          <li>Счётчик посещаемости сайта и разбивка по разделам</li>
          <li>Рейтинг инструментов (оценка звёздами)</li>
          <li>Форум</li>
          <li>Гостевая книга</li>
          <li>Поиск по сайту по ключевым словам</li>
          <li>Лента новостей</li>
          <li>Опрос (голосование)</li>
          <li>Подписка на рассылку</li>
          <li>Календарь событий</li>
          <li>Коллекция полезных ссылок</li>
          <li>Баннеры: поиск, погода, курсы валют</li>
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

/* --- Сборка ------------------------------------------------------------ */

function buildSearchIndex() {
  const entries = []
  instruments.forEach((item) => {
    entries.push({
      type: 'Инструмент',
      title: `${item.ticker} — ${item.name}`,
      url: instrumentUrl(item.ticker),
      text: `${item.ticker} ${item.name} ${item.description}`,
    })
  })
  news.forEach((item) => {
    entries.push({ type: 'Новость', title: item.title, url: `news-${item.id}.html`, text: `${item.title} ${item.body}` })
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
  instruments.forEach((item) => {
    files[instrumentUrl(item.ticker)] = instrumentPage(item)
  })
  files['exchanges.html'] = exchangesPage()
  files['news.html'] = newsListPage()
  news.forEach((item) => {
    files[`news-${item.id}.html`] = newsDetailPage(item)
  })
  files['forum.html'] = forumPage()
  files['forum-topic.html'] = forumTopicPage()
  files['guestbook.html'] = guestbookPage()
  files['search.html'] = searchPage()
  files['poll.html'] = pollPage()
  files['subscribe.html'] = subscribePage()
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
  copyFileSync(join(ROOT, 'frontend/src/assets/hero.png'), join(OUT, 'assets/hero.png'))
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
