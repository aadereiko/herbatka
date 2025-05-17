import React, { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import useTeaIngredientsList from "@/api/useTeaIngredientsList/useTeaIngredientsList";
import { LuPlus, LuSearch } from "react-icons/lu";
import Tag from "@/components/shared/Tag/Tag";
import { getDefaultColorByIndex } from "@/lib/colors";

const IngredientsPage = () => {
  const { data: ingredients, isLoading } = useTeaIngredientsList();
  const [searchQuery, setSearchQuery] = useState("");

  const filteredIngredients = ingredients?.filter(ingredient =>
    ingredient.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (isLoading) {
    return <div>Loading...</div>;
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Tea Ingredients</h1>
        <Link to="/ingredients/add">
          <Button>
            <LuPlus className="w-4 h-4 mr-2" />
            Add Ingredient
          </Button>
        </Link>
      </div>

      {/* Search Input */}
      <div className="relative mb-6">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <LuSearch className="h-5 w-5 text-gray-400" />
        </div>
        <input
          type="text"
          placeholder="Search ingredients..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary sm:text-sm"
        />
      </div>

      {/* Ingredients List */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-100">
        <ul className="divide-y divide-gray-100">
          {filteredIngredients?.map((ingredient, idx) => (
            <li
              key={ingredient.id}
              className="px-6 py-4 hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-center justify-between">
                <span className="text-gray-900 font-medium">{ingredient.name}</span>
                <Tag color={getDefaultColorByIndex(idx)}>
                  {ingredient.name}
                </Tag>
              </div>
            </li>
          ))}
          {filteredIngredients?.length === 0 && (
            <li className="px-6 py-4 text-gray-500 text-center">
              No ingredients found
            </li>
          )}
        </ul>
      </div>
    </div>
  );
};

export default IngredientsPage; 