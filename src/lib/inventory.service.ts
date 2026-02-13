export interface InventoryItem {
  ciudad: string;
  ANO_ACU: string;
  COD_ITEM: string;
  DES_ITEM: string;
  COD_GRU: string;
  NOM_GRU: string;
  COD_MAR: string;
  DES_MAR: string;
  NOM_SUB: string;
  DES_MEDIDA: string;
  NOM_BOD: string;
  COD_BOD: string;
  cod_suc: string;
  UBI_EST: string | null;
  EXISTENCIA: number;
  VALOR: number;
  ult_comp: string;
  fecha_act: string;
  DiasUC: number;
  empresa: string;
}

export interface InventorySummary {
  total_existencia: number;
  total_valor: number;
  promedio_dias_ultima_compra: number;
  total_ciudades: number;
  total_empresas: number;
  total_items_unicos: number;
  total_grupos: number;
  total_marcas: number;
}

export interface InventoryFilters {
  ciudad?: string;
  empresa?: string;
  nom_gru?: string;
  page?: number;
  limit?: number;
}

export interface InventoryResponse {
  success: boolean;
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
  next: string | null;
  prev: string | null;
  data: InventoryItem[];
  summary: InventorySummary;
  filters: InventoryFilters;
  error?: string;
}

class InventoryService {
  private baseUrl = process.env.NEXT_PUBLIC_NS_PRODUCTS_URL || '/api/productos/novasoft';
  private filtersCacheKey = 'inventory_filters_cache_v1';
  private filtersCacheTTLMs = 24 * 60 * 60 * 1000; // 24h

  /**
   * Obtiene el token de autenticación desde localStorage
   */
  private getAuthToken(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem('token');
  }

  /**
   * Construye la URL con los parámetros de filtro
   */
  private buildUrl(filters?: InventoryFilters): string {
    const url = new URL(this.baseUrl);

    const ciudad = (filters?.ciudad || '').trim();
    const empresa = (filters?.empresa || '').trim();
    const nom_gru = (filters?.nom_gru || '').trim();

    if (ciudad) url.searchParams.set('ciudad', ciudad);
    if (empresa) url.searchParams.set('empresa', empresa);
    if (nom_gru) url.searchParams.set('nom_gru', nom_gru);

    url.searchParams.set('page', String(filters?.page ?? 1));
    url.searchParams.set('limit', String(filters?.limit ?? 10));

    return url.toString();
  }

