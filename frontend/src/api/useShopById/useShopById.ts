import { useQuery } from "@tanstack/react-query";
import api, { QueryConfig } from "@/api/api.ts";
import { ShopWithTeas } from "@/components/types/shop.ts";

interface UseShopByIdParams {
  id: string;
}

const getShopById = async (id: string) => {
  const response = await api.get<ShopWithTeas>(`shops/${id}`);

  // ALEX
  return response.data as ShopWithTeas;
};

const useShopById = (
  params: UseShopByIdParams,
  options?: QueryConfig<ShopWithTeas>,
) => {
  return useQuery({
    queryKey: ["shop", params],
    queryFn: () => getShopById(params.id),
    ...options,
  });
};

export default useShopById;
