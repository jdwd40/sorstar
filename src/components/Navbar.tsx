import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

export default function Navbar() {
  const { user, signOut } = useAuth()
  const location = useLocation()

  const NavLink = ({ to, children }: { to: string; children: React.ReactNode }) => {
    const isActive = location.pathname === to
    return (
      <Link
        to={to}
        className={`px-3 py-2 rounded-md ${
          isActive
            ? 'bg-gray-900 text-white'
            : 'text-gray-300 hover:bg-gray-700 hover:text-white'
        } transition-colors`}
      >
        {children}
      </Link>
    )
  }

  return (
    <nav className="bg-gray-800 shadow-lg">
      <div className="max-w-6xl mx-auto px-4">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center space-x-8">
            <Link to="/" className="text-xl font-bold text-blue-300 hover:text-blue-400">
              Sorstar
            </Link>
            
            {user && (
              <div className="hidden md:flex items-center space-x-4">
                <NavLink to="/galaxy-map">Galaxy Map</NavLink>
                <NavLink to="/dashboard">Dashboard</NavLink>
                <NavLink to="/my-planets">My Planets</NavLink>
                <NavLink to="/trade-center">Trade Center</NavLink>
              </div>
            )}
          </div>

          <div className="flex items-center space-x-4">
            {user ? (
              <>
                <span className="text-gray-300">
                  Welcome, {user.email}
                </span>
                <button
                  onClick={() => signOut()}
                  className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-md transition-colors"
                >
                  Logout
                </button>
              </>
            ) : (
              <div className="space-x-4">
                <Link
                  to="/login"
                  className="text-gray-300 hover:text-white px-3 py-2 rounded-md"
                >
                  Login
                </Link>
                <Link
                  to="/register"
                  className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md transition-colors"
                >
                  Register
                </Link>
              </div>
            )}
          </div>
        </div>

        {/* Mobile Navigation */}
        {user && (
          <div className="md:hidden pb-3 px-2">
            <div className="flex flex-col space-y-2">
              <NavLink to="/galaxy-map">Galaxy Map</NavLink>
              <NavLink to="/dashboard">Dashboard</NavLink>
              <NavLink to="/my-planets">My Planets</NavLink>
              <NavLink to="/trade-center">Trade Center</NavLink>
            </div>
          </div>
        )}
      </div>
    </nav>
  )
}
