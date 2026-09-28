// Общий каркас страницы: шапка с навигацией, содержимое конкретного
// маршрута (Outlet) и подвал. Подключается один раз в App.jsx, поэтому
// NavBar/Footer не нужно повторять на каждой странице.
import { Outlet } from 'react-router-dom'
import NavBar from './NavBar'
import Footer from './Footer'

function Layout() {
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
