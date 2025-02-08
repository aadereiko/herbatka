import { useQuery } from "@tanstack/react-query";
import api, { QueryConfig } from "@/api/api";
import { Shop } from "@/components/types/shop.ts";

const getShopList = async () => {
  const response = await api.get<Shop[]>("shops");

  // ALEX
  return response.data as Shop[];
};

const useShopList = (options?: QueryConfig<Shop[]>) => {
  return useQuery({
    queryKey: ["shops"],
    queryFn: () => getShopList(),
    ...options,
  });
};

export default useShopList;
