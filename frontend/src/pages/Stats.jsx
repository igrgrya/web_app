// Статистика посещений по разделам — дополнительный сервис
// (Приложение 2, п.22): в отличие от общего счётчика в подвале,
// здесь видна разбивка просмотров по конкретным страницам.
import DataTable from '../components/DataTable'
import { getPageViews } from '../lib/storage'
import { useMeta } from '../hooks/useMeta'

const PAGE_LABELS = {
  '/': 'Главная',
  '/catalog': 'Каталог',
  '/exchanges': 'Биржи',
  '/news': 'Новости',
  '/search': 'Поиск',
  '/forum': 'Форум',
  '/guestbook': 'Гостевая книга',
  '/poll': 'Опрос',
  '/subscribe': 'Рассылка',
  '/links': 'Полезные ссылки',
  '/calendar': 'Календарь',
  '/stats': 'Статистика посещений',
  '/about': 'О проекте',
}

function Stats() {
  useMeta('Статистика посещений', 'Разбивка просмотров сайта Funds Lab по разделам.')

  const rows = Object.entries(getPageViews())
    .map(([path, count]) => ({ path, label: PAGE_LABELS[path] || path, count }))
    .sort((a, b) => b.count - a.count)

  const columns = [
    { key: 'label', header: 'Раздел' },
    { key: 'path', header: 'Маршрут' },
    { key: 'count', header: 'Просмотров' },
  ]

  return (
    <section>
      <h1>Статистика посещений по разделам</h1>
      <p className="lead">Сколько раз был открыт каждый раздел сайта (данные хранятся в вашем браузере).</p>
      <DataTable columns={columns} rows={rows} getRowKey={(row) => row.path} />
    </section>
  )
}

export default Stats
