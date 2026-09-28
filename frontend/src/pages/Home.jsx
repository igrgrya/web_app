// Главная страница: краткий обзор проекта, витрина последних новостей
// и несколько инструментов из каталога с наибольшим ростом за день.
import { Link } from 'react-router-dom'
import heroImg from '../assets/hero.png'
import { instruments, news } from '../data/seed'
import { useMeta } from '../hooks/useMeta'

function Home() {
  useMeta(
    'Главная',
    'Funds Lab — учебный сайт о фондах, акциях и биржах: каталог инструментов, новости рынка и сервисы для инвесторов.',
  )

  const topMovers = [...instruments].sort((a, b) => b.changePercent - a.changePercent).slice(0, 3)
  const latestNews = news.slice(0, 3)

  return (
    <section>
      <div className="hero-block">
        <img src={heroImg} alt="" width="170" height="179" className="hero-image" />
        <div>
          <h1>Funds Lab</h1>
          <p className="lead">
            Учебный проект по дисциплине «Интернет-технологии»: интерактивный сайт о фондах,
            акциях и биржах, с каталогом инструментов, новостями и сервисами для сообщества
            инвесторов.
          </p>
        </div>
      </div>

      <div className="section-grid">
        <div>
          <h2>Растут быстрее всех сегодня</h2>
          <ul className="card-list">
            {topMovers.map((item) => (
              <li key={item.id} className="card">
                <Link to={`/instrument/${item.ticker}`}>
                  <strong>{item.ticker}</strong> — {item.name}
                </Link>
                <p className={item.changePercent >= 0 ? 'change change--up' : 'change change--down'}>
                  {item.changePercent >= 0 ? '+' : ''}
                  {item.changePercent}%
                </p>
              </li>
            ))}
          </ul>
          <Link to="/catalog">Смотреть весь каталог →</Link>
        </div>

        <div>
          <h2>Последние новости</h2>
          <ul className="card-list">
            {latestNews.map((item) => (
              <li key={item.id} className="card">
                <Link to={`/news/${item.id}`}>{item.title}</Link>
                <p className="muted">{item.publishedAt}</p>
              </li>
            ))}
          </ul>
          <Link to="/news">Все новости →</Link>
        </div>
      </div>
    </section>
  )
}

export default Home
