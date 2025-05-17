import React, { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import useShopById from "@/api/useShopById/useShopById.ts";
import { Button } from "@/components/ui/button.tsx";
import { ShopWithTeas } from "@/components/types/shop.ts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/api/api";

const ShopPage = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { id } = useParams<{ id: string }>();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  
  if (!id) {
    return <div>Shop ID not found</div>;
  }

  const { data: shop } = useShopById({ id }, { enabled: true });

  const deleteShopMutation = useMutation({
    mutationFn: async () => {
      await api.delete(`shops/${id}/`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shops"] });
      navigate("/shops");
    },
  });

  if (!shop) {
    return <div>Loading...</div>;
  }

  return (
    <div className="pt-10 px-6">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-8 mb-8">
          <div className="flex gap-8 items-start">
            <div className="flex-shrink-0 w-48 h-48 relative">
              {shop.img_url ? (
                <img
                  src={shop.img_url}
                  alt={shop.name}
                  className="w-full h-full object-cover rounded-lg"
                  onError={(e) => {
                    const target = e.target as HTMLImageElement;
                    target.src = "https://placehold.co/400x400/e2e8f0/64748b?text=No+Image";
                  }}
                />
              ) : (
                <div className="w-full h-full bg-gray-100 rounded-lg flex items-center justify-center text-gray-400">
                  No image
                </div>
              )}
            </div>

            <div className="flex-1">
              <div className="flex items-start justify-between mb-4">
                <h1 className="text-3xl font-bold text-gray-900">{shop.name}</h1>
                <div className="flex gap-2">
                  <Button variant="outline">Edit shop</Button>
                  <Button 
                    variant="outline" 
                    className="text-red-600 hover:text-red-700 hover:bg-red-50"
                    onClick={() => setShowDeleteConfirm(true)}
                  >
                    Delete shop
                  </Button>
                </div>
              </div>
              
              <div className="space-y-2 text-gray-600 mb-6">
                <p className="flex items-center gap-2">
                  <span className="font-medium">Address:</span>
                  {shop.street}
                </p>
                <p className="flex items-center gap-2">
                  <span className="font-medium">City:</span>
                  {shop.city}, {shop.postal_code}
                </p>
                <p className="flex items-center gap-2">
                  <span className="font-medium">Country:</span>
                  {shop.country}
                </p>
                {shop.email && (
                  <p className="flex items-center gap-2">
                    <span className="font-medium">Email:</span>
                    <a href={`mailto:${shop.email}`} className="text-primary-dark hover:underline">
                      {shop.email}
                    </a>
                  </p>
                )}
                {shop.number && (
                  <p className="flex items-center gap-2">
                    <span className="font-medium">Phone:</span>
                    <a href={`tel:${shop.number}`} className="text-primary-dark hover:underline">
                      {shop.number}
                    </a>
                  </p>
                )}
                {shop.url && (
                  <p className="flex items-center gap-2">
                    <span className="font-medium">Website:</span>
                    <a 
                      href={shop.url} 
                      target="_blank" 
                      rel="noopener noreferrer" 
                      className="text-primary-dark hover:underline"
                    >
                      Visit website
                    </a>
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-8">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold text-gray-900">Available Teas</h2>
            <Link to={`/teas/add?shop=${shop.id}`}>
              <Button variant="solid">Add tea</Button>
            </Link>
          </div>

          {shop.teas.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {shop.teas.map((tea: { id: number; name: string }) => (
                <Link
                  key={tea.id}
                  to={`/teas/${tea.id}`}
                  className="block p-4 rounded-lg border border-gray-100 hover:border-primary-light hover:shadow-sm transition-all duration-200"
                >
                  <h3 className="font-semibold text-gray-900 hover:text-primary-dark transition-colors duration-200">
                    {tea.name}
                  </h3>
                </Link>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              No teas available in this shop yet.
            </div>
          )}
        </div>
      </div>

      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Delete Shop</h3>
            <p className="text-gray-600 mb-6">
              Are you sure you want to delete "{shop.name}"? This action cannot be undone and will also delete all associated teas.
            </p>
            <div className="flex justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => setShowDeleteConfirm(false)}
                disabled={deleteShopMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                variant="solid"
                className="bg-red-600 hover:bg-red-700"
                onClick={() => deleteShopMutation.mutate()}
                disabled={deleteShopMutation.isPending}
              >
                {deleteShopMutation.isPending ? "Deleting..." : "Delete Shop"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ShopPage;
