import React from "react";
import { Tea } from "@/components/types/tea.ts";
import { Link } from "react-router-dom";
import Tag from "@/components/shared/Tag/Tag.tsx";
import { getDefaultColorByIndex } from "@/lib/colors.ts";
import { LuStore } from "react-icons/lu";

const TeaItem = ({ name, teaIngredients, shop, id }: Tea) => {
  return (
    <Link
      to={`/teas/${id}`}
      className="block bg-white rounded-lg shadow-sm border border-gray-100 p-6 hover:border-primary-light hover:shadow-md transition-all duration-200"
    >
      <div className="space-y-4">
        {/* Tea Name */}
        <h3 className="text-xl font-semibold text-gray-900 hover:text-primary-dark transition-colors duration-200">
          {name}
        </h3>

        {/* Shop Info */}
        <div className="flex items-center gap-2 text-gray-600">
          <LuStore className="w-4 h-4" />
          <Link
            to={`/shops/${shop.id}`}
            className="hover:text-primary-dark transition-colors duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {shop.name}
          </Link>
        </div>

        {/* Ingredients */}
        {teaIngredients && teaIngredients.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-2">
            {teaIngredients.map((ingredient, idx) => (
              <Tag key={ingredient.id} color={getDefaultColorByIndex(idx)}>
                {ingredient.name}
              </Tag>
            ))}
          </div>
        )}
      </div>
    </Link>
  );
};

export default TeaItem;
