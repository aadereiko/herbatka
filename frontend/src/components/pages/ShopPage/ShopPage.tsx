import React from "react";
import { Link, useParams } from "react-router-dom";
import useShopById from "@/api/useShopById/useShopById.ts";

interface UrlParams {
  id: string;
}

const ShopPage = () => {
  const { id } = useParams<UrlParams>();

  const { data: shop } = useShopById(
    { id },
    {
      enabled: !!id,
    },
  );

  return (
    <div className="pt-10">
      <h1>{shop?.name}</h1>
      <div className="mt-1">
        <p className="text-gray-500">{shop?.street}</p>
        <p className="text-gray-500">
          {shop?.postal_code}, {shop?.city}
        </p>
        <p className="text-gray-500">{shop?.country}</p>
      </div>

      <div className="mt-4">
        <h2>Teas</h2>
        <div>
          {shop?.teas.map((t, idx) => (
            <Link key={t.id} to={`/teas/${t.id}`}>
              {idx + 1}. {t.name}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
};

export default ShopPage;
