// Верхняя навигация — основные разделы сайта. Второстепенные разделы
// (форум, гостевая книга, опрос и т.д.) вынесены в Footer, чтобы не
// перегружать главное меню.
import { NavLink } from 'react-router-dom'

const primaryLinks = [
  { to: '/', label: 'Главная', end: true },
  { to: '/catalog', label: 'Каталог' },
  { to: '/exchanges', label: 'Биржи' },
  { to: '/news', label: 'Новости' },
  { to: '/search', label: 'Поиск' },
]

function NavBar() {
  return (
    <header className="site-header">
      <div className="site-header-inner">
        <NavLink to="/" className="brand" end>
          Funds Lab
        </NavLink>
        <nav aria-label="Основная навигация">
          <ul className="nav-list">
            {primaryLinks.map((link) => (
              <li key={link.to}>
                <NavLink to={link.to} end={link.end}>
                  {link.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </header>
  )
}

export default NavBar
