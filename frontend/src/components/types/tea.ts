import { Shop } from "@/components/types/shop.ts";
import { TeaIngredient } from "@/components/types/teaIngredient.ts";

export interface Tea {
  id: number;
  name: string;
  description?: string;
  created_at: string;
  shop: {
    id: Shop["id"];
    name: Shop["name"];
  };
  teaIngredients: TeaIngredient[];
}

export interface TeaWithQualities extends Tea {
  qualities: {
    id: number;
    teaQuality: {
      name: string;
      id: number;
    };
    value: number | string;
  }[];
}
