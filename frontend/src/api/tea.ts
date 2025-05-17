import api from './api';

export interface Tea {
  id: number;
  name: string;
  shop: {
    id: number;
    name: string;
  };
  teaIngredients: Array<{
    id: number;
    name: string;
  }>;
}

export const teaApi = {
  getTeas: async (): Promise<Tea[]> => {
    const response = await api.get('/teas/');
    return response.data;
  },
}; 