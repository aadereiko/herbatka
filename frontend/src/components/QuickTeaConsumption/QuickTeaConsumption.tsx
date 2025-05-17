import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { LuCoffee } from 'react-icons/lu';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { teaConsumptionApi } from '@/api/teaConsumption';
import { teaApi, Tea } from '@/api/tea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/radix-select";

export const QuickTeaConsumption: React.FC = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);
  const [notes, setNotes] = useState('');
  const [selectedTeaId, setSelectedTeaId] = useState<string>('');

  const { data: teas } = useQuery<Tea[]>({
    queryKey: ['teas'],
    queryFn: teaApi.getTeas,
    enabled: !!user,
  });

  const createMutation = useMutation({
    mutationFn: (data: { teaId: number; notes: string }) =>
      teaConsumptionApi.createTeaConsumption(data.teaId, {
        consumed_at: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
        notes: data.notes,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teaConsumptions'] });
      setIsOpen(false);
      setNotes('');
      setSelectedTeaId('');
    },
  });

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedTeaId) return;
    createMutation.mutate({ teaId: parseInt(selectedTeaId), notes });
  };

  if (!user) {
    return null;
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="flex items-center gap-2 text-gray-600 hover:text-gray-900"
        >
          <LuCoffee className="w-4 h-4" />
          Log Tea
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px] bg-white">
        <DialogHeader>
          <DialogTitle className="text-gray-900">Log Tea Consumption</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Select Tea
            </label>
            <Select
              value={selectedTeaId}
              onValueChange={setSelectedTeaId}
            >
              <SelectTrigger>
                <SelectValue placeholder="Choose a tea..." />
              </SelectTrigger>
              <SelectContent>
                {teas?.map((tea) => (
                  <SelectItem key={tea.id} value={tea.id.toString()}>
                    {tea.name} ({tea.shop.name})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <p className="text-sm text-gray-500">
              Time: {format(new Date(), 'PPp')}
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Notes (optional)
            </label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="How was it? Any special brewing notes?"
              rows={3}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsOpen(false)}
              className="text-gray-700 hover:text-gray-900"
            >
              Cancel
            </Button>
            <Button 
              type="submit"
              disabled={!selectedTeaId}
              className="bg-primary text-white hover:bg-primary-dark"
            >
              Log Consumption
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default QuickTeaConsumption; 