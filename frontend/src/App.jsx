// Корневой компонент — описывает все маршруты сайта. Каждая страница
// лежит в src/pages, общий каркас (навигация/подвал) — в
// src/components/Layout.jsx.
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import Home from './pages/Home'
import Catalog from './pages/Catalog'
import InstrumentDetail from './pages/InstrumentDetail'
import Exchanges from './pages/Exchanges'
import NewsList from './pages/NewsList'
import NewsDetail from './pages/NewsDetail'
import Forum from './pages/Forum'
import ForumTopic from './pages/ForumTopic'
import Guestbook from './pages/Guestbook'
import Search from './pages/Search'
import Poll from './pages/Poll'
import Subscribe from './pages/Subscribe'
import Links from './pages/Links'
import Calendar from './pages/Calendar'
import Stats from './pages/Stats'
import About from './pages/About'
import { NotFoundPage } from './pages/NotFound'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Home />} />
          <Route path="/catalog" element={<Catalog />} />
          <Route path="/instrument/:ticker" element={<InstrumentDetail />} />
          <Route path="/exchanges" element={<Exchanges />} />
          <Route path="/news" element={<NewsList />} />
          <Route path="/news/:id" element={<NewsDetail />} />
          <Route path="/forum" element={<Forum />} />
          <Route path="/forum/:id" element={<ForumTopic />} />
          <Route path="/guestbook" element={<Guestbook />} />
          <Route path="/search" element={<Search />} />
          <Route path="/poll" element={<Poll />} />
          <Route path="/subscribe" element={<Subscribe />} />
          <Route path="/links" element={<Links />} />
          <Route path="/calendar" element={<Calendar />} />
          <Route path="/stats" element={<Stats />} />
          <Route path="/about" element={<About />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default App
