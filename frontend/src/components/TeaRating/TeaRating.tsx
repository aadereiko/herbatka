import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { LuStar } from 'react-icons/lu';
import api from '@/api/api';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

interface TeaRatingProps {
  teaId: number;
  onRatingChange?: () => void;
}

interface RatingStats {
  average_score: number;
  total_ratings: number;
  score_distribution: Record<number, number>;
}

interface UserRating {
  id: number;
  score: number;
  comment: string | null;
  created_at: string;
  last_updated_at: string;
  user: number;
}

const TeaRating: React.FC<TeaRatingProps> = ({ teaId, onRatingChange }) => {
  const { user, isAuthenticated } = useAuth();
  const [hoveredRating, setHoveredRating] = useState<number | null>(null);
  const [showCommentForm, setShowCommentForm] = useState(false);
  const [comment, setComment] = useState('');
  const queryClient = useQueryClient();

  // Fetch rating stats
  const { data: stats } = useQuery<RatingStats>({
    queryKey: ['tea', teaId, 'rating-stats'],
    queryFn: async () => {
      const response = await api.get(`teas/${teaId}/ratings/stats/`);
      return response.data;
    },
  });

  // Fetch user's rating if authenticated
  const { data: userRating } = useQuery<UserRating | null>({
    queryKey: ['tea', teaId, 'user-rating'],
    queryFn: async () => {
      if (!isAuthenticated) return null;
      const response = await api.get(`teas/${teaId}/ratings/`);
      return response.data.find((r: UserRating) => r.user === user?.id) || null;
    },
    enabled: isAuthenticated,
  });

  // Rating mutation
  const ratingMutation = useMutation({
    mutationFn: async ({ score, comment }: { score: number; comment?: string }) => {
      const data = { 
        score, 
        comment,
        tea: teaId,
        user: user?.id
      };
      if (userRating) {
        return api.patch(`teas/${teaId}/ratings/${userRating.id}/`, data);
      }
      return api.post(`teas/${teaId}/ratings/`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tea', teaId, 'rating-stats'] });
      queryClient.invalidateQueries({ queryKey: ['tea', teaId, 'user-rating'] });
      setShowCommentForm(false);
      onRatingChange?.();
    },
  });

  useEffect(() => {
    if (userRating) {
      setComment(userRating.comment || '');
    }
  }, [userRating]);

  const handleRatingClick = (score: number) => {
    if (!isAuthenticated) {
      // TODO: Show login prompt
      return;
    }
    ratingMutation.mutate({ score });
  };

  const handleCommentSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!userRating) return;
    ratingMutation.mutate({ score: userRating.score, comment });
  };

  const displayRating = hoveredRating || (userRating?.score || 0);

  return (
    <div className="space-y-4">
      {/* Rating Stars */}
      <div className="flex items-center gap-2">
        <div className="flex items-center">
          {[1, 2, 3, 4, 5].map((score) => (
            <button
              key={score}
              type="button"
              className="p-1"
              onMouseEnter={() => setHoveredRating(score)}
              onMouseLeave={() => setHoveredRating(null)}
              onClick={() => handleRatingClick(score)}
              disabled={!isAuthenticated || ratingMutation.isPending}
            >
              <LuStar
                className={`w-6 h-6 transition-colors ${
                  score <= displayRating
                    ? 'text-yellow-400 fill-yellow-400'
                    : 'text-gray-300'
                }`}
              />
            </button>
          ))}
        </div>
        {stats && (
          <span className="text-sm text-gray-600">
            {stats.average_score.toFixed(1)} ({stats.total_ratings} ratings)
          </span>
        )}
      </div>

      {/* Rating Stats */}
      {stats && stats.total_ratings > 0 && (
        <div className="space-y-1">
          {[5, 4, 3, 2, 1].map((score) => {
            const count = stats.score_distribution[score] || 0;
            const percentage = (count / stats.total_ratings) * 100;
            return (
              <div key={score} className="flex items-center gap-2">
                <span className="text-sm text-gray-600 w-4">{score}</span>
                <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-yellow-400"
                    style={{ width: `${percentage}%` }}
                  />
                </div>
                <span className="text-sm text-gray-600 w-12">{count}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Comment Form */}
      {isAuthenticated && userRating && (
        <div className="mt-4">
          {!showCommentForm ? (
            <Button
              variant="ghost"
              onClick={() => setShowCommentForm(true)}
              className="text-sm"
            >
              {userRating.comment ? 'Edit Comment' : 'Add Comment'}
            </Button>
          ) : (
            <form onSubmit={handleCommentSubmit} className="space-y-2">
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Share your thoughts about this tea..."
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-primary focus:border-primary"
                rows={3}
              />
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setShowCommentForm(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={ratingMutation.isPending}
                >
                  {ratingMutation.isPending ? 'Saving...' : 'Save Comment'}
                </Button>
              </div>
            </form>
          )}
          {userRating.comment && !showCommentForm && (
            <p className="mt-2 text-sm text-gray-600">{userRating.comment}</p>
          )}
        </div>
      )}
    </div>
  );
};

export default TeaRating; 