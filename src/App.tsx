import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import Layout from './components/Layout'
import GalaxyMap from './pages/GalaxyMap'
import Login from './pages/Login'
import Register from './pages/Register'

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-white text-xl">Loading...</div>
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" />
  }

  return <>{children}</>
}

function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route
            path="/"
            element={
              <PrivateRoute>
                <Layout>
                  <GalaxyMap />
                </Layout>
              </PrivateRoute>
            }
          />
          <Route
            path="/dashboard"
            element={
              <PrivateRoute>
                <Layout>
                  <div className="text-white">Dashboard Coming Soon</div>
                </Layout>
              </PrivateRoute>
            }
          />
          <Route
            path="/planets"
            element={
              <PrivateRoute>
                <Layout>
                  <div className="text-white">My Planets Coming Soon</div>
                </Layout>
              </PrivateRoute>
            }
          />
          <Route
            path="/trade"
            element={
              <PrivateRoute>
                <Layout>
                  <div className="text-white">Trade Center Coming Soon</div>
                </Layout>
              </PrivateRoute>
            }
          />
        </Routes>
      </Router>
    </AuthProvider>
  )
}

export default App
