// Каталог полезных ссылок — дополнительный сервис "служба каталогов"
// (Приложение 2, п.3). Ссылки сгруппированы по категориям.
import { externalLinks } from '../data/seed'
import { useMeta } from '../hooks/useMeta'

function Links() {
  useMeta('Полезные ссылки', 'Подборка официальных сайтов бирж, регуляторов и финансовых СМИ.')

  const categories = [...new Set(externalLinks.map((link) => link.category))]

  return (
    <section>
      <h1>Полезные ссылки</h1>
      <p className="lead">Подборка внешних ресурсов, сгруппированных по категориям.</p>

      {categories.map((category) => (
        <div key={category}>
          <h2>{category}</h2>
          <ul className="card-list card-list--wide">
            {externalLinks
              .filter((link) => link.category === category)
              .map((link) => (
                <li key={link.id} className="card">
                  <a href={link.url} target="_blank" rel="noreferrer">
                    {link.title}
                  </a>
                  <p className="muted">{link.description}</p>
                </li>
              ))}
          </ul>
        </div>
      ))}
    </section>
  )
}

export default Links
