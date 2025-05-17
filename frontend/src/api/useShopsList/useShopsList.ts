import { useQuery } from "@tanstack/react-query";
import api from "@/api/api";
import { Shop } from "@/components/types/shop";

interface ServerShop {
  id: number;
  name: string;
  description?: string;
  img_url?: string;
  created_at: string;
}

const transformShop = (serverShop: ServerShop): Shop => {
  return {
    id: serverShop.id,
    name: serverShop.name,
    description: serverShop.description,
    img_url: serverShop.img_url,
    created_at: serverShop.created_at,
  };
};

const getShopsList = async () => {
  const response = await api.get("shops");
  return response.data.map(transformShop) as Shop[];
};

const useShopsList = () => {
  return useQuery({
    queryKey: ["shops"],
    queryFn: getShopsList,
  });
};

export default useShopsList; 