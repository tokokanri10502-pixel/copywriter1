import { Navigate, Route, Routes } from 'react-router-dom'
import Login from './pages/Login'
import Exam from './pages/Exam'
import Review from './pages/Review'
import Dashboard from './pages/Dashboard'
import { homePathFor, useSession } from './lib/useSession'

export default function App() {
  const { loading, user } = useSession()

  if (loading) {
    return (
      <div className="page page--center">
        <p className="muted">読み込み中…</p>
      </div>
    )
  }

  return (
    <Routes>
      <Route
        path="/login"
        element={user ? <Navigate to={homePathFor(user)} replace /> : <Login />}
      />
      <Route
        path="/exam"
        element={user?.role === 'trainee' ? <Exam user={user} /> : <Navigate to="/login" replace />}
      />
      <Route
        path="/review"
        element={user?.role === 'trainee' ? <Review /> : <Navigate to="/login" replace />}
      />
      <Route
        path="/dashboard"
        element={user?.role === 'manager' ? <Dashboard user={user} /> : <Navigate to="/login" replace />}
      />
      <Route path="*" element={<Navigate to={user ? homePathFor(user) : '/login'} replace />} />
    </Routes>
  )
}
