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
  img_url: string;
}

export interface ShopWithTeas {
  id: number;
  name: string;
  city: string;
  street: string;
  postal_code: string;
  country: string;
  email: string;
  number: string;
  url: string;
  img_url: string;
  teas: {
    id: number;
    name: string;
  }[];
}
