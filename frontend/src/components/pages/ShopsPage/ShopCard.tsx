import React from "react";
import { Shop } from "@/components/types/shop.ts";

const ShopCard = ({
  name,
  img_url,
  country,
  street,
  city,
  postal_code,
}: Shop) => {
  return (
    <div className="h-32 w-full flex justify-between border-b py-5 ">
      <div>
        <p className="font-semibold">{name}</p>
        <p className="text-gray-500">{street}</p>
        <p className="text-gray-500">
          {postal_code}, {city}
        </p>
        <p className="text-gray-500">{country}</p>
      </div>

      <div className="flex">
        <img src={img_url} alt={name} className="rounded-md h-full" />
      </div>
    </div>
  );
};

export default ShopCard;
