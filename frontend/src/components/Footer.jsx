// Подвал сайта: ссылки на второстепенные разделы/сервисы + глобальный
// счётчик посещений (обязательный сервис). useLocation() заставляет
// Footer перерендериться при каждом переходе между страницами, поэтому
// getTotalViews() достаточно читать прямо в теле компонента — читаем
// localStorage синхронно, состояние/эффект тут не нужны.
import { Link, useLocation } from 'react-router-dom'
import { getTotalViews } from '../lib/storage'

const secondaryLinks = [
  { to: '/forum', label: 'Форум' },
  { to: '/guestbook', label: 'Гостевая книга' },
  { to: '/poll', label: 'Опрос' },
  { to: '/subscribe', label: 'Рассылка' },
  { to: '/links', label: 'Полезные ссылки' },
  { to: '/calendar', label: 'Календарь' },
  { to: '/stats', label: 'Статистика посещений' },
  { to: '/about', label: 'О проекте' },
]

function Footer() {
  useLocation()
  const totalViews = getTotalViews()

  return (
    <footer className="site-footer">
      <nav aria-label="Дополнительные разделы">
        <ul className="nav-list nav-list--footer">
          {secondaryLinks.map((link) => (
            <li key={link.to}>
              <Link to={link.to}>{link.label}</Link>
            </li>
          ))}
        </ul>
      </nav>
      <p className="visit-counter">Всего просмотров страниц на сайте: {totalViews}</p>
    </footer>
  )
}

export default Footer
