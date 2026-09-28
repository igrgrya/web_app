// Гостевая книга — обязательный сервис: плоская лента сообщений
// (в отличие от форума, здесь нет тем/веток).
import { useState } from 'react'
import { addGuestbookEntry, getGuestbookEntries } from '../lib/storage'
import { useMeta } from '../hooks/useMeta'

function Guestbook() {
  useMeta('Гостевая книга', 'Оставьте отзыв о сайте Funds Lab или почитайте, что пишут другие посетители.')

  const [entries, setEntries] = useState(() => getGuestbookEntries())
  const [authorName, setAuthorName] = useState('')
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')

  function handleSubmit(e) {
    e.preventDefault()
    if (!authorName.trim() || !message.trim()) return
    const updated = addGuestbookEntry({ authorName: authorName.trim(), email: email.trim(), message: message.trim() })
    setEntries(updated)
    setAuthorName('')
    setEmail('')
    setMessage('')
  }

  return (
    <section>
      <h1>Гостевая книга</h1>
      <p className="lead">Напишите нам, что думаете о сайте — сообщение сразу появится в списке ниже.</p>

      <form className="stacked-form" onSubmit={handleSubmit}>
        <label>
          Имя
          <input value={authorName} onChange={(e) => setAuthorName(e.target.value)} required />
        </label>
        <label>
          Email (необязательно)
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label>
          Сообщение
          <textarea value={message} onChange={(e) => setMessage(e.target.value)} required rows={4} />
        </label>
        <button type="submit">Оставить запись</button>
      </form>

      <h2>Записи посетителей</h2>
      <ul className="card-list card-list--wide">
        {entries.map((entry) => (
          <li key={entry.id} className="card">
            <p>{entry.message}</p>
            <p className="muted">
              {entry.authorName} · {entry.createdAt}
            </p>
          </li>
        ))}
      </ul>
    </section>
  )
}

export default Guestbook
