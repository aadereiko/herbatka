import { useQuery } from "@tanstack/react-query";
import api, { QueryConfig } from "@/api/api.ts";
import { Tea } from "@/components/types/tea.ts";
import { TeaIngredient } from "@/components/types/teaIngredient.ts";
import { Shop } from "@/components/types/shop.ts";

interface UseTeaByIdParams {
  id: string;
}

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

const getTeaById = async ({ id }: UseTeaByIdParams) => {
  const response = await api.get(`teas/${id}`);

  return transformTea(response.data) as Tea;
};

const useTeaById = (params: UseTeaByIdParams, options?: QueryConfig<Tea>) => {
  return useQuery({
    queryKey: ["tea", params],
    queryFn: () => getTeaById(params),
    ...options,
  });
};

export default useTeaById;
