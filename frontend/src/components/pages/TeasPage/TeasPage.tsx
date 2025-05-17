import React, { useState } from "react";
import useTeasList from "@/api/useTeasList/useTeasList.ts";
import TeaItem from "@/components/pages/TeasPage/TeaItem.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Link } from "react-router-dom";
import { LuSearch, LuPlus } from "react-icons/lu";

const TeasPage = () => {
  const { data: teas } = useTeasList();
  const [searchQuery, setSearchQuery] = useState("");

  const filteredTeas = teas?.filter((tea) => {
    const searchLower = searchQuery.toLowerCase();
    return (
      tea.name.toLowerCase().includes(searchLower) ||
      tea.shop.name.toLowerCase().includes(searchLower) ||
      tea.teaIngredients?.some((ingredient) =>
        ingredient.name.toLowerCase().includes(searchLower)
      )
    );
  });

  return (
    <div className="max-w-7xl mx-auto px-6 py-10">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Teas</h1>
          <p className="mt-2 text-gray-600">
            Browse and manage your tea collection
          </p>
        </div>
        <Link to="/teas/add">
          <Button variant="solid" className="flex items-center gap-2">
            <LuPlus className="w-4 h-4" />
            Add tea
          </Button>
        </Link>
      </div>

      {/* Search Bar */}
      <div className="relative mb-8">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <LuSearch className="w-5 h-5 text-gray-400" />
        </div>
        <input
          type="text"
          placeholder="Search teas by name, shop, or ingredients..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
        />
      </div>

      {filteredTeas && filteredTeas.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredTeas.map((tea) => (
            <TeaItem key={tea.id} {...tea} />
          ))}
        </div>
      ) : (
        <div className="text-center py-12 bg-white rounded-lg border border-gray-100">
          <p className="text-gray-600">
            {searchQuery
              ? "No teas found matching your search"
              : "No teas available yet"}
          </p>
          {!searchQuery && (
            <Link to="/teas/add" className="mt-4 inline-block">
              <Button variant="outline" className="flex items-center gap-2">
                <LuPlus className="w-4 h-4" />
                Add your first tea
              </Button>
            </Link>
          )}
        </div>
      )}
    </div>
  );
};

export default TeasPage;
