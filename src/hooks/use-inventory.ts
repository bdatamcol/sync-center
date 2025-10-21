import { useState, useEffect, useCallback } from 'react';
import { inventoryService, InventoryResponse, InventoryFilters } from '@/lib/inventory.service';

export interface UseInventoryReturn {
  data: InventoryResponse | null;
  loading: boolean;
  error: string | null;
  refetch: (filters?: InventoryFilters) => Promise<void>;
  setFilters: (filters: InventoryFilters) => void;
  filters: InventoryFilters;
}

export function useInventory(initialFilters?: InventoryFilters): UseInventoryReturn {
  const [data, setData] = useState<InventoryResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<InventoryFilters>(initialFilters || {});

  const fetchInventory = useCallback(async (fetchFilters?: InventoryFilters) => {
    setLoading(true);
    setError(null);

    try {
      const response = await inventoryService.getInventory(fetchFilters || filters);
      
      if (response.success) {
        setData(response);
      } else {
        setError(response.error || 'Error desconocido');
        setData(response); // Aún establecemos los datos para mostrar el estado vacío
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Error de conexión';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  const refetch = useCallback(async (newFilters?: InventoryFilters) => {
    if (newFilters) {
      setFilters(newFilters);
    }
    await fetchInventory(newFilters);
  }, [fetchInventory]);

  const updateFilters = useCallback((newFilters: InventoryFilters) => {
    setFilters(newFilters);
  }, []);

  useEffect(() => {
    fetchInventory();
  }, [fetchInventory]);

  return {
    data,
    loading,
    error,
    refetch,
    setFilters: updateFilters,
    filters,
  };
}