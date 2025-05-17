import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { teaConsumptionApi, TeaConsumption, TeaConsumptionStats } from '@/api/teaConsumption';
import { LuCoffee, LuTrendingUp, LuClock, LuTrash2 } from 'react-icons/lu';
import { toast } from 'sonner';

const HomePage: React.FC = () => {
  const queryClient = useQueryClient();

  const { data: stats, isLoading } = useQuery<TeaConsumptionStats>({
    queryKey: ['teaConsumptionStats'],
    queryFn: async () => {
      const response = await teaConsumptionApi.getConsumptionStats();
      return response.data;
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async ({ teaId, consumptionId }: { teaId: number; consumptionId: number }) => {
      console.log('Deleting consumption:', { teaId, consumptionId });
      try {
        await teaConsumptionApi.deleteTeaConsumption(teaId, consumptionId);
      } catch (error) {
        console.error('Delete error:', error);
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teaConsumptionStats'] });
      toast.success('Tea consumption deleted successfully');
    },
    onError: (error) => {
      console.error('Mutation error:', error);
      toast.error('Failed to delete tea consumption');
    },
  });

  const handleDelete = (teaId: number, consumptionId: number) => {
    if (window.confirm('Are you sure you want to delete this consumption record?')) {
      deleteMutation.mutate({ teaId, consumptionId });
    }
  };

  if (isLoading) {
    return (
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="bg-gray-100 h-32 rounded-lg animate-pulse" />
          ))}
        </div>
        <div className="animate-pulse space-y-4">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="bg-gray-100 h-24 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Recent Tea Consumptions</h1>
        <p className="mt-2 text-gray-600">
          Track your tea drinking journey
        </p>
      </div>

      {/* Stats Section */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        {/* Total Consumptions */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-6">
          <div className="flex items-center gap-4">
            <div className="bg-primary/10 p-3 rounded-full">
              <LuCoffee className="w-6 h-6 text-primary" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-600">Total Consumptions</p>
              <p className="text-2xl font-semibold text-gray-900 mt-1">
                {stats?.total_consumptions || 0}
              </p>
            </div>
          </div>
        </div>

        {/* Most Consumed Tea */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-6">
          <div className="flex items-center gap-4">
            <div className="bg-primary/10 p-3 rounded-full">
              <LuTrendingUp className="w-6 h-6 text-primary" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-600">Most Consumed Tea</p>
              <p className="text-lg font-semibold text-gray-900 mt-1 line-clamp-1">
                {stats?.most_consumed_tea 
                  ? `${stats.most_consumed_tea.name} (${stats.most_consumed_tea.brand})`
                  : 'No data'}
              </p>
            </div>
          </div>
        </div>

        {/* Average Per Day */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-6">
          <div className="flex items-center gap-4">
            <div className="bg-primary/10 p-3 rounded-full">
              <LuClock className="w-6 h-6 text-primary" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-600">Average Per Day</p>
              <p className="text-2xl font-semibold text-gray-900 mt-1">
                {stats?.average_per_day || 0}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Consumption List */}
      <div className="space-y-4">
        {stats?.recent_consumptions.map((consumption: TeaConsumption) => (
          <div
            key={consumption.id}
            className="bg-white rounded-lg shadow-sm border border-gray-100 p-6 hover:shadow-md transition-shadow"
          >
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-4">
                <div className="bg-primary/10 p-3 rounded-full">
                  <LuCoffee className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <h3 className="font-medium text-gray-900">
                    {consumption.tea_details.name}
                  </h3>
                  <p className="text-sm text-gray-500 mt-1">
                    {consumption.tea_details.brand}
                  </p>
                  {consumption.notes && (
                    <p className="text-gray-600 mt-2">{consumption.notes}</p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-4">
                <time className="text-sm text-gray-500">
                  {format(new Date(consumption.consumed_at), 'PPp')}
                </time>
                <button
                  onClick={() => handleDelete(consumption.tea_details.id, consumption.id)}
                  className="text-gray-400 hover:text-red-500 transition-colors p-1 -mt-1"
                  title="Delete consumption"
                >
                  <LuTrash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        ))}

        {(!stats?.recent_consumptions || stats.recent_consumptions.length === 0) && (
          <div className="text-center py-12">
            <div className="bg-gray-50 rounded-full p-4 w-16 h-16 mx-auto mb-4">
              <LuCoffee className="w-8 h-8 text-gray-400 mx-auto" />
            </div>
            <h3 className="text-lg font-medium text-gray-900">No tea consumptions yet</h3>
            <p className="mt-2 text-gray-600">
              Start logging your tea consumption to track your journey
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default HomePage; 