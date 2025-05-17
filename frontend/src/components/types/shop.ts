export interface Shop {
  id: number;
  name: string;
  city: string;
  street: string;
  postal_code: string;
  country: string;
  email: string;
  number: string;
  url: string;
  img_url?: string;
  description?: string;
  created_at: string;
}

export interface ShopWithTeas extends Shop {
  teas: {
    id: number;
    name: string;
  }[];
}
