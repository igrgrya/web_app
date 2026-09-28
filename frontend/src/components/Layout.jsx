// Общий каркас страницы: шапка с навигацией, содержимое конкретного
// маршрута (Outlet) и подвал. Подключается один раз в App.jsx, поэтому
// NavBar/Footer не нужно повторять на каждой странице.
import { useEffect } from 'react'
import { Outlet } from 'react-router-dom'
import NavBar from './NavBar'
import Footer from './Footer'
import { recordVisit } from '../lib/storage'

function Layout() {
  useEffect(() => {
    recordVisit()
  }, [])

  return (
    <div className="site-shell">
      <NavBar />
      <main className="site-main">
        <Outlet />
      </main>
      <Footer />
    </div>
  )
}

export default Layout
