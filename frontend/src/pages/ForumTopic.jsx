// Одна тема форума: список ответов + форма добавления ответа.
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { addForumReply, getForumTopic } from '../lib/storage'
import { useMeta } from '../hooks/useMeta'
import NotFound from './NotFound'

function ForumTopic() {
  const { id } = useParams()
  const [topic, setTopic] = useState(() => getForumTopic(id))
  const [authorName, setAuthorName] = useState('')
  const [message, setMessage] = useState('')

  useMeta(topic ? topic.title : 'Тема не найдена', topic ? `Обсуждение: ${topic.title}` : 'Такая тема форума не найдена.')

  if (!topic) {
    return <NotFound />
  }

  function handleSubmit(e) {
    e.preventDefault()
    if (!authorName.trim() || !message.trim()) return
    const updated = addForumReply(id, { authorName: authorName.trim(), message: message.trim() })
    setTopic(updated)
    setAuthorName('')
    setMessage('')
  }

  return (
    <section>
      <p className="breadcrumb">
        <Link to="/forum">← Все темы</Link>
      </p>
      <h1>{topic.title}</h1>
      <p className="muted">Автор темы: {topic.authorName} · {topic.createdAt}</p>

      <ul className="card-list card-list--wide">
        {topic.replies.map((reply) => (
          <li key={reply.id} className="card">
            <p>{reply.message}</p>
            <p className="muted">
              {reply.authorName} · {reply.createdAt}
            </p>
          </li>
        ))}
      </ul>

      <h2>Ответить</h2>
      <form className="stacked-form" onSubmit={handleSubmit}>
        <label>
          Ваше имя
          <input value={authorName} onChange={(e) => setAuthorName(e.target.value)} required />
        </label>
        <label>
          Сообщение
          <textarea value={message} onChange={(e) => setMessage(e.target.value)} required rows={4} />
        </label>
        <button type="submit">Отправить ответ</button>
      </form>
    </section>
  )
}

export default ForumTopic
