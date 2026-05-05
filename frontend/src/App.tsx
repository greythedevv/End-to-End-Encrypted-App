import { Navigate, Route, Routes } from "react-router-dom"
import ChatPage from "./pages/Chat"
import LoginPage from "./pages/login"
import RegisterPage from "./pages/register"

const App = () => {
  return (
    <div>
      <Routes>
        <Route path="/chat" element={<ChatPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<RegisterPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  )
}

export default App
