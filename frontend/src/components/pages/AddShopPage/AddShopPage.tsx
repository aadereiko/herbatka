import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/api/api";
import { LuPlus, LuTrash2 } from "react-icons/lu";

interface Address {
  street: string;
  city: string;
  postal_code: string;
  country: string;
  is_primary: boolean;
}

const AddShopPage = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [addresses, setAddresses] = useState<Address[]>([
    { street: "", city: "", postal_code: "", country: "", is_primary: true }
  ]);

  const addShopMutation = useMutation({
    mutationFn: async (formData: FormData) => {
      // First create the shop
      const shopResponse = await api.post("shops/", {
        name: formData.get("name"),
        description: formData.get("description"),
        email: formData.get("email"),
        phone: formData.get("number"),
        website_url: formData.get("url"),
        img_url: formData.get("img_url"),
      });

      const shopId = shopResponse.data.id;

      // Then create all addresses
      const addressPromises = addresses.map(address => 
        api.post(`shops/${shopId}/addresses/`, address)
      );
      await Promise.all(addressPromises);

      return shopResponse.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["shops"] });
      navigate(`/shops/${data.id}`);
    },
  });

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    addShopMutation.mutate(formData);
  };

  const addAddress = () => {
    setAddresses([...addresses, { street: "", city: "", postal_code: "", country: "", is_primary: false }]);
  };

  const removeAddress = (index: number) => {
    const newAddresses = [...addresses];
    const wasPrimary = newAddresses[index].is_primary;
    newAddresses.splice(index, 1);
    
    // If we removed the primary address and there are other addresses, make the first one primary
    if (wasPrimary && newAddresses.length > 0) {
      newAddresses[0].is_primary = true;
    }
    
    setAddresses(newAddresses);
  };

  const updateAddress = (index: number, field: keyof Address, value: string | boolean) => {
    const newAddresses = [...addresses];
    newAddresses[index] = { ...newAddresses[index], [field]: value };
    
    // If setting an address as primary, unset primary from others
    if (field === 'is_primary' && value === true) {
      newAddresses.forEach((addr, i) => {
        if (i !== index) addr.is_primary = false;
      });
    }
    
    setAddresses(newAddresses);
  };

  return (
    <div className="py-10 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Add New Shop</h1>
        <Button variant="outline" onClick={() => navigate("/shops")}>
          Cancel
        </Button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-6 space-y-6">
          {/* Basic Info */}
          <div className="space-y-4">
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-gray-700">
                Name *
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

          {/* Contact Info */}
          <div className="space-y-4">
            <h2 className="text-lg font-medium text-gray-900">Contact Information</h2>
            
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                Email
              </label>
              <input
                type="email"
                name="email"
                id="email"
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            <div>
              <label htmlFor="number" className="block text-sm font-medium text-gray-700">
                Phone Number
              </label>
              <input
                type="tel"
                name="number"
                id="number"
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            <div>
              <label htmlFor="url" className="block text-sm font-medium text-gray-700">
                Website URL
              </label>
              <input
                type="url"
                name="url"
                id="url"
                placeholder="https://"
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            <div>
              <label htmlFor="img_url" className="block text-sm font-medium text-gray-700">
                Image URL
              </label>
              <input
                type="url"
                name="img_url"
                id="img_url"
                placeholder="https://"
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>

          {/* Addresses */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-medium text-gray-900">Addresses</h2>
              <Button
                type="button"
                variant="outline"
                onClick={addAddress}
                className="flex items-center gap-2"
              >
                <LuPlus className="w-4 h-4" />
                Add Address
              </Button>
            </div>

            {addresses.map((address, index) => (
              <div key={index} className="p-4 border border-gray-200 rounded-lg space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-medium text-gray-900">Address {index + 1}</h3>
                  <div className="flex items-center gap-4">
                    <label className="flex items-center gap-2 text-sm text-gray-700">
                      <input
                        type="checkbox"
                        checked={address.is_primary}
                        onChange={(e) => updateAddress(index, 'is_primary', e.target.checked)}
                        className="rounded border-gray-300 text-primary focus:ring-primary"
                      />
                      Primary
                    </label>
                    {addresses.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => removeAddress(index)}
                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                      >
                        <LuTrash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Street *
                  </label>
                  <input
                    type="text"
                    value={address.street}
                    onChange={(e) => updateAddress(index, 'street', e.target.value)}
                    required
                    className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      City *
                    </label>
                    <input
                      type="text"
                      value={address.city}
                      onChange={(e) => updateAddress(index, 'city', e.target.value)}
                      required
                      className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      Postal Code *
                    </label>
                    <input
                      type="text"
                      value={address.postal_code}
                      onChange={(e) => updateAddress(index, 'postal_code', e.target.value)}
                      required
                      className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Country *
                  </label>
                  <input
                    type="text"
                    value={address.country}
                    onChange={(e) => updateAddress(index, 'country', e.target.value)}
                    required
                    className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex justify-end">
          <Button
            type="submit"
            variant="solid"
            disabled={addShopMutation.isPending}
          >
            {addShopMutation.isPending ? "Adding..." : "Add Shop"}
          </Button>
        </div>
      </form>
    </div>
  );
};

export default AddShopPage; 