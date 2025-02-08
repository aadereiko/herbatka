import { Route, Routes } from "react-router-dom";
import React from "react";
import ShopsPage from "@/components/pages/ShopsPage/ShopsPage.tsx";
import ShopPage from "@/components/pages/ShopPage/ShopPage.tsx";
import TeaQualitiesPage from "@/components/pages/TeaQualitiesPage/TeaQualitiesPage.tsx";
import TeasPage from "@/components/pages/TeasPage/TeasPage.tsx";
import TeaPage from "@/components/pages/TeaPage/TeaPage.tsx";

const AppRouter = () => {
  return (
    <Routes>
      <Route path="/shops" element={<ShopsPage />} />
      <Route path="/shops/:id" element={<ShopPage />} />
      <Route path="/tea-qualities" element={<TeaQualitiesPage />} />
      <Route path="/teas" element={<TeasPage />} />
      <Route path="/teas/:id" element={<TeaPage />} />

      {/*<Route path="/about" element={<About />} />*/}
      {/*<Route path="/contact" element={<Contact />} />*/}
      <Route path="*" element={<div>404 - Page Not Found</div>} />
    </Routes>
  );
};

export default AppRouter;
