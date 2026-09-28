// Опрос — дополнительный сервис (Приложение 2, п.12 в методичке).
// Голос ограничен одним на браузер, см. hasVotedInPoll/castPollVote.
import { useState } from 'react'
import { castPollVote, getPoll, hasVotedInPoll } from '../lib/storage'
import { useMeta } from '../hooks/useMeta'

function Poll() {
  useMeta('Опрос', 'Примите участие в опросе Funds Lab: какой класс активов вам интереснее всего?')

  const [poll, setPoll] = useState(() => getPoll())
  const [voted, setVoted] = useState(() => hasVotedInPoll())

  const totalVotes = poll.options.reduce((sum, option) => sum + option.votes, 0)

  function handleVote(optionId) {
    const updated = castPollVote(optionId)
    setPoll(updated)
    setVoted(true)
  }

  return (
    <section>
      <h1>Опрос</h1>
      <h2>{poll.question}</h2>

      <ul className="poll-options">
        {poll.options.map((option) => {
          const percent = totalVotes > 0 ? Math.round((option.votes / totalVotes) * 100) : 0
          return (
            <li key={option.id}>
              {voted ? (
                <div className="poll-result">
                  <div className="poll-result-bar" style={{ width: `${percent}%` }} />
                  <span>
                    {option.text} — {percent}% ({option.votes})
                  </span>
                </div>
              ) : (
                <button type="button" onClick={() => handleVote(option.id)}>
                  {option.text}
                </button>
              )}
            </li>
          )
        })}
      </ul>

      {voted && <p className="muted">Спасибо, ваш голос учтён. Всего голосов: {totalVotes}.</p>}
    </section>
  )
}

export default Poll
