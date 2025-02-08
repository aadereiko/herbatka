import React from "react";
import { Link, useParams } from "react-router-dom";
import useTeaById from "@/api/useTeaById/useTeaById.ts";

interface TeaPageParams {
  id: string;
}

const TeaPage = () => {
  const { id } = useParams<TeaPageParams>();

  const { data: tea } = useTeaById({ id }, { enabled: !!id });

  return (
    <div className="py-10">
      <h1>{tea?.name}</h1>

      <p className="font-semibold">{name}</p>
      <p className="text-gray-600">
        <Link to={`/shops/${tea?.shop.id}`}>{tea?.shop.name}</Link>
      </p>

      {tea?.teaIngredients?.map((ingredient, idx) => (
        <React.Fragment key={ingredient.id}>
          <span>
            {ingredient.name}
            {idx !== tea?.teaIngredients?.length - 1 && ", "}
          </span>
        </React.Fragment>
      ))}
    </div>
  );
};

export default TeaPage;
