import React from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/api/api";

const AddIngredientPage = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const addIngredientMutation = useMutation({
    mutationFn: async (formData: FormData) => {
      const response = await api.post("tea-ingredients/", {
        name: formData.get("name"),
        img_url: formData.get("img_url") || null,
      });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tea-ingredients"] });
      navigate("/ingredients");
    },
  });

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    addIngredientMutation.mutate(formData);
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">Add New Ingredient</h1>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700">
              Name
            </label>
            <input
              type="text"
              name="name"
              id="name"
              required
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          <div>
            <label htmlFor="img_url" className="block text-sm font-medium text-gray-700">
              Image URL (optional)
            </label>
            <input
              type="url"
              name="img_url"
              id="img_url"
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          <div className="flex justify-end space-x-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate("/ingredients")}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={addIngredientMutation.isPending}>
              {addIngredientMutation.isPending ? "Adding..." : "Add Ingredient"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddIngredientPage; 