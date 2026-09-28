/* =====================================================================
   Funds Lab — сервисы статического сайта (лабораторная работа №1).
   Бэкенда ещё нет, поэтому все пользовательские данные (счётчик,
   гостевая книга, форум, рейтинги, опрос, подписка) хранятся в
   localStorage браузера. В лабораторной работе №3 этот файл заменится
   запросами к FastAPI, а разметка страниц останется прежней.
   ===================================================================== */

(function () {
  'use strict'

  var SEED = window.FUNDS_LAB_SEED || { forumTopics: [], guestbookEntries: [], poll: null }
  var PAGES = window.FUNDS_LAB_PAGES || []
  var KEYS = {
    visits: 'funds_lab_visits',
    pageViews: 'funds_lab_page_views',
    guestbook: 'funds_lab_guestbook',
    forumTopics: 'funds_lab_forum_topics',
    ratings: 'funds_lab_ratings',
    poll: 'funds_lab_poll',
    pollVoted: 'funds_lab_poll_voted',
    subscribers: 'funds_lab_subscribers'
  }
  // Признак "в этом заходе уже посчитано" живёт в sessionStorage: он
  // сбрасывается при закрытии вкладки/браузера, поэтому каждый новый
  // заход считается заново, а переходы внутри сайта — нет.
  var VISIT_FLAG = 'funds_lab_visit_counted'

  function readJSON(key, fallback) {
    try {
      var raw = window.localStorage.getItem(key)
      return raw ? JSON.parse(raw) : fallback
    } catch (e) {
      return fallback
    }
  }

  function writeJSON(key, value) {
    try {
      window.localStorage.setItem(key, JSON.stringify(value))
    } catch (e) {
      /* хранилище недоступно — сервис просто не сохранится */
    }
  }

  function esc(value) {
    return String(value === null || value === undefined ? '' : value).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
    })
  }

  function today() {
    return new Date().toISOString().slice(0, 10)
  }

  function nextId(items) {
    return items.length ? Math.max.apply(null, items.map(function (i) { return i.id })) + 1 : 1
  }

  function byId(id) {
    return document.getElementById(id)
  }

  /* --- Счётчик посещений (обязательный сервис) ----------------------- */

  function getPageViews() {
    return readJSON(KEYS.pageViews, {})
  }

  function recordPageView(pageId) {
    if (!pageId) return
    var views = getPageViews()
    views[pageId] = (views[pageId] || 0) + 1
    writeJSON(KEYS.pageViews, views)
  }

  function getTotalViews() {
    var views = getPageViews()
    return Object.keys(views).reduce(function (sum, key) { return sum + views[key] }, 0)
  }

  // Счётчик посещений сайта. Правила:
  //   +1  — заход на сайт (набрал адрес, открыл вкладку, пришёл снаружи)
  //         и обновление страницы (F5);
  //    0  — переход по ссылке внутри сайта, кнопки "назад/вперёд".
  // Тип перехода берём из Navigation Timing API, а для старых браузеров
  // оставляем запасной вариант через sessionStorage.
  function getTotalVisits() {
    return readJSON(KEYS.visits, 0)
  }

  function shouldCountVisit() {
    try {
      var entries = window.performance && window.performance.getEntriesByType
        ? window.performance.getEntriesByType('navigation')
        : []
      var type = entries && entries[0] ? entries[0].type : ''
      if (type === 'reload') return true
      if (type === 'navigate') {
        var referrer = document.referrer || ''
        return referrer.indexOf(window.location.origin) !== 0
      }
      if (!type) {
        if (window.sessionStorage.getItem(VISIT_FLAG)) return false
        window.sessionStorage.setItem(VISIT_FLAG, '1')
        return true
      }
      return false
    } catch (e) {
      return true
    }
  }

  function recordVisit() {
    if (shouldCountVisit()) {
      writeJSON(KEYS.visits, getTotalVisits() + 1)
    }
  }

  function renderCounter() {
    var total = getTotalVisits()
    var nodes = document.querySelectorAll('[data-visit-total]')
    for (var i = 0; i < nodes.length; i++) {
      nodes[i].textContent = total
    }
  }

  /* --- Гостевая книга (обязательный сервис) -------------------------- */

  function getGuestbookEntries() {
    return readJSON(KEYS.guestbook, SEED.guestbookEntries)
  }

  function addGuestbookEntry(data) {
    var entries = getGuestbookEntries()
    entries.unshift({
      id: nextId(entries),
      authorName: data.authorName,
      email: data.email,
      message: data.message,
      createdAt: today()
    })
    writeJSON(KEYS.guestbook, entries)
    return entries
  }

  function renderGuestbook() {
    var list = byId('guestbook-list')
    if (!list) return
    var entries = getGuestbookEntries()
    if (!entries.length) {
      list.innerHTML = '<li class="empty-state">Записей пока нет — станьте первым.</li>'
      return
    }
    list.innerHTML = entries.map(function (entry) {
      return '<li class="card"><p>' + esc(entry.message) + '</p>' +
        '<p class="muted">' + esc(entry.authorName) + ' &middot; ' + esc(entry.createdAt) + '</p></li>'
    }).join('')
  }

  function initGuestbook() {
    var form = byId('guestbook-form')
    if (!form) return
    renderGuestbook()
    form.addEventListener('submit', function (event) {
      event.preventDefault()
      var name = form.elements.authorName.value.trim()
      var email = form.elements.email.value.trim()
      var message = form.elements.message.value.trim()
      if (!name || !message) return
      addGuestbookEntry({ authorName: name, email: email, message: message })
      renderGuestbook()
      form.reset()
    })
  }

  /* --- Форум (обязательный сервис) ----------------------------------- */

  function getForumTopics() {
    return readJSON(KEYS.forumTopics, SEED.forumTopics)
  }

  function addForumTopic(data) {
    var topics = getForumTopics()
    var topic = { id: nextId(topics), title: data.title, authorName: data.authorName, createdAt: today(), replies: [] }
    topics.unshift(topic)
    writeJSON(KEYS.forumTopics, topics)
    return topic
  }

  function addForumReply(topicId, data) {
    var topics = getForumTopics()
    var updated = topics.map(function (topic) {
      if (topic.id !== Number(topicId)) return topic
      topic.replies = topic.replies || []
      topic.replies.push({ id: nextId(topic.replies), authorName: data.authorName, message: data.message, createdAt: today() })
      return topic
    })
    writeJSON(KEYS.forumTopics, updated)
    return updated.filter(function (topic) { return topic.id === Number(topicId) })[0]
  }

  function renderForumList() {
    var list = byId('forum-list')
    if (!list) return
    var topics = getForumTopics()
    list.innerHTML = topics.map(function (topic) {
      return '<li class="card"><h2><a href="forum-topic.html?id=' + topic.id + '">' + esc(topic.title) + '</a></h2>' +
        '<p class="muted">Автор: ' + esc(topic.authorName) + ' &middot; ' + esc(topic.createdAt) +
        ' &middot; Ответов: ' + (topic.replies ? topic.replies.length : 0) + '</p></li>'
    }).join('')
  }

  function initForum() {
    var form = byId('forum-form')
    if (!form) return
    renderForumList()
    form.addEventListener('submit', function (event) {
      event.preventDefault()
      var authorName = form.elements.authorName.value.trim()
      var title = form.elements.title.value.trim()
      if (!authorName || !title) return
      addForumTopic({ title: title, authorName: authorName })
      renderForumList()
      form.reset()
    })
  }

  function initForumTopic() {
    var list = byId('reply-list')
    var form = byId('reply-form')
    if (!list || !form) return
    var topicId = Number(new URLSearchParams(window.location.search).get('id'))
    var titleEl = document.querySelector('[data-topic-title]')
    var metaEl = document.querySelector('[data-topic-meta]')
    var heading = byId('reply-heading')
    var missing = byId('topic-missing')
    form.setAttribute('data-topic-id', String(topicId))

    function render() {
      var topic = getForumTopics().filter(function (t) { return t.id === topicId })[0]
      if (!topic) {
        if (titleEl) titleEl.textContent = 'Тема не найдена'
        if (metaEl) metaEl.hidden = true
        if (heading) heading.hidden = true
        form.hidden = true
        if (missing) missing.hidden = false
        return
      }
      if (titleEl) titleEl.textContent = topic.title
      if (metaEl) metaEl.textContent = 'Автор темы: ' + topic.authorName + ' · ' + topic.createdAt
      document.title = topic.title + ' — Funds Lab'
      var replies = topic.replies ? topic.replies : []
      if (!replies.length) {
        list.innerHTML = '<li class="empty-state">Ответов пока нет.</li>'
        return
      }
      list.innerHTML = replies.map(function (reply) {
        return '<li class="card"><p>' + esc(reply.message) + '</p>' +
          '<p class="muted">' + esc(reply.authorName) + ' &middot; ' + esc(reply.createdAt) + '</p></li>'
      }).join('')
    }

    render()
    form.addEventListener('submit', function (event) {
      event.preventDefault()
      var authorName = form.elements.authorName.value.trim()
      var message = form.elements.message.value.trim()
      if (!authorName || !message) return
      addForumReply(topicId, { authorName: authorName, message: message })
      render()
      form.reset()
    })
  }

  /* --- Рейтинг инструментов (обязательный сервис) -------------------- */

  function getRatings(ticker) {
    var all = readJSON(KEYS.ratings, {})
    return all[ticker] || []
  }

  function addRating(ticker, stars) {
    var all = readJSON(KEYS.ratings, {})
    all[ticker] = (all[ticker] || []).concat(stars)
    writeJSON(KEYS.ratings, all)
    return all[ticker]
  }

  function initRating() {
    var widget = byId('rating')
    if (!widget) return
    var ticker = widget.getAttribute('data-ticker')
    var starsBox = widget.querySelector('.star-rating-stars')
    var summary = widget.querySelector('[data-rating-summary]')

    function average(values) {
      if (!values.length) return null
      return values.reduce(function (a, b) { return a + b }, 0) / values.length
    }

    function render() {
      var values = getRatings(ticker)
      var avg = average(values)
      starsBox.innerHTML = [1, 2, 3, 4, 5].map(function (star) {
        return '<button type="button" class="star" data-star="' + star + '" ' +
          'aria-label="Оценить на ' + star + '">&#9733;</button>'
      }).join('')
      summary.textContent = avg !== null
        ? 'Средняя оценка: ' + avg.toFixed(1) + ' из 5 (' + values.length + ')'
        : 'Оценок пока нет — станьте первым.'
      var buttons = starsBox.querySelectorAll('.star')
      for (var i = 0; i < buttons.length; i++) {
        buttons[i].addEventListener('click', function (event) {
          addRating(ticker, Number(event.currentTarget.getAttribute('data-star')))
          render()
        })
      }
    }

    render()
  }

  /* --- Опрос (дополнительный сервис) --------------------------------- */

  function getPoll() {
    return readJSON(KEYS.poll, SEED.poll)
  }

  function hasVotedInPoll() {
    return readJSON(KEYS.pollVoted, false)
  }

  function castPollVote(optionId) {
    var poll = getPoll()
    if (!poll || hasVotedInPoll()) return poll
    poll.options = poll.options.map(function (option) {
      if (option.id === Number(optionId)) option.votes = (option.votes || 0) + 1
      return option
    })
    writeJSON(KEYS.poll, poll)
    writeJSON(KEYS.pollVoted, true)
    return poll
  }

  function initPoll() {
    var box = byId('poll')
    if (!box) return

    function render() {
      var poll = getPoll()
      if (!poll) {
        box.innerHTML = '<p class="empty-state">Опрос пока не создан.</p>'
        return
      }
      var voted = hasVotedInPoll()
      var total = poll.options.reduce(function (sum, option) { return sum + (option.votes || 0) }, 0)
      var items = poll.options.map(function (option) {
        if (voted) {
          var percent = total > 0 ? Math.round(((option.votes || 0) / total) * 100) : 0
          return '<li><div class="poll-result"><div class="poll-result-bar" style="width:' + percent + '%"></div>' +
            '<span>' + esc(option.text) + ' — ' + percent + '% (' + (option.votes || 0) + ')</span></div></li>'
        }
        return '<li><button type="button" data-option="' + option.id + '">' + esc(option.text) + '</button></li>'
      }).join('')
      box.querySelector('[data-poll-question]').textContent = poll.question
      box.querySelector('.poll-options').innerHTML = items
      box.querySelector('[data-poll-note]').textContent = voted
        ? 'Спасибо, ваш голос учтён. Всего голосов: ' + total + '.'
        : ''
      var buttons = box.querySelectorAll('[data-option]')
      for (var i = 0; i < buttons.length; i++) {
        buttons[i].addEventListener('click', function (event) {
          castPollVote(event.currentTarget.getAttribute('data-option'))
          render()
        })
      }
    }

    render()
  }

  /* --- Подписка на рассылку (дополнительный сервис) ------------------ */

  function getSubscribers() {
    return readJSON(KEYS.subscribers, [])
  }

  function initSubscribe() {
    var form = byId('subscribe-form')
    if (!form) return
    var count = byId('subscriber-count')
    var note = byId('subscribe-success')

    function render() {
      if (count) count.textContent = getSubscribers().length
    }

    render()
    form.addEventListener('submit', function (event) {
      event.preventDefault()
      var email = form.elements.email.value.trim()
      if (!email) return
      var list = getSubscribers()
      if (list.indexOf(email) === -1) {
        list.push(email)
        writeJSON(KEYS.subscribers, list)
      }
      if (note) note.hidden = false
      form.reset()
      render()
    })
  }

  /* --- Поиск по сайту (обязательный сервис) -------------------------- */

  function initSearch() {
    var input = byId('search-input')
    var results = byId('search-results')
    if (!input || !results) return
    var index = window.FUNDS_LAB_SEARCH || []

    function render() {
      var q = input.value.trim().toLowerCase()
      if (!q) {
        results.innerHTML = ''
        return
      }
      var found = index.filter(function (item) {
        return (item.title + ' ' + item.text).toLowerCase().indexOf(q) !== -1
      })
      if (!found.length) {
        results.innerHTML = '<p class="empty-state">Ничего не найдено по запросу «' + esc(input.value) + '».</p>'
        return
      }
      results.innerHTML = '<ul class="card-list">' + found.map(function (item) {
        return '<li class="card"><a href="' + esc(item.url) + '">' + esc(item.title) + '</a>' +
          '<p class="muted">' + esc(item.type) + '</p></li>'
      }).join('') + '</ul>'
    }

    input.addEventListener('input', render)
  }

  /* --- Фильтр каталога ----------------------------------------------- */

  function initCatalogFilter() {
    var table = byId('catalog-table')
    var exchangeFilter = byId('exchange-filter')
    var sectorFilter = byId('sector-filter')
    if (!table || !exchangeFilter || !sectorFilter) return

    function apply() {
      var exchange = exchangeFilter.value
      var sector = sectorFilter.value
      var rows = table.querySelectorAll('tbody tr')
      for (var i = 0; i < rows.length; i++) {
        var okExchange = exchange === 'all' || rows[i].getAttribute('data-exchange') === exchange
        var okSector = sector === 'all' || rows[i].getAttribute('data-sector') === sector
        rows[i].hidden = !(okExchange && okSector)
      }
    }

    exchangeFilter.addEventListener('change', apply)
    sectorFilter.addEventListener('change', apply)
  }

  /* --- Статистика по разделам (дополнительный сервис) ---------------- */

  function initStats() {
    var body = byId('stats-body')
    if (!body) return
    var views = getPageViews()
    var rows = PAGES.map(function (page) {
      return { label: page.label, url: page.url, count: views[page.id] || 0 }
    }).sort(function (a, b) { return b.count - a.count })
    body.innerHTML = rows.map(function (row) {
      return '<tr><td>' + esc(row.label) + '</td><td><a href="' + esc(row.url) + '">' + esc(row.url) + '</a></td>' +
        '<td>' + row.count + '</td></tr>'
    }).join('')
  }

  /* --- Внешние сервисы: погода и курсы валют ------------------------- */

  // Запрос JSON с таймаутом: не даём виджету "висеть", если сервис
  // недоступен (например, заблокирован провайдером).
  function fetchJSON(url, timeoutMs) {
    var options = {}
    var controller = null
    var timer = null
    if (typeof AbortController !== 'undefined') {
      controller = new AbortController()
      options.signal = controller.signal
      timer = setTimeout(function () { controller.abort() }, timeoutMs)
    }
    return fetch(url, options)
      .then(function (response) {
        if (!response.ok) throw new Error('HTTP ' + response.status)
        return response.json()
      })
      .then(
        function (data) { if (timer) clearTimeout(timer); return data },
        function (error) { if (timer) clearTimeout(timer); throw error },
      )
  }

  function formatNumber(value, digits) {
    return Number(value).toFixed(digits)
  }

  function initWeather() {
    var box = byId('weather-widget')
    if (!box) return
    box.textContent = 'Загрузка…'
    // Основной источник — open-meteo, запасной — wttr.in.
    fetchJSON('https://api.open-meteo.com/v1/forecast?latitude=55.0968&longitude=36.6103&current=temperature_2m,wind_speed_10m&timezone=Europe/Moscow', 8000)
      .then(function (data) {
        var current = data && data.current
        if (!current) throw new Error('no data')
        box.textContent = 'Обнинск: ' + current.temperature_2m + ' °C, ветер ' + current.wind_speed_10m + ' м/с'
      })
      .catch(function () {
        return fetchJSON('https://wttr.in/Obninsk?format=j1', 8000).then(function (data) {
          var current = data && data.current_condition && data.current_condition[0]
          if (!current) throw new Error('no data')
          box.textContent = 'Обнинск: ' + current.temp_C + ' °C, ветер ' + current.windspeedKmph + ' км/ч'
        })
      })
      .catch(function () { box.textContent = 'Не удалось загрузить погоду.' })
  }

  function initCurrency() {
    var box = byId('currency-widget')
    if (!box) return
    box.textContent = 'Загрузка…'
    // Основной источник — курс ЦБ РФ (доступен из России, поддерживает рубль),
    // запасной — open.er-api.com.
    fetchJSON('https://www.cbr-xml-daily.ru/daily_json.js', 8000)
      .then(function (data) {
        var valute = data && data.Valute
        if (!valute) throw new Error('no data')
        function rubPerUnit(code) {
          var value = valute[code]
          if (!value || typeof value.Value !== 'number') return null
          return value.Value / (value.Nominal || 1)
        }
        var usd = rubPerUnit('USD')
        var eur = rubPerUnit('EUR')
        var cny = rubPerUnit('CNY')
        if (usd === null) throw new Error('no data')
        var date = data.Date ? new Date(data.Date).toLocaleDateString('ru-RU') : ''
        box.textContent = 'ЦБ РФ' + (date ? ' на ' + date : '') + ': ' +
          '1 USD — ' + formatNumber(usd, 2) + ' ₽, ' +
          '1 EUR — ' + (eur === null ? '—' : formatNumber(eur, 2) + ' ₽') + ', ' +
          '1 CNY — ' + (cny === null ? '—' : formatNumber(cny, 2) + ' ₽')
      })
      .catch(function () {
        return fetchJSON('https://open.er-api.com/v6/latest/USD', 8000).then(function (data) {
          var rates = data && data.rates
          if (!rates || typeof rates.RUB !== 'number') throw new Error('no data')
          box.textContent = '1 USD — ' + formatNumber(rates.RUB, 2) + ' ₽, ' +
            '1 EUR — ' + formatNumber(rates.RUB / rates.EUR, 2) + ' ₽, ' +
            '1 CNY — ' + formatNumber(rates.RUB / rates.CNY, 2) + ' ₽'
        })
      })
      .catch(function () { box.textContent = 'Не удалось загрузить курсы валют.' })
  }

  /* --- Запуск --------------------------------------------------------- */

  function init() {
    var pageId = document.body.getAttribute('data-page')
    recordPageView(pageId)
    recordVisit()

    initGuestbook()
    initForum()
    initForumTopic()
    initRating()
    initPoll()
    initSubscribe()
    initSearch()
    initCatalogFilter()
    initStats()
    initWeather()
    initCurrency()
    renderCounter()
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init)
  } else {
    init()
  }
})()
