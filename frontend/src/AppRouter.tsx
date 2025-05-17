import { Route, Routes } from "react-router-dom";
import React from "react";
import ShopsPage from "@/components/pages/ShopsPage/ShopsPage.tsx";
import ShopPage from "@/components/pages/ShopPage/ShopPage.tsx";
import TeaQualitiesPage from "@/components/pages/TeaQualitiesPage/TeaQualitiesPage.tsx";
import TeasPage from "@/components/pages/TeasPage/TeasPage.tsx";
import TeaPage from "@/components/pages/TeaPage/TeaPage.tsx";
import AddTeaPage from "@/components/pages/AddTeaPage/AddTeaPage.tsx";
import AddShopPage from "@/components/pages/AddShopPage/AddShopPage.tsx";
import IngredientsPage from "@/components/pages/IngredientsPage/IngredientsPage.tsx";
import AddIngredientPage from "@/components/pages/AddIngredientPage/AddIngredientPage.tsx";
import SignInPage from "@/components/pages/SignInPage/SignInPage.tsx";
import SignUpPage from "@/components/pages/SignUpPage/SignUpPage.tsx";
import ProfilePage from "@/components/pages/ProfilePage/ProfilePage.tsx";
import HomePage from "@/components/pages/HomePage/HomePage.tsx";
import RatingsPage from "@/components/pages/RatingsPage/RatingsPage.tsx";

const AppRouter = () => {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/signin" element={<SignInPage />} />
      <Route path="/signup" element={<SignUpPage />} />
      <Route path="/profile" element={<ProfilePage />} />
      <Route path="/ratings" element={<RatingsPage />} />
      <Route path="/shops" element={<ShopsPage />} />
      <Route path="/shops/add" element={<AddShopPage />} />
      <Route path="/shops/:id" element={<ShopPage />} />
      <Route path="/tea-qualities" element={<TeaQualitiesPage />} />
      <Route path="/teas" element={<TeasPage />} />
      <Route path="/teas/:id" element={<TeaPage />} />
      <Route path="/teas/add" element={<AddTeaPage />} />
      <Route path="/ingredients" element={<IngredientsPage />} />
      <Route path="/ingredients/add" element={<AddIngredientPage />} />

      {/*<Route path="/about" element={<About />} />*/}
      {/*<Route path="/contact" element={<Contact />} />*/}
      <Route path="*" element={<div>404 - Page Not Found</div>} />
    </Routes>
  );
};

export default AppRouter;
