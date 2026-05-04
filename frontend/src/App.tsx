import { Route, Routes } from "react-router"
import ChatPage from "./pages/chat.tsx"
import LoginPage from "./pages/login.tsx"
import RegisterPage from "./pages/register.tsx"


const App = () => {
  return (
    <div>
      <Routes>
        <Route path="/chat" element={<ChatPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<RegisterPage />} />

      </Routes>
    </div>
  )
}

export default App
