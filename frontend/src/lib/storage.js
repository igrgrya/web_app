// Слой "обязательных" и "дополнительных" сервисов лабораторной работы №1.
//
// В лабе 1 у нас ещё нет backend — все пользовательские данные (гостевая
// книга, форум, рейтинги, счётчик посещений, подписка, опрос) хранятся
// прямо в браузере через localStorage. В лабораторной работе №3 эти же
// функции будут заменены на запросы к FastAPI, а компоненты страниц
// менять не придётся — они просто вызывают функции из этого файла.

import { initialForumTopics, initialGuestbookEntries, initialPoll } from '../data/seed'

const KEYS = {
  visits: 'funds_lab_visits',
  pageViews: 'funds_lab_page_views',
  guestbook: 'funds_lab_guestbook',
  forumTopics: 'funds_lab_forum_topics',
  ratings: 'funds_lab_ratings',
  poll: 'funds_lab_poll',
  pollVoted: 'funds_lab_poll_voted',
  subscribers: 'funds_lab_subscribers',
}

// Базовые помощники чтения/записи JSON в localStorage. Обёрнуты в
// try/catch, потому что localStorage может быть недоступен (приватный
// режим браузера и т.п.) — в этом случае сайт просто работает без
// сохранения между перезагрузками, а не падает с ошибкой.
function readJSON(key, fallback) {
  try {
    const raw = window.localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}

function writeJSON(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Хранилище недоступно — молча игнорируем, сервис просто не сохранится.
  }
}

// --- Счётчик посещений (обязательный сервис) -------------------------

// Увеличивает счётчик просмотров для указанного пути и возвращает
// обновлённые данные по всем разделам сайта.
export function recordPageView(pagePath) {
  const views = readJSON(KEYS.pageViews, {})
  views[pagePath] = (views[pagePath] || 0) + 1
  writeJSON(KEYS.pageViews, views)
  return views
}

export function getPageViews() {
  return readJSON(KEYS.pageViews, {})
}

export function getTotalViews() {
  const views = getPageViews()
  return Object.values(views).reduce((sum, count) => sum + count, 0)
}

// Счётчик посещений сайта. Правила:
//   +1  — заход на сайт (набрал адрес, открыл вкладку, пришёл снаружи)
//         и обновление страницы (F5);
//    0  — переход по ссылке внутри сайта, кнопки "назад/вперёд".
export function getTotalVisits() {
  return readJSON(KEYS.visits, 0)
}

// Защита от повторного срабатывания эффекта (React StrictMode в dev).
let visitRecorded = false

function shouldCountVisit() {
  try {
    const entries = window.performance && window.performance.getEntriesByType
      ? window.performance.getEntriesByType('navigation')
      : []
    const type = entries && entries[0] ? entries[0].type : ''
    if (type === 'reload') return true
    if (type === 'navigate') {
      const referrer = document.referrer || ''
      return referrer.indexOf(window.location.origin) !== 0
    }
    if (!type) {
      if (window.sessionStorage.getItem('funds_lab_visit_counted')) return false
      window.sessionStorage.setItem('funds_lab_visit_counted', '1')
      return true
    }
    return false
  } catch {
    return true
  }
}

export function recordVisit() {
  if (visitRecorded) return
  visitRecorded = true
  if (shouldCountVisit()) {
    writeJSON(KEYS.visits, getTotalVisits() + 1)
  }
}

// --- Гостевая книга (обязательный сервис) -----------------------------

export function getGuestbookEntries() {
  return readJSON(KEYS.guestbook, initialGuestbookEntries)
}

export function addGuestbookEntry({ authorName, email, message }) {
  const entries = getGuestbookEntries()
  const entry = {
    id: entries.length ? Math.max(...entries.map((e) => e.id)) + 1 : 1,
    authorName,
    email,
    message,
    createdAt: new Date().toISOString().slice(0, 10),
  }
  const updated = [entry, ...entries]
  writeJSON(KEYS.guestbook, updated)
  return updated
}

// --- Форум (обязательный сервис) --------------------------------------

export function getForumTopics() {
  return readJSON(KEYS.forumTopics, initialForumTopics)
}

export function getForumTopic(topicId) {
  return getForumTopics().find((topic) => topic.id === Number(topicId))
}

export function addForumTopic({ title, authorName }) {
  const topics = getForumTopics()
  const topic = {
    id: topics.length ? Math.max(...topics.map((t) => t.id)) + 1 : 1,
    title,
    authorName,
    createdAt: new Date().toISOString().slice(0, 10),
    replies: [],
  }
  const updated = [topic, ...topics]
  writeJSON(KEYS.forumTopics, updated)
  return topic
}

export function addForumReply(topicId, { authorName, message }) {
  const topics = getForumTopics()
  const updated = topics.map((topic) => {
    if (topic.id !== Number(topicId)) return topic
    const replyId = topic.replies.length ? Math.max(...topic.replies.map((r) => r.id)) + 1 : 1
    const reply = { id: replyId, authorName, message, createdAt: new Date().toISOString().slice(0, 10) }
    return { ...topic, replies: [...topic.replies, reply] }
  })
  writeJSON(KEYS.forumTopics, updated)
  return updated.find((topic) => topic.id === Number(topicId))
}

// --- Рейтинг инструментов (обязательный сервис) ------------------------

export function getRatings(ticker) {
  const all = readJSON(KEYS.ratings, {})
  return all[ticker] || []
}

export function addRating(ticker, stars) {
  const all = readJSON(KEYS.ratings, {})
  all[ticker] = [...(all[ticker] || []), stars]
  writeJSON(KEYS.ratings, all)
  return all[ticker]
}

export function getAverageRating(ticker) {
  const values = getRatings(ticker)
  if (values.length === 0) return null
  return values.reduce((sum, v) => sum + v, 0) / values.length
}

// --- Опрос (дополнительный сервис) --------------------------------------

export function getPoll() {
  return readJSON(KEYS.poll, initialPoll)
}

export function hasVotedInPoll() {
  return readJSON(KEYS.pollVoted, false)
}

// Голос засчитывается только один раз на браузер — повторные попытки
// просто возвращают текущее состояние без изменений.
export function castPollVote(optionId) {
  if (hasVotedInPoll()) return getPoll()
  const poll = getPoll()
  const updated = {
    ...poll,
    options: poll.options.map((option) =>
      option.id === optionId ? { ...option, votes: option.votes + 1 } : option,
    ),
  }
  writeJSON(KEYS.poll, updated)
  writeJSON(KEYS.pollVoted, true)
  return updated
}

// --- Подписка на рассылку (дополнительный сервис) -----------------------

export function getSubscribers() {
  return readJSON(KEYS.subscribers, [])
}

export function addSubscriber(email) {
  const subscribers = getSubscribers()
  if (subscribers.includes(email)) return subscribers
  const updated = [...subscribers, email]
  writeJSON(KEYS.subscribers, updated)
  return updated
}
