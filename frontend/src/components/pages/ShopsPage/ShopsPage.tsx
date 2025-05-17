import React from "react";
import { Link } from "react-router-dom";
import useShopsList from "@/api/useShopsList/useShopsList";
import { Button } from "@/components/ui/button";

const ShopsPage = () => {
  const { data: shops } = useShopsList();

  return (
    <div className="pt-10">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Shops</h1>
        <Link to="/shops/add">
          <Button variant="solid">Add shop</Button>
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {shops?.map((shop) => (
          <Link
            key={shop.id}
            to={`/shops/${shop.id}`}
            className="block bg-white rounded-lg shadow-sm border border-gray-100 p-6 hover:border-primary-light hover:shadow-md transition-all duration-200"
          >
            <div className="aspect-square w-full mb-4 bg-gray-100 rounded-lg overflow-hidden">
              {shop.img_url ? (
                <img
                  src={shop.img_url}
                  alt={shop.name}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    const target = e.target as HTMLImageElement;
                    target.src = "https://placehold.co/400x400/e2e8f0/64748b?text=No+Image";
                  }}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-gray-400">
                  No image
                </div>
              )}
            </div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">{shop.name}</h2>
            <p className="text-gray-600 line-clamp-2">{shop.description}</p>
          </Link>
        ))}
      </div>
    </div>
  );
};

export default ShopsPage;
