import { Shop } from "@/components/types/shop.ts";
import { TeaIngredient } from "@/components/types/teaIngredient.ts";

export interface Tea {
  id: number;
  name: string;
  shop: {
    id: Shop["id"];
    name: Shop["name"];
  };
  teaIngredients: TeaIngredient[];
}
