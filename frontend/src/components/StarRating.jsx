// Виджет "рейтинг" (обязательный сервис): показывает среднюю оценку
// инструмента и позволяет поставить свою (1-5 звёзд). Голос пишется
// в localStorage через src/lib/storage.js и сразу пересчитывает среднее.
import { useState } from 'react'
import { addRating, getAverageRating, getRatings } from '../lib/storage'

function StarRating({ ticker }) {
  const [average, setAverage] = useState(() => getAverageRating(ticker))
  const [count, setCount] = useState(() => getRatings(ticker).length)
  const [myVote, setMyVote] = useState(0)

  function handleVote(stars) {
    addRating(ticker, stars)
    setMyVote(stars)
    setAverage(getAverageRating(ticker))
    setCount(getRatings(ticker).length)
  }

  return (
    <div className="star-rating">
      <div className="star-rating-stars" role="radiogroup" aria-label="Оценить инструмент">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            role="radio"
            aria-checked={myVote === star}
            className={star <= myVote ? 'star star--filled' : 'star'}
            onClick={() => handleVote(star)}
          >
            ★
          </button>
        ))}
      </div>
      <p className="star-rating-summary">
        {average !== null
          ? `Средняя оценка: ${average.toFixed(1)} из 5 (${count} ${count === 1 ? 'голос' : 'голосов'})`
          : 'Оценок пока нет — станьте первым.'}
      </p>
    </div>
  )
}

export default StarRating
