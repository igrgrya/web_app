// Карточка одного инструмента: полное описание + виджет рейтинга.
// Маршрут динамический (/instrument/:ticker), поэтому дублирует часть
// логики поиска с Search.jsx — оба ищут инструмент по seed-данным.
import { Link, useParams } from 'react-router-dom'
import StarRating from '../components/StarRating'
import { findExchange, findInstrumentByTicker, findSector } from '../data/seed'
import { useMeta } from '../hooks/useMeta'
import NotFound from './NotFound'

const TYPE_LABELS = { stock: 'Акция', etf: 'ETF', fund: 'Фонд', bond: 'Облигация' }

function InstrumentDetail() {
  const { ticker } = useParams()
  const instrument = findInstrumentByTicker(ticker)

  useMeta(
    instrument ? `${instrument.ticker} — ${instrument.name}` : 'Инструмент не найден',
    instrument ? instrument.description : 'Такой инструмент не найден в каталоге Funds Lab.',
  )

  if (!instrument) {
    return <NotFound />
  }

  const exchange = findExchange(instrument.exchangeId)
  const sector = findSector(instrument.sectorId)

  return (
    <section>
      <p className="breadcrumb">
        <Link to="/catalog">← Назад в каталог</Link>
      </p>
      <h1>
        {instrument.ticker} — {instrument.name}
      </h1>
      <p className="lead">{instrument.description}</p>

      <dl className="fact-list">
        <div>
          <dt>Тип</dt>
          <dd>{TYPE_LABELS[instrument.type] || instrument.type}</dd>
        </div>
        <div>
          <dt>Биржа</dt>
          <dd>{exchange ? `${exchange.name} (${exchange.code})` : '—'}</dd>
        </div>
        <div>
          <dt>Сектор</dt>
          <dd>{sector?.name || '—'}</dd>
        </div>
        <div>
          <dt>Цена</dt>
          <dd>
            {instrument.price} {instrument.currency}{' '}
            <span className={instrument.changePercent >= 0 ? 'change change--up' : 'change change--down'}>
              ({instrument.changePercent >= 0 ? '+' : ''}
              {instrument.changePercent}%)
            </span>
          </dd>
        </div>
        <div>
          <dt>Объём торгов</dt>
          <dd>{instrument.volume.toLocaleString('ru-RU')}</dd>
        </div>
        <div>
          <dt>Дата листинга</dt>
          <dd>{instrument.listedDate}</dd>
        </div>
      </dl>

      <h2>Оценка сообщества</h2>
      <StarRating ticker={instrument.ticker} />
    </section>
  )
}

export default InstrumentDetail
