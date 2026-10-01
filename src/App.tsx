import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { GameProvider } from './context/GameContext'
import StartPage from './pages/StartPage'
import GamePage from './pages/GamePage'

function App() {
  return (
    <GameProvider>
      <BrowserRouter basename={import.meta.env.BASE_URL}>
        <Routes>
          <Route path="/" element={<StartPage />} />
          <Route path="/game" element={<GamePage />} />
          <Route path="*" element={<StartPage />} />
        </Routes>
      </BrowserRouter>
    </GameProvider>
  )
}

export default App
