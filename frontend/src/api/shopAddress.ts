import api from './api';

export interface ShopAddress {
  id: number;
  street: string;
  city: string;
  postal_code: string;
  country: string;
  is_primary: boolean;
  created_at: string;
  last_updated_at: string;
}

export interface ShopAddressCreate {
  street: string;
  city: string;
  postal_code: string;
  country: string;
  is_primary?: boolean;
}

export interface ShopAddressUpdate extends Partial<ShopAddressCreate> {}

export const shopAddressApi = {
  getShopAddresses: async (shopId: number): Promise<ShopAddress[]> => {
    const response = await api.get(`shops/${shopId}/addresses/`);
    return response.data;
  },

  getShopAddress: async (shopId: number, addressId: number): Promise<ShopAddress> => {
    const response = await api.get(`shops/${shopId}/addresses/${addressId}/`);
    return response.data;
  },

  createShopAddress: async (shopId: number, data: ShopAddressCreate): Promise<ShopAddress> => {
    const response = await api.post(`shops/${shopId}/addresses/`, data);
    return response.data;
  },

  updateShopAddress: async (shopId: number, addressId: number, data: ShopAddressUpdate): Promise<ShopAddress> => {
    const response = await api.patch(`shops/${shopId}/addresses/${addressId}/`, data);
    return response.data;
  },

  deleteShopAddress: async (shopId: number, addressId: number): Promise<void> => {
    await api.delete(`shops/${shopId}/addresses/${addressId}/`);
  },
}; 