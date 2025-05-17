import api from './api';

export interface TeaRating {
  id: number;
  score: number;
  comment: string | null;
  created_at: string;
  last_updated_at: string;
  user: number;
  tea: number;
  tea_details: {
    id: number;
    name: string;
  };
}

export interface TeaRatingStats {
  average_score: number;
  total_ratings: number;
  score_distribution: Record<number, number>;
}

export const teaRatingApi = {
  // Get all user's ratings
  getUserRatings: () =>
    api.get<TeaRating[]>('/ratings/'),

  // Get ratings for a specific tea
  getTeaRatings: (teaId: number) =>
    api.get<TeaRating[]>(`/teas/${teaId}/ratings/`),

  // Get rating stats for a specific tea
  getTeaRatingStats: (teaId: number) =>
    api.get<TeaRatingStats>(`/teas/${teaId}/ratings/stats/`),

  // Create a new rating
  createRating: (teaId: number, data: { score: number; comment?: string }) =>
    api.post<TeaRating>(`/teas/${teaId}/ratings/`, data),

  // Update a rating
  updateRating: (teaId: number, ratingId: number, data: { score: number; comment?: string }) =>
    api.patch<TeaRating>(`/teas/${teaId}/ratings/${ratingId}/`, data),

  // Delete a rating
  deleteRating: (teaId: number, ratingId: number) =>
    api.delete(`/teas/${teaId}/ratings/${ratingId}/`),
}; 