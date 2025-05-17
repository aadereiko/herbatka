import React, { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import useShopsList from "@/api/useShopsList/useShopsList";
import useTeaQualitiesList from "@/api/useTeaQualitiesList/useTeaQualitiesList";
import useTeaIngredientsList from "@/api/useTeaIngredientsList/useTeaIngredientsList";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/api/api";
import { Shop } from "@/components/types/shop";
import { TeaIngredient } from "@/components/types/teaIngredient";
import capitalize from "lodash/capitalize";

const AddTeaPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { data: shops } = useShopsList();
  const { data: teaQualities } = useTeaQualitiesList();
  const { data: teaIngredients } = useTeaIngredientsList();

  const shopId = searchParams.get("shop");

  useEffect(() => {
    if (shopId && shops) {
      const shopExists = shops.some((shop: Shop) => shop.id === Number(shopId));
      if (!shopExists) {
        navigate("/teas/add");
      }
    }
  }, [shopId, shops, navigate]);

  const addTeaMutation = useMutation({
    mutationFn: async (formData: FormData) => {
      const response = await api.post("teas/", {
        name: formData.get("name"),
        shop: shopId || formData.get("shop"),
        description: formData.get("description"),
        tea_ingredients: formData.getAll("ingredients").map(Number),
        quality_assignments: teaQualities?.map((quality) => ({
          tea_quality: quality.id,
          value: formData.get(`quality_${quality.id}`) || quality.possibleValues[0],
        })),
      });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["teas"] });
      navigate(shopId ? `/shops/${shopId}` : "/teas");
    },
  });

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    addTeaMutation.mutate(formData);
  };

  return (
    <div className="py-10 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Add New Tea</h1>
        <Button variant="outline" onClick={() => navigate(shopId ? `/shops/${shopId}` : "/teas")}>
          Cancel
        </Button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-6 space-y-6">

          <div className="space-y-4">
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

            {!shopId && (
              <div>
                <label htmlFor="shop" className="block text-sm font-medium text-gray-700">
                  Shop
                </label>
                <select
                  name="shop"
                  id="shop"
                  required
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="">Select a shop</option>
                  {shops?.map((shop: Shop) => (
                    <option key={shop.id} value={shop.id}>
                      {shop.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label htmlFor="description" className="block text-sm font-medium text-gray-700">
                Description
              </label>
              <textarea
                name="description"
                id="description"
                rows={3}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>

          {/* Ingredients */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Ingredients
            </label>
            <div className="space-y-2">
              {teaIngredients?.map((ingredient: TeaIngredient) => (
                <label key={ingredient.id} className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    name="ingredients"
                    value={ingredient.id}
                    className="rounded border-gray-300 text-primary focus:ring-primary"
                  />
                  <span className="text-sm text-gray-700">{ingredient.name}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Qualities */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Qualities
            </label>
            <div className="space-y-4">
              {teaQualities?.map((quality) => (
                <div key={quality.id}>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {capitalize(quality.name)}
                  </label>
                  <select
                    name={`quality_${quality.id}`}
                    className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    {quality.possibleValues.map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="flex justify-end">
          <Button
            type="submit"
            variant="solid"
            disabled={addTeaMutation.isPending}
          >
            {addTeaMutation.isPending ? "Adding..." : "Add Tea"}
          </Button>
        </div>
      </form>
    </div>
  );
};

export default AddTeaPage; 