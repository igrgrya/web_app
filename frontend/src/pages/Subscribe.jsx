// Подписка на рассылку — дополнительный сервис (Приложение 2, п.1).
import { useState } from 'react'
import { addSubscriber, getSubscribers } from '../lib/storage'
import { useMeta } from '../hooks/useMeta'

function Subscribe() {
  useMeta('Подписка на рассылку', 'Подпишитесь на рассылку новостей о фондах и акциях от Funds Lab.')

  const [email, setEmail] = useState('')
  const [subscribers, setSubscribers] = useState(() => getSubscribers())
  const [justSubscribed, setJustSubscribed] = useState(false)

  function handleSubmit(e) {
    e.preventDefault()
    if (!email.trim()) return
    const updated = addSubscriber(email.trim())
    setSubscribers(updated)
    setJustSubscribed(true)
    setEmail('')
  }

  return (
    <section>
      <h1>Подписка на рассылку</h1>
      <p className="lead">Оставьте email, чтобы получать сводку новостей рынка (в рамках лабораторной — без реальной отправки писем).</p>

      <form className="stacked-form" onSubmit={handleSubmit}>
        <label>
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <button type="submit">Подписаться</button>
      </form>

      {justSubscribed && <p className="success-state">Спасибо! Вы подписаны на рассылку.</p>}

      <p className="muted">Всего подписчиков: {subscribers.length}</p>
    </section>
  )
}

export default Subscribe
