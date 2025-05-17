import "./App.css";
import React from "react";
import Header from "@/components/layout/Header/Header.tsx";
import { BrowserRouter as Router } from "react-router-dom";
import AppRouter from "@/AppRouter.tsx";
import { AuthProvider } from "@/contexts/AuthContext";
import { Toaster } from "sonner";

function App() {
  return (
    <Router>
      <AuthProvider>
        <Header />
        <main className="px-10">
          <AppRouter />
        </main>
        <Toaster position="top-right" />
      </AuthProvider>
    </Router>
  );
}

export default App;
