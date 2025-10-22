import { useState, useEffect } from 'react';
import { inventoryService } from '@/lib/inventory.service';

export interface FilterOptions {
  ciudades: string[];
  empresas: string[];
  grupos: string[];
}

export function useFilterOptions() {
  const [options, setOptions] = useState<FilterOptions>({
    ciudades: [],
    empresas: [],
    grupos: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        // 1) Intentar cache para mostrar opciones completas al instante
        const cached = inventoryService.getFilterOptionsCached();
        if (cached && !cancelled) {
          setOptions(cached);
          setLoading(false);
        }

        // 2) Refrescar en segundo plano (recorre todas las páginas y actualiza cache)
        const fresh = await inventoryService.getFilterOptions(true);
        if (!cancelled) {
          setOptions(fresh);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Error cargando opciones');
          setLoading(false);
        }
      }
    };

    load();
    return () => { cancelled = true; };
  }, []);

  return { options, loading, error };
}