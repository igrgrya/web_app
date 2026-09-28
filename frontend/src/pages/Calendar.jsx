// Календарь событий (дивиденды, отчётность) — дополнительный сервис
// "календарь" (Приложение 2, п.38). Показан как таблица, отсортированная
// по дате.
import { Link } from 'react-router-dom'
import DataTable from '../components/DataTable'
import { events, instruments } from '../data/seed'
import { useMeta } from '../hooks/useMeta'

function Calendar() {
  useMeta('Календарь событий', 'Ближайшие даты отчётности и дивидендов по инструментам из каталога Funds Lab.')

  const sorted = [...events].sort((a, b) => a.eventDate.localeCompare(b.eventDate))

  const columns = [
    { key: 'eventDate', header: 'Дата' },
    { key: 'title', header: 'Событие' },
    { key: 'description', header: 'Описание' },
    {
      key: 'instrument',
      header: 'Инструмент',
      render: (row) => {
        const instrument = row.relatedInstrumentId ? instruments.find((i) => i.id === row.relatedInstrumentId) : null
        return instrument ? <Link to={`/instrument/${instrument.ticker}`}>{instrument.ticker}</Link> : '—'
      },
    },
  ]

  return (
    <section>
      <h1>Календарь событий</h1>
      <p className="lead">Ближайшие корпоративные события: отчётность, дивидендные отсечки, заседания регуляторов.</p>
      <DataTable columns={columns} rows={sorted} getRowKey={(row) => row.id} />
    </section>
  )
}

export default Calendar
