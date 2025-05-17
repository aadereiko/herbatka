import React from "react";
import { Shop } from "@/components/types/shop.ts";
import { Link } from "react-router-dom";

const ShopCard = ({
  id,
  name,
  img_url,
  country,
  street,
  city,
  postal_code,
}: Shop) => {
  return (
    <Link to={`/shops/${id}`} className="block">
      <div className="group relative bg-white rounded-lg shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden border border-gray-100">
        <div className="p-6 flex gap-6 items-center">
          <div className="flex-1 min-w-0">
            <h3 className="text-xl font-semibold text-gray-900 group-hover:text-primary-dark transition-colors duration-200 mb-2">
              {name}
            </h3>
            <div className="space-y-1 text-gray-600">
              <p className="truncate">{street}</p>
              <p className="truncate">
                {postal_code}, {city}
              </p>
              <p className="truncate">{country}</p>
            </div>
          </div>

          {/* Shop Image */}
          <div className="flex-shrink-0 w-32 h-32 relative">
            {img_url ? (
              <img
                src={img_url}
                alt={name}
                className="w-full h-full object-cover rounded-lg transition-transform duration-200 group-hover:scale-105"
                onError={(e) => {
                  const target = e.target as HTMLImageElement;
                  target.src = "https://placehold.co/400x400/e2e8f0/64748b?text=No+Image";
                }}
              />
            ) : (
              <div className="w-full h-full bg-gray-100 rounded-lg flex items-center justify-center text-gray-400">
                No image
              </div>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
};

export default ShopCard;
