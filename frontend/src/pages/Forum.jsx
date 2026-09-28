// Форум — обязательный сервис, список тем + форма создания новой темы.
// Хранение и логика — в src/lib/storage.js (localStorage).
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { addForumTopic, getForumTopics } from '../lib/storage'
import { useMeta } from '../hooks/useMeta'

function Forum() {
  useMeta('Форум', 'Обсуждения инвесторов: темы про фонды, акции и стратегии на сайте Funds Lab.')

  const [topics, setTopics] = useState(() => getForumTopics())
  const [title, setTitle] = useState('')
  const [authorName, setAuthorName] = useState('')

  function handleSubmit(e) {
    e.preventDefault()
    if (!title.trim() || !authorName.trim()) return
    addForumTopic({ title: title.trim(), authorName: authorName.trim() })
    setTopics(getForumTopics())
    setTitle('')
    setAuthorName('')
  }

  return (
    <section>
      <h1>Форум</h1>
      <p className="lead">Обсуждайте фонды, акции и инвестиционные стратегии с другими читателями сайта.</p>

      <ul className="card-list card-list--wide">
        {topics.map((topic) => (
          <li key={topic.id} className="card">
            <h2>
              <Link to={`/forum/${topic.id}`}>{topic.title}</Link>
            </h2>
            <p className="muted">
              Автор: {topic.authorName} · {topic.createdAt} · Ответов: {topic.replies.length}
            </p>
          </li>
        ))}
      </ul>

      <h2>Создать новую тему</h2>
      <form className="stacked-form" onSubmit={handleSubmit}>
        <label>
          Ваше имя
          <input value={authorName} onChange={(e) => setAuthorName(e.target.value)} required />
        </label>
        <label>
          Заголовок темы
          <input value={title} onChange={(e) => setTitle(e.target.value)} required />
        </label>
        <button type="submit">Создать тему</button>
      </form>
    </section>
  )
}

export default Forum
