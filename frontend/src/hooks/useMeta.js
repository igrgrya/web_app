// Хук, который каждая страница вызывает у себя в начале рендера.
// Делает две вещи, характерные именно для страницы, а не для layout:
//  1) проставляет <title> и <meta name="description"> под конкретную
//     страницу (требование лабы — метаданные на каждой странице);
//  2) регистрирует просмотр этой страницы в счётчике посещений.
import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { recordPageView } from '../lib/storage'

export function useMeta(title, description) {
  const location = useLocation()

  useEffect(() => {
    document.title = `${title} — Funds Lab`

    let meta = document.querySelector('meta[name="description"]')
    if (!meta) {
      meta = document.createElement('meta')
      meta.setAttribute('name', 'description')
      document.head.appendChild(meta)
    }
    meta.setAttribute('content', description)
  }, [title, description])

  useEffect(() => {
    recordPageView(location.pathname)
  }, [location.pathname])
}
