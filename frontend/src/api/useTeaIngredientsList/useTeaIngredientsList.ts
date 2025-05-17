import { useQuery } from "@tanstack/react-query";
import api from "@/api/api";
import { TeaIngredient } from "@/components/types/teaIngredient";

interface ServerTeaIngredient {
  id: number;
  name: string;
  created_at: string;
}

const transformTeaIngredient = (serverIngredient: ServerTeaIngredient): TeaIngredient => {
  return {
    id: serverIngredient.id,
    name: serverIngredient.name,
    created_at: serverIngredient.created_at,
  };
};

const getTeaIngredientsList = async () => {
  const response = await api.get("tea-ingredients");
  return response.data.map(transformTeaIngredient) as TeaIngredient[];
};

const useTeaIngredientsList = () => {
  return useQuery({
    queryKey: ["tea-ingredients"],
    queryFn: getTeaIngredientsList,
  });
};

export default useTeaIngredientsList; 