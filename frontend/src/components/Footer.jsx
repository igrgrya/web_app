// Подвал сайта: ссылки на второстепенные разделы/сервисы + глобальный
// счётчик посещений (обязательный сервис). Сам визит учитывается один раз
// в Layout (см. recordVisit), здесь только показываем накопленное значение.
// useLocation() заставляет Footer перерендериться при переходах, поэтому
// getTotalVisits() достаточно читать прямо в теле компонента.
import { Link, useLocation } from 'react-router-dom'
import { getTotalVisits } from '../lib/storage'

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
  const totalVisits = getTotalVisits()

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
      <p className="visit-counter">Всего посещений сайта: {totalVisits}</p>
    </footer>
  )
}

export default Footer
