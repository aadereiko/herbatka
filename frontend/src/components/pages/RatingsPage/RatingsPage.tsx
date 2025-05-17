import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Link } from 'react-router-dom';
import { teaRatingApi, TeaRating } from '@/api/teaRating';
import { LuStar, LuTrash2, LuPencil, LuCoffee } from 'react-icons/lu';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';

const RatingsPage: React.FC = () => {
  const queryClient = useQueryClient();
  const [editingRating, setEditingRating] = useState<TeaRating | null>(null);
  const [editComment, setEditComment] = useState('');

  const { data: ratings, isLoading } = useQuery({
    queryKey: ['userRatings'],
    queryFn: async () => {
      const response = await teaRatingApi.getUserRatings();
      return response.data;
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async ({ teaId, ratingId }: { teaId: number; ratingId: number }) => {
      await teaRatingApi.deleteRating(teaId, ratingId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['userRatings'] });
      toast.success('Rating deleted successfully');
    },
    onError: () => {
      toast.error('Failed to delete rating');
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ teaId, ratingId, data }: { 
      teaId: number; 
      ratingId: number; 
      data: { score: number; comment?: string } 
    }) => {
      await teaRatingApi.updateRating(teaId, ratingId, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['userRatings'] });
      setEditingRating(null);
      toast.success('Rating updated successfully');
    },
    onError: () => {
      toast.error('Failed to update rating');
    },
  });

  const handleDelete = (teaId: number, ratingId: number) => {
    if (window.confirm('Are you sure you want to delete this rating?')) {
      deleteMutation.mutate({ teaId, ratingId });
    }
  };

  const handleEdit = (rating: TeaRating) => {
    setEditingRating(rating);
    setEditComment(rating.comment || '');
  };

  const handleUpdate = (rating: TeaRating) => {
    updateMutation.mutate({
      teaId: rating.tea,
      ratingId: rating.id,
      data: { score: rating.score, comment: editComment }
    });
  };

  if (isLoading) {
    return (
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="animate-pulse space-y-4">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="bg-gray-100 h-32 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">My Tea Ratings</h1>
        <p className="mt-2 text-gray-600">
          A collection of all your tea ratings and reviews
        </p>
      </div>

      <div className="space-y-4">
        {ratings?.map((rating) => (
          <div
            key={rating.id}
            className="bg-white rounded-lg shadow-sm border border-gray-100 p-6 hover:shadow-md transition-shadow"
          >
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-4">
                <div className="bg-primary/10 p-3 rounded-full">
                  <LuCoffee className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <Link
                    to={`/teas/${rating.tea}`}
                    className="font-medium text-gray-900 hover:text-primary transition-colors"
                  >
                    {rating.tea_details?.name || 'Unknown Tea'}
                  </Link>
                  <div className="flex items-center gap-2 mt-2">
                    {[1, 2, 3, 4, 5].map((score) => (
                      <LuStar
                        key={score}
                        className={`w-4 h-4 ${
                          score <= rating.score
                            ? 'text-yellow-400 fill-yellow-400'
                            : 'text-gray-300'
                        }`}
                      />
                    ))}
                  </div>
                  {editingRating?.id === rating.id ? (
                    <div className="mt-4 space-y-2">
                      <textarea
                        value={editComment}
                        onChange={(e) => setEditComment(e.target.value)}
                        placeholder="Share your thoughts about this tea..."
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-primary focus:border-primary"
                        rows={3}
                      />
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          onClick={() => setEditingRating(null)}
                        >
                          Cancel
                        </Button>
                        <Button
                          onClick={() => handleUpdate(rating)}
                          disabled={updateMutation.isPending}
                        >
                          {updateMutation.isPending ? 'Saving...' : 'Save'}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      {rating.comment && (
                        <p className="text-gray-600 mt-2">{rating.comment}</p>
                      )}
                      <div className="flex items-center gap-2 mt-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEdit(rating)}
                          className="text-gray-400 hover:text-primary"
                        >
                          <LuPencil className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(rating.tea, rating.id)}
                          className="text-gray-400 hover:text-red-500"
                        >
                          <LuTrash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              </div>
              <div className="text-right">
                <time className="text-sm text-gray-500">
                  {format(new Date(rating.created_at), 'PPp')}
                </time>
                {rating.last_updated_at !== rating.created_at && (
                  <p className="text-xs text-gray-400 mt-1">
                    Edited {format(new Date(rating.last_updated_at), 'PPp')}
                  </p>
                )}
              </div>
            </div>
          </div>
        ))}

        {(!ratings || ratings.length === 0) && (
          <div className="text-center py-12">
            <div className="bg-gray-50 rounded-full p-4 w-16 h-16 mx-auto mb-4">
              <LuStar className="w-8 h-8 text-gray-400 mx-auto" />
            </div>
            <h3 className="text-lg font-medium text-gray-900">No ratings yet</h3>
            <p className="mt-2 text-gray-600">
              Start rating teas to build your collection
            </p>
            <Button
              variant="solid"
              className="mt-4"
              onClick={() => window.location.href = '/teas'}
            >
              Browse Teas
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

export default RatingsPage; 