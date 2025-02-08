import React from "react";
import { Button } from "@/components/ui/button.tsx";
import useShopList from "@/api/useShopList.tsx";
import ShopCard from "@/components/pages/ShopsPage/ShopCard.tsx";

const ShopsPage = () => {
  const { data: shops } = useShopList();

  return (
    <div className="pt-10">
      <h1>Shops</h1>

      <div>
        <div>
          <Button variant="solid">Add shop</Button>

          <div className="flex flex-col">
            {shops?.map((shop) => <ShopCard key={shop.id} {...shop} />)}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ShopsPage;
