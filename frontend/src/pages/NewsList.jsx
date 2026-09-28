// Список новостей — обязательный сервис "новости".
import { Link } from 'react-router-dom'
import { instruments, news } from '../data/seed'
import { useMeta } from '../hooks/useMeta'

function NewsList() {
  useMeta('Новости', 'Новости рынка фондов и акций: отчётности компаний, дивиденды, обзоры рынка.')

  return (
    <section>
      <h1>Новости</h1>
      <ul className="card-list card-list--wide">
        {news.map((item) => {
          const related = item.relatedInstrumentId
            ? instruments.find((i) => i.id === item.relatedInstrumentId)
            : null
          return (
            <li key={item.id} className="card">
              <h2>
                <Link to={`/news/${item.id}`}>{item.title}</Link>
              </h2>
              <p className="muted">
                {item.publishedAt}
                {related && (
                  <>
                    {' · '}
                    <Link to={`/instrument/${related.ticker}`}>{related.ticker}</Link>
                  </>
                )}
              </p>
              <p>{item.body.slice(0, 140)}…</p>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

export default NewsList
