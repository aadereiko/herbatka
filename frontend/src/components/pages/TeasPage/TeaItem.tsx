import React from "react";
import { Tea } from "@/components/types/tea.ts";
import { Link } from "react-router-dom";

const TeaItem = ({ name, teaIngredients, shop }: Tea) => {
  return (
    <div className="py-5">
      <p className="font-semibold">{name}</p>
      <p className="text-gray-600">
        <Link to={`/shops/${shop.id}`}>{shop.name}</Link>
      </p>

      {teaIngredients?.map((ingredient, idx) => (
        <React.Fragment key={ingredient.id}>
          <span>
            {ingredient.name}
            {idx !== teaIngredients?.length - 1 && ", "}
          </span>
        </React.Fragment>
      ))}
    </div>
  );
};

export default TeaItem;
