// Разметка "не найдено". Используется двумя способами:
//  - напрямую внутри InstrumentDetail/NewsDetail/ForumTopic, когда id
//    из URL не найден в данных (эти страницы сами уже вызвали useMeta
//    с подходящим заголовком, поэтому здесь второй раз useMeta не нужен);
//  - через обёртку NotFoundPage ниже — для реального маршрута "*".
import { Link } from 'react-router-dom'
import { useMeta } from '../hooks/useMeta'

function NotFound() {
  return (
    <section>
      <h1>Страница не найдена</h1>
      <p className="lead">Такой страницы не существует или она была перемещена.</p>
      <Link to="/">Вернуться на главную</Link>
    </section>
  )
}

export function NotFoundPage() {
  useMeta('Страница не найдена', 'Запрошенная страница не найдена на сайте Funds Lab.')
  return <NotFound />
}

export default NotFound
