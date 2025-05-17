import "./App.css";
import React from "react";
import Header from "@/components/layout/Header/Header.tsx";
import { BrowserRouter as Router } from "react-router-dom";
import AppRouter from "@/AppRouter.tsx";
import { AuthProvider } from "@/contexts/AuthContext";

function App() {
  return (
    <Router>
      <AuthProvider>
        <Header />
        <main className="px-10">
          <AppRouter />
        </main>
      </AuthProvider>
    </Router>
  );
}

export default App;
