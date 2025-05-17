import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { MapPin, Star, Trash2, Edit2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { shopAddressApi, ShopAddress } from '@/api/shopAddress';

interface ShopAddressesProps {
  shopId: number;
}

export function ShopAddresses({ shopId }: ShopAddressesProps) {
  const queryClient = useQueryClient();

  const { data: addresses, isLoading } = useQuery({
    queryKey: ['shop-addresses', shopId],
    queryFn: () => shopAddressApi.getShopAddresses(shopId),
  });

  const deleteMutation = useMutation({
    mutationFn: ({ addressId }: { addressId: number }) =>
      shopAddressApi.deleteShopAddress(shopId, addressId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shop-addresses', shopId] });
      toast.success('Address deleted successfully');
    },
    onError: () => {
      toast.error('Failed to delete address');
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-24 animate-pulse rounded-lg bg-muted" />
        <div className="h-24 animate-pulse rounded-lg bg-muted" />
      </div>
    );
  }

  if (!addresses?.length) {
    return (
      <Card>
        <CardContent className="flex h-24 items-center justify-center">
          <p className="text-muted-foreground">No addresses found for this shop</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {addresses.map((address) => (
        <Card key={address.id}>
          <CardContent className="p-6">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-muted-foreground" />
                  <p className="font-medium">
                    {address.street}
                    {address.is_primary && (
                      <span className="ml-2 inline-flex items-center text-sm text-muted-foreground">
                        <Star className="mr-1 h-3 w-3 fill-current" />
                        Primary
                      </span>
                    )}
                  </p>
                </div>
                <p className="text-sm text-muted-foreground">
                  {address.city}, {address.postal_code}
                </p>
                <p className="text-sm text-muted-foreground">{address.country}</p>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    // TODO: Implement edit functionality
                    toast.info('Edit functionality coming soon');
                  }}
                >
                  <Edit2 className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    if (window.confirm('Are you sure you want to delete this address?')) {
                      deleteMutation.mutate({ addressId: address.id });
                    }
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
} 