  /**
   * Obtiene los datos del inventario con filtros opcionales (endpoint real)
   */
  async getInventory(filters?: InventoryFilters): Promise<InventoryResponse> {
    const token = this.getAuthToken();
    const safeFilters = filters || {};
    const defaultSummary: InventorySummary = {
      total_existencia: 0,
      total_valor: 0,
      promedio_dias_ultima_compra: 0,
      total_ciudades: 0,
      total_empresas: 0,
      total_items_unicos: 0,
      total_grupos: 0,
      total_marcas: 0
    };

    const emptyResponse: InventoryResponse = {
      success: false,
      page: safeFilters.page ?? 1,
      limit: safeFilters.limit ?? 10,
      total: 0,
      totalPages: 0,
      hasNext: false,
      hasPrev: false,
      next: null,
      prev: null,
      data: [],
      summary: defaultSummary,
      filters: {
        ciudad: safeFilters.ciudad || '',
        empresa: safeFilters.empresa || '',
        nom_gru: safeFilters.nom_gru || ''
      },
      error: token ? undefined : 'Token de autenticación requerido'
    };
    // if (!token) return emptyResponse;

    const url = this.buildUrl(safeFilters);

    try {
      const res = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        }
      });

      if (!res.ok) {
        const text = await res.text();
        return { ...emptyResponse, error: `Error HTTP ${res.status}: ${res.statusText} - ${text}` };
      }

      const json = await res.json();

      const response: InventoryResponse = {
        success: Boolean(json.success ?? true),
        page: Number(json.page ?? safeFilters.page ?? 1),
        limit: Number(json.limit ?? safeFilters.limit ?? 10),
        total: Number(json.total ?? (Array.isArray(json.data) ? json.data.length : 0)),
        totalPages: Number(
          json.totalPages ??
          (json.total && (json.limit ?? safeFilters.limit)
            ? Math.ceil(Number(json.total) / Number(json.limit ?? safeFilters.limit))
            : 0
          )
        ),
        hasNext: Boolean(json.hasNext ?? false),
        hasPrev: Boolean(json.hasPrev ?? false),
        next: json.next ?? null,
        prev: json.prev ?? null,
        data: Array.isArray(json.data) ? json.data : [],
        summary: (json.summary ?? defaultSummary),
        filters: json.filters ?? {
          ciudad: safeFilters.ciudad || '',
          empresa: safeFilters.empresa || '',
          nom_gru: safeFilters.nom_gru || ''
        }
      };

      return response;
    } catch (error) {
      return { ...emptyResponse, error: error instanceof Error ? error.message : 'Error desconocido' };
    }
  }

  /**
   * Cache helpers para opciones de filtros
   */
  getFilterOptionsCached(): { ciudades: string[]; empresas: string[]; grupos: string[] } | null {
    if (typeof window === 'undefined') return null;
    try {
      const raw = localStorage.getItem(this.filtersCacheKey);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as { options: { ciudades: string[]; empresas: string[]; grupos: string[] }; ts: number };
      if (this.isCacheValid(parsed.ts)) return parsed.options;
      return null;
    } catch {
      return null;
    }
  }

  private isCacheValid(ts?: number): boolean {
    if (!ts) return false;
    return Date.now() - ts < this.filtersCacheTTLMs;
  }

  private setFilterOptionsCache(options: { ciudades: string[]; empresas: string[]; grupos: string[] }) {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(this.filtersCacheKey, JSON.stringify({ options, ts: Date.now() }));
    } catch {}
  }

  /**
   * Obtiene opciones únicas para filtros (usa cache si está vigente)
   */
  async getFilterOptions(forceRefresh?: boolean): Promise<{ ciudades: string[]; empresas: string[]; grupos: string[] }> {
    if (!forceRefresh) {
      const cached = this.getFilterOptionsCached();
      if (cached) return cached;
    }
    return await this.fetchAndCacheFilterOptions();
  }

  /**
   * Recorre todas las páginas para construir ciudades/empresas/grupos y cachea el resultado
   */
  async fetchAndCacheFilterOptions(): Promise<{ ciudades: string[]; empresas: string[]; grupos: string[] }> {
    const token = this.getAuthToken();
    if (!token) return { ciudades: [], empresas: [], grupos: [] };

    const ciudades = new Set<string>();
    const empresas = new Set<string>();
    const grupos = new Set<string>();

    const limit = 1000;
    let page = 1;

    try {
      // Primera página
      const firstUrl = this.buildUrl({ page, limit });
      const firstRes = await fetch(firstUrl, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        }
      });
      if (!firstRes.ok) return { ciudades: [], empresas: [], grupos: [] };
      const firstJson = await firstRes.json();
      (firstJson.data || []).forEach((item: InventoryItem) => {
        if (item.ciudad) ciudades.add(String(item.ciudad).trim());
        if (item.empresa) empresas.add(String(item.empresa).trim());
        if (item.NOM_GRU) grupos.add(String(item.NOM_GRU).trim());
      });

      const totalPages = Number(
        firstJson.totalPages ??
        (firstJson.total && limit ? Math.ceil(Number(firstJson.total) / limit) : 1)
      );

      // Resto de páginas
      for (page = 2; page <= totalPages; page++) {
        const url = this.buildUrl({ page, limit });
        const res = await fetch(url, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          }
        });
        if (!res.ok) break;
        const json = await res.json();
        (json.data || []).forEach((item: InventoryItem) => {
          if (item.ciudad) ciudades.add(String(item.ciudad).trim());
          if (item.empresa) empresas.add(String(item.empresa).trim());
          if (item.NOM_GRU) grupos.add(String(item.NOM_GRU).trim());
        });
      }

      const result = {
        ciudades: Array.from(ciudades).sort(),
        empresas: Array.from(empresas).sort(),
        grupos: Array.from(grupos).sort()
      };

      this.setFilterOptionsCache(result);
      return result;
    } catch {
      return { ciudades: [], empresas: [], grupos: [] };
    }
  }
}

// Exportar una instancia singleton del servicio
export const inventoryService = new InventoryService();