import { ShopAddress } from "@/api/shopAddress";

export interface Shop {
  id: number;
  name: string;
  email?: string;
  number?: string;
  url?: string;
  img_url?: string;
  description?: string;
  created_at: string;
  primary_address?: ShopAddress;
  addresses?: ShopAddress[];
}

export interface ShopWithTeas extends Shop {
  teas: {
    id: number;
    name: string;
  }[];
}
