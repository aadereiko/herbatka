import { useQuery } from "@tanstack/react-query";
import api, { QueryConfig } from "@/api/api.ts";
import { Tea, TeaWithQualities } from "@/components/types/tea.ts";
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
  quality_assignments: {
    id: number;
    tea_quality: {
      id: number;
      name: string;
    };
    value: string;
    tea: number;
  }[];
}

const transformTea = (serverTea: ServerTea) => {
  return {
    id: serverTea.id,
    name: serverTea.name,
    description: serverTea.description,
    created_at: serverTea.created_at,
    teaIngredients: serverTea.tea_ingredients,
    shop: serverTea.shop,
    qualities: serverTea.quality_assignments.map((qA) => ({
      id: qA.id,
      teaQuality: qA.tea_quality,
      value: qA.value,
      tea: qA.tea,
    })),
  } as Tea;
};

const getTeaById = async ({ id }: UseTeaByIdParams) => {
  const response = await api.get(`teas/${id}`);

  return transformTea(response.data) as TeaWithQualities;
};

const useTeaById = (
  params: UseTeaByIdParams,
  options?: QueryConfig<TeaWithQualities>,
) => {
  return useQuery({
    queryKey: ["tea", params],
    queryFn: () => getTeaById(params),
    ...options,
  });
};

export default useTeaById;
