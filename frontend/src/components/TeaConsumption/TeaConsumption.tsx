import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { LuClock, LuPencil, LuTrash2, LuPlus } from 'react-icons/lu';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { teaConsumptionApi, TeaConsumption } from '@/api/teaConsumption';

interface TeaConsumptionProps {
  teaId: number;
}

export const TeaConsumptionComponent: React.FC<TeaConsumptionProps> = ({
  teaId,
}) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState({
    consumed_at: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
    notes: '',
  });

  // Fetch consumption records
  const { data: consumptions, isLoading } = useQuery({
    queryKey: ['teaConsumptions', teaId],
    queryFn: () => teaConsumptionApi.getTeaConsumptions(teaId),
    enabled: !!user,
  });

  // Create consumption mutation
  const createMutation = useMutation({
    mutationFn: (data: Partial<TeaConsumption>) =>
      teaConsumptionApi.createTeaConsumption(teaId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teaConsumptions', teaId] });
      setIsAdding(false);
      setFormData({
        consumed_at: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
        notes: '',
      });
    },
  });

  // Update consumption mutation
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<TeaConsumption> }) =>
      teaConsumptionApi.updateTeaConsumption(teaId, id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teaConsumptions', teaId] });
      setEditingId(null);
    },
  });

  // Delete consumption mutation
  const deleteMutation = useMutation({
    mutationFn: (id: number) =>
      teaConsumptionApi.deleteTeaConsumption(teaId, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teaConsumptions', teaId] });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingId) {
      updateMutation.mutate({ id: editingId, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const handleEdit = (consumption: TeaConsumption) => {
    setEditingId(consumption.id);
    setFormData({
      consumed_at: consumption.consumed_at,
      notes: consumption.notes || '',
    });
  };

  if (!user) {
    return (
      <div className="text-center text-gray-500 py-4">
        Please sign in to log your tea consumption
      </div>
    );
  }

  if (isLoading) {
    return <div className="text-center py-4">Loading...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">Tea Consumption History</h3>
        {!isAdding && !editingId && (
          <Button
            onClick={() => setIsAdding(true)}
            className="flex items-center gap-2"
          >
            <LuPlus className="w-4 h-4" />
            Log Consumption
          </Button>
        )}
      </div>

      {(isAdding || editingId) && (
        <form onSubmit={handleSubmit} className="space-y-4 bg-white p-4 rounded-lg shadow">
          <div>
            <label className="block text-sm font-medium text-gray-700">
              When did you drink this tea?
            </label>
            <input
              type="datetime-local"
              value={formData.consumed_at}
              onChange={(e) =>
                setFormData({ ...formData, consumed_at: e.target.value })
              }
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-teal-500 focus:ring-teal-500"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              Notes
            </label>
            <textarea
              value={formData.notes}
              onChange={(e) =>
                setFormData({ ...formData, notes: e.target.value })
              }
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-teal-500 focus:ring-teal-500"
              rows={3}
              placeholder="How was it? Any special brewing notes?"
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setIsAdding(false);
                setEditingId(null);
                setFormData({
                  consumed_at: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
                  notes: '',
                });
              }}
            >
              Cancel
            </Button>
            <Button type="submit">
              {editingId ? 'Update' : 'Log'} Consumption
            </Button>
          </div>
        </form>
      )}

      <div className="space-y-4">
        {consumptions?.data.map((consumption) => (
          <div
            key={consumption.id}
            className="bg-white p-4 rounded-lg shadow space-y-2"
          >
            <div className="flex justify-between items-start">
              <div className="flex items-center gap-2 text-gray-600">
                <LuClock className="w-4 h-4" />
                <span>
                  {format(new Date(consumption.consumed_at), 'PPp')}
                </span>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleEdit(consumption)}
                  disabled={!!editingId}
                >
                  <LuPencil className="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => deleteMutation.mutate(consumption.id)}
                  disabled={!!editingId}
                >
                  <LuTrash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>

            {consumption.notes && (
              <p className="text-gray-700">{consumption.notes}</p>
            )}
          </div>
        ))}

        {consumptions?.data.length === 0 && (
          <div className="text-center text-gray-500 py-4">
            No consumption records yet. Be the first to log your experience!
          </div>
        )}
      </div>
    </div>
  );
};

export default TeaConsumptionComponent; 