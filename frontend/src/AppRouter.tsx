import { Route, Routes } from "react-router-dom";
import React from "react";
import Shops from "@/components/pages/Shops/Shops.tsx";

const AppRouter = () => {
  return (
    <Routes>
      <Route path="/shops" element={<Shops />} />
      {/*<Route path="/about" element={<About />} />*/}
      {/*<Route path="/contact" element={<Contact />} />*/}
      <Route path="*" element={<div>404 - Page Not Found</div>} />
    </Routes>
  );
};

export default AppRouter;
