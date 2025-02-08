import { useQuery } from "@tanstack/react-query";
import api from "@/api/api.ts";
import { Tea } from "@/components/types/tea.ts";
import { TeaIngredient } from "@/components/types/teaIngredient.ts";
import { Shop } from "@/components/types/shop.ts";

interface ServerTea {
  id: number;
  tea_ingredients: TeaIngredient[];
  shop: {
    id: Shop["id"];
    name: Shop["name"];
  };
  name: string;
  description?: string;
  created_at: string;
}

const transformTea = (serverTea: ServerTea): Tea => {
  return {
    id: serverTea.id,
    name: serverTea.name,
    description: serverTea.description,
    created_at: serverTea.created_at,
    teaIngredients: serverTea.tea_ingredients,
    shop: serverTea.shop,
  } as Tea;
};

const getTeasList = async () => {
  const response = await api.get("teas");

  return response.data.map(transformTea) as Tea[];
};

const useTeasList = () => {
  return useQuery({
    queryKey: ["teas"],
    queryFn: () => getTeasList(),
  });
};

export default useTeasList;
