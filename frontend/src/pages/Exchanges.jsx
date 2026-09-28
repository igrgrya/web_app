// Список бирж — простая справочная таблица.
import DataTable from '../components/DataTable'
import { exchanges, instruments } from '../data/seed'
import { useMeta } from '../hooks/useMeta'

function Exchanges() {
  useMeta('Биржи', 'Список бирж, представленных в каталоге Funds Lab, с количеством торгуемых инструментов.')

  const columns = [
    { key: 'code', header: 'Код' },
    { key: 'name', header: 'Название' },
    { key: 'country', header: 'Страна' },
    { key: 'timezone', header: 'Часовой пояс' },
    {
      key: 'count',
      header: 'Инструментов в каталоге',
      render: (row) => instruments.filter((item) => item.exchangeId === row.id).length,
    },
    {
      key: 'website',
      header: 'Сайт',
      render: (row) => (
        <a href={row.websiteUrl} target="_blank" rel="noreferrer">
          {row.websiteUrl}
        </a>
      ),
    },
  ]

  return (
    <section>
      <h1>Биржи</h1>
      <p className="lead">Площадки, на которых торгуются инструменты из каталога сайта.</p>
      <DataTable columns={columns} rows={exchanges} getRowKey={(row) => row.id} />
    </section>
  )
}

export default Exchanges
