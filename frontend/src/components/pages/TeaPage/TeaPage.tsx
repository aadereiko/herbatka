import React from "react";
import { Link, useParams } from "react-router-dom";
import useTeaById from "@/api/useTeaById/useTeaById.ts";
import capitalize from "lodash/capitalize";
import Tag from "@/components/shared/Tag/Tag.tsx";
import { getDefaultColorByIndex } from "@/lib/colors.ts";
import { Button } from "@/components/ui/button.tsx";
import { LuStore, LuPencil, LuTrash2 } from "react-icons/lu";

const TeaPage = () => {
  const { id } = useParams<{ id: string }>();
  const { data: tea } = useTeaById({ id: id || "" }, { enabled: !!id });

  if (!tea) {
    return (
      <div className="max-w-7xl mx-auto px-6 py-10">
        <div className="text-center py-12">
          <p className="text-gray-600">Loading tea details...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-6 py-10">
      {/* Header Section */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-8 mb-8">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-6">
          <div className="space-y-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">{tea.name}</h1>
              <div className="flex items-center gap-2 mt-2 text-gray-600">
                <LuStore className="w-4 h-4" />
                <Link
                  to={`/shops/${tea.shop.id}`}
                  className="hover:text-primary-dark transition-colors duration-200"
                >
                  {tea.shop.name}
                </Link>
              </div>
            </div>

            {tea.description && (
              <p className="text-gray-600 max-w-2xl">{tea.description}</p>
            )}
          </div>

          <div className="flex gap-3">
            <Button variant="outline" className="flex items-center gap-2">
              <LuPencil className="w-4 h-4" />
              Edit
            </Button>
            <Button variant="outline" className="flex items-center gap-2 text-red-600 hover:text-red-700 hover:bg-red-50">
              <LuTrash2 className="w-4 h-4" />
              Delete
            </Button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Qualities Section */}
        <div className="lg:col-span-2 space-y-8">
          <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Qualities</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {tea.qualities?.map((quality) => (
                <div
                  key={quality.id}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                >
                  <span className="font-medium text-gray-700">
                    {capitalize(quality.teaQuality.name)}
                  </span>
                  <span className="text-gray-600">{quality.value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Ingredients Section */}
          {tea.teaIngredients && tea.teaIngredients.length > 0 && (
            <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">
                Ingredients
              </h2>
              <div className="flex flex-wrap gap-2">
                {tea.teaIngredients.map((ingredient, idx) => (
                  <Tag key={ingredient.id} color={getDefaultColorByIndex(idx)}>
                    {ingredient.name}
                  </Tag>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Additional Info Section */}
        <div className="space-y-8">
          <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">
              Additional Information
            </h2>
            <div className="space-y-3">
              <div>
                <p className="text-sm text-gray-500">Added on</p>
                <p className="text-gray-700">
                  {new Date(tea.created_at).toLocaleDateString()}
                </p>
              </div>
              {/* Add more additional information here as needed */}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TeaPage;
