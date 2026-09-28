// Поиск по сайту — обязательный сервис. Ищет по ключевому слову среди
// инструментов каталога и новостей (простое совпадение подстроки,
// без учёта регистра — в лабе 1 этого достаточно).
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { instruments, news } from '../data/seed'
import { useMeta } from '../hooks/useMeta'

function Search() {
  useMeta('Поиск по сайту', 'Поиск по каталогу инструментов и новостям Funds Lab по ключевому слову.')

  const [query, setQuery] = useState('')

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return { instruments: [], news: [] }
    return {
      instruments: instruments.filter(
        (item) => item.name.toLowerCase().includes(q) || item.ticker.toLowerCase().includes(q) || item.description.toLowerCase().includes(q),
      ),
      news: news.filter((item) => item.title.toLowerCase().includes(q) || item.body.toLowerCase().includes(q)),
    }
  }, [query])

  const hasQuery = query.trim().length > 0
  const hasResults = results.instruments.length > 0 || results.news.length > 0

  return (
    <section>
      <h1>Поиск по сайту</h1>
      <form className="stacked-form" onSubmit={(e) => e.preventDefault()}>
        <label>
          Ключевое слово
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Например: Сбербанк, ETF, дивиденды"
            autoFocus
          />
        </label>
      </form>

      {hasQuery && !hasResults && <p className="empty-state">Ничего не найдено по запросу «{query}».</p>}

      {results.instruments.length > 0 && (
        <>
          <h2>Инструменты</h2>
          <ul className="card-list">
            {results.instruments.map((item) => (
              <li key={item.id} className="card">
                <Link to={`/instrument/${item.ticker}`}>
                  {item.ticker} — {item.name}
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}

      {results.news.length > 0 && (
        <>
          <h2>Новости</h2>
          <ul className="card-list card-list--wide">
            {results.news.map((item) => (
              <li key={item.id} className="card">
                <Link to={`/news/${item.id}`}>{item.title}</Link>
                <p className="muted">{item.publishedAt}</p>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}

export default Search
