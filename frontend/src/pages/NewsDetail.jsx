// Детальная страница одной новости.
import { Link, useParams } from 'react-router-dom'
import { findNewsById, instruments } from '../data/seed'
import { useMeta } from '../hooks/useMeta'
import NotFound from './NotFound'

function NewsDetail() {
  const { id } = useParams()
  const item = findNewsById(id)

  useMeta(item ? item.title : 'Новость не найдена', item ? item.body.slice(0, 160) : 'Такая новость не найдена.')

  if (!item) {
    return <NotFound />
  }

  const related = item.relatedInstrumentId ? instruments.find((i) => i.id === item.relatedInstrumentId) : null

  return (
    <section>
      <p className="breadcrumb">
        <Link to="/news">← Все новости</Link>
      </p>
      <h1>{item.title}</h1>
      <p className="muted">{item.publishedAt}</p>
      <p className="lead">{item.body}</p>
      {related && (
        <p>
          Связанный инструмент: <Link to={`/instrument/${related.ticker}`}>{related.ticker} — {related.name}</Link>
        </p>
      )}
    </section>
  )
}

export default NewsDetail
