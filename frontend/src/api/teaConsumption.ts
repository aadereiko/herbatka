import api from './api';

export interface TeaConsumption {
  id: number;
  tea: number;
  tea_details: {
    id: number;
    name: string;
    brand: string;
  };
  consumed_at: string;
  notes: string;
}

export interface TeaConsumptionStats {
  total_consumptions: number;
  most_consumed_teas: Array<{
    tea__name: string;
    count: number;
  }>;
  recent_consumptions: TeaConsumption[];
}

export const teaConsumptionApi = {
  // Get consumption records for a specific tea
  getTeaConsumptions: (teaId: number) =>
    api.get<TeaConsumption[]>(`/teas/${teaId}/consumption/`),

  // Get a specific consumption record
  getTeaConsumption: (teaId: number, consumptionId: number) =>
    api.get<TeaConsumption>(`/teas/${teaId}/consumption/${consumptionId}/`),

  // Create a new consumption record
  createTeaConsumption: (teaId: number, data: Partial<TeaConsumption>) =>
    api.post<TeaConsumption>(`/teas/${teaId}/consumption/`, data),

  // Update a consumption record
  updateTeaConsumption: (
    teaId: number,
    consumptionId: number,
    data: Partial<TeaConsumption>
  ) =>
    api.patch<TeaConsumption>(
      `/teas/${teaId}/consumption/${consumptionId}/`,
      data
    ),

  // Delete a consumption record
  deleteTeaConsumption: (teaId: number, consumptionId: number) =>
    api.delete(`/teas/${teaId}/consumption/${consumptionId}/`),

  // Get user's consumption statistics
  getConsumptionStats: () =>
    api.get<TeaConsumptionStats>('/consumption/stats/'),

  // Get all user's consumption records
  getUserConsumptions: () =>
    api.get<TeaConsumption[]>('/consumption/'),
}; 