// Каталог фондов/акций — основная таблица сайта. Поддерживает фильтр
// по бирже и сектору (это же наглядно демонстрирует связи между
// таблицами instruments/exchanges/sectors будущей БД).
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import DataTable from '../components/DataTable'
import { exchanges, findExchange, findSector, instruments, sectors } from '../data/seed'
import { useMeta } from '../hooks/useMeta'

function Catalog() {
  useMeta('Каталог инструментов', 'Полный список фондов, акций и ETF, доступных на сайте Funds Lab, с фильтром по бирже и сектору.')

  const [exchangeFilter, setExchangeFilter] = useState('all')
  const [sectorFilter, setSectorFilter] = useState('all')

  const filtered = useMemo(() => {
    return instruments.filter((item) => {
      const matchesExchange = exchangeFilter === 'all' || item.exchangeId === Number(exchangeFilter)
      const matchesSector = sectorFilter === 'all' || item.sectorId === Number(sectorFilter)
      return matchesExchange && matchesSector
    })
  }, [exchangeFilter, sectorFilter])

  const columns = [
    { key: 'ticker', header: 'Тикер', render: (row) => <Link to={`/instrument/${row.ticker}`}>{row.ticker}</Link> },
    { key: 'name', header: 'Название' },
    { key: 'exchange', header: 'Биржа', render: (row) => findExchange(row.exchangeId)?.code },
    { key: 'sector', header: 'Сектор', render: (row) => findSector(row.sectorId)?.name },
    { key: 'price', header: 'Цена', render: (row) => `${row.price} ${row.currency}` },
    {
      key: 'changePercent',
      header: 'Изменение',
      render: (row) => (
        <span className={row.changePercent >= 0 ? 'change change--up' : 'change change--down'}>
          {row.changePercent >= 0 ? '+' : ''}
          {row.changePercent}%
        </span>
      ),
    },
  ]

  return (
    <section>
      <h1>Каталог инструментов</h1>
      <p className="lead">Список фондов и акций, представленных на сайте. Отфильтруйте по бирже или сектору.</p>

      <div className="filter-bar">
        <label>
          Биржа:{' '}
          <select value={exchangeFilter} onChange={(e) => setExchangeFilter(e.target.value)}>
            <option value="all">Все</option>
            {exchanges.map((exchange) => (
              <option key={exchange.id} value={exchange.id}>
                {exchange.code}
              </option>
            ))}
          </select>
        </label>
        <label>
          Сектор:{' '}
          <select value={sectorFilter} onChange={(e) => setSectorFilter(e.target.value)}>
            <option value="all">Все</option>
            {sectors.map((sector) => (
              <option key={sector.id} value={sector.id}>
                {sector.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <DataTable columns={columns} rows={filtered} getRowKey={(row) => row.id} />
    </section>
  )
}

export default Catalog
