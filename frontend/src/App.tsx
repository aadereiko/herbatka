import "./App.css";
import React from "react";
import Header from "@/components/layout/Header/Header.tsx";
import { BrowserRouter as Router, Routes } from "react-router-dom";
import AppRouter from "@/AppRouter.tsx";

function App() {
  return (
    <Router>
      <Header />
      <main className="px-10">
        <AppRouter />
      </main>
    </Router>
  );
}

export default App;
