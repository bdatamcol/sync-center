// Base URLs sourced from environment for flexibility (client-safe NEXT_PUBLIC vars)
const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || '/api/auth';

// Novasoft endpoints from env
const NS_PRODUCTS_URL = process.env.NEXT_PUBLIC_NS_PRODUCTS_URL || '/api/productos/novasoft';
const NS_PRICES_URL = process.env.NEXT_PUBLIC_NS_PRICES_URL || '/api/con-precios';

// WooCommerce API Configuration from env with safe defaults
const WOOCOMMERCE_CONFIG = {
  url: (typeof process !== 'undefined' && (process.env.NEXT_PUBLIC_WC_URL || process.env.WC_URL)) || 'https://towncenter.co/',
  consumerKey: (typeof process !== 'undefined' && (process.env.NEXT_PUBLIC_WC_CONSUMER_KEY || process.env.WC_CONSUMER_KEY)) || 'ck_b11fce7a670af01eb9af281e07f1721dd263c0c8',
  consumerSecret: (typeof process !== 'undefined' && (process.env.NEXT_PUBLIC_WC_CONSUMER_SECRET || process.env.WC_CONSUMER_SECRET)) || 'cs_3149467594c309d9bd48b8536c951bb58973fd6d',
  version: (typeof process !== 'undefined' && (process.env.NEXT_PUBLIC_WC_VERSION || process.env.WC_VERSION)) || 'wc/v3'
};

export interface LoginCredentials {
  username: string;
  password: string;
}

export interface LoginResponse {
  success: boolean;
  token?: string;
  expiresIn?: string;
  user?: {
    username: string;
    role: string;
  };
  message?: string;
  error?: string;
}

export interface PriceData {
  codigo: string;
  descripcion: string;
  precioAnterior: number;
  precioActual: number;
  existencia: number;
}

export interface PricesResponse {
  success: boolean;
  data?: PriceData[];
  error?: string;
}

export interface Product {
  // Campos principales del nuevo JSON
  cod_item?: string;        // Código del producto
  des_item?: string;        // Descripción del producto
  existencia?: number;      // Stock/existencia
  por_iva?: number;         // Porcentaje de IVA
  empresa?: string;         // Empresa
  
  // Campos de precios (del endpoint de precios)
  precioAnterior?: number;
  precioActual?: number;
  
  // Campos adicionales que podrían venir en el futuro
  precio?: number;
  precio_venta?: number;
  categoria?: string;
  marca?: string;
  activo?: boolean;
  
  // Estados y control
  estado?: string;
  necesitaSync?: boolean;
  
  // Campo calculado de sincronización (UI)
  sincronizado?: 'Si' | 'No';
  
  // Fechas
  fechaCreacion?: string;
  fechaActualizacion?: string;
  
  // Permitir campos adicionales
  [key: string]: unknown;
}

// Interfaces para WooCommerce
export interface WooCommerceProduct {
  id: number;
  name: string;
  sku: string;
  regular_price: string;
  sale_price: string;
  stock_quantity: number;
  manage_stock: boolean;
  in_stock: boolean;
  status?: string;
}

export interface SyncResult {
  success: boolean;
  message: string;
  productData?: WooCommerceProduct;
  error?: string;
}

export interface IndividualSyncResult {
  product: string;
  success: boolean;
  message: string;
  productId?: number;
  productData?: Product;
}

export interface ProductsResponse {
  success: boolean;
  data?: Product[];
  error?: string;
}

class ApiService {
  private token: string | null = null;

  constructor() {
    // Recuperar token del localStorage si existe
    if (typeof window !== 'undefined') {
      this.token = localStorage.getItem('token');
    }
  }

  // Método para establecer el token programáticamente (útil para server-side)
  setToken(token: string): void {
    this.token = token;
  }

  // Establece un token local y lo persiste en localStorage para modo fallback
  setLocalToken(username: string): void {
    const localToken = `local:${username}`;
    this.token = localToken;
    if (typeof window !== 'undefined') {
      localStorage.setItem('token', localToken);
    }
  }

  // Método para obtener el token actual
  getToken(): string | null {
    return this.token;
  }

  async login(credentials: LoginCredentials): Promise<LoginResponse> {
    try {
      console.log('Intentando autenticación con API:', `${API_BASE_URL}/login`);
      
      const response = await fetch(`${API_BASE_URL}/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(credentials),
      });

      console.log('Response status:', response.status);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('Error response:', errorText);
        return {
          success: false,
          error: `Error HTTP ${response.status}: ${response.statusText}`,
        };
      }

      const data = await response.json();
      console.log('Auth response data:', data);

      if (data.token) {
        this.token = data.token;
        if (typeof window !== 'undefined') {
          localStorage.setItem('token', data.token);
        }
        return {
          success: true,
          token: data.token,
          expiresIn: data.expiresIn,
          user: data.user,
          message: data.message || 'Autenticación exitosa'
        };
      } else {
        return {
          success: false,
          error: data.message || data.error || 'No se recibió token de autenticación'
        };
      }
    } catch (error) {
      console.error('Error en login:', error);
      return {
        success: false,
        error: `Error de conexión: ${error instanceof Error ? error.message : 'Error desconocido'}`,
      };
    }
  }

  async getProducts(): Promise<ProductsResponse> {
    const isProxy = typeof NS_PRODUCTS_URL === 'string' && NS_PRODUCTS_URL.startsWith('/');
    if (!this.token && !isProxy) {
      return {
        success: false,
        error: 'Token de autenticación requerido',
      };
    }

    const fetchWithTimeout = async (input: RequestInfo | URL, init: RequestInit & { timeoutMs?: number } = {}) => {
      const { timeoutMs = 15000, ...opts } = init;
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), timeoutMs);
      try {
        return await fetch(input, { ...opts, signal: controller.signal });
      } finally {
        clearTimeout(id);
      }
    };

    try {
      console.log('Obteniendo productos de la API:', NS_PRODUCTS_URL);
      console.log('Token:', this.token);
      
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (this.token && !isProxy) headers['Authorization'] = `Bearer ${this.token}`;

      const response = await fetchWithTimeout(NS_PRODUCTS_URL, {
        method: 'GET',
        headers,
        timeoutMs: 15000
      });

      console.log('Response status:', response.status);
      console.log('Response headers:', Object.fromEntries(response.headers.entries()));

      if (!response.ok) {
        const ct = response.headers.get('content-type') || '';
        const errorPayload = ct.includes('application/json') ? await response.json() : await response.text();
        console.error('Error response:', errorPayload);
        let message = `Error HTTP ${response.status}: ${response.statusText}`;
        if (response.status === 404) message = 'Endpoint de productos no encontrado (404). Verifique la URL base.';
        if (response.status === 401) message = 'No autorizado (401). Token inválido o ausente.';
        return { success: false, error: message };
      }

      const ct = response.headers.get('content-type') || '';
      if (!ct.includes('application/json')) {
        console.error('Respuesta no JSON de la API de productos, content-type:', ct);
        return { success: false, error: 'Respuesta inesperada de la API (no JSON)' };
      }
      const data = await response.json();
      console.log('API Response:', data);

      let products: Product[] = [];
      
      if (Array.isArray(data)) {
        products = data;
      } else if (data.data && Array.isArray(data.data)) {
        products = data.data;
      } else if (data.productos && Array.isArray(data.productos)) {
        products = data.productos;
      } else {
        console.error('Estructura de respuesta inesperada:', data);
        return {
          success: false,
          error: 'Estructura de respuesta inesperada de la API',
        };
      }

      console.log('Productos procesados:', products);

      return {
        success: true,
        data: products,
      };
    } catch (error) {
      console.error('Error al obtener productos:', error);
      const msg = error instanceof Error ? error.message : 'Error desconocido';
      const isAbort = error instanceof Error && /aborted|AbortError/i.test(error.message);
      return { success: false, error: isAbort ? 'Timeout de la solicitud de productos' : `Error de conexión: ${msg}` };
    }
  }

  async getPrices(): Promise<PricesResponse> {
    const isProxy = typeof NS_PRICES_URL === 'string' && NS_PRICES_URL.startsWith('/');
    if (!this.token && !isProxy) {
      return {
        success: false,
        error: 'Token de autenticación requerido',
      };
    }

    const fetchWithTimeout = async (input: RequestInfo | URL, init: RequestInit & { timeoutMs?: number } = {}) => {
      const { timeoutMs = 15000, ...opts } = init;
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), timeoutMs);
      try {
        return await fetch(input, { ...opts, signal: controller.signal });
      } finally {
        clearTimeout(id);
      }
    };

    try {
      console.log('Obteniendo precios de la API:', NS_PRICES_URL);
      console.log('Token:', this.token);
      
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (this.token && !isProxy) headers['Authorization'] = `Bearer ${this.token}`;

      const response = await fetchWithTimeout(NS_PRICES_URL, {
        method: 'GET',
        headers,
        timeoutMs: 15000
      });

      console.log('Response status:', response.status);
      console.log('Response headers:', Object.fromEntries(response.headers.entries()));

      if (!response.ok) {
        const ct = response.headers.get('content-type') || '';
        const errorPayload = ct.includes('application/json') ? await response.json() : await response.text();
        console.error('Error response:', errorPayload);
        let message = `Error HTTP ${response.status}: ${response.statusText}`;
        if (response.status === 404) message = 'Endpoint de precios no encontrado (404).';
        if (response.status === 401) message = 'No autorizado (401).';
        return { success: false, error: message };
      }

      const ct = response.headers.get('content-type') || '';
      if (!ct.includes('application/json')) {
        console.error('Respuesta no JSON de la API de precios, content-type:', ct);
        return { success: false, error: 'Respuesta inesperada de la API (no JSON)' };
      }
      const data = await response.json();
      console.log('API Response (precios):', data);

      let prices: PriceData[] = [];
      
      // La respuesta viene con estructura {success, count, data}
      if (data.success && data.data && Array.isArray(data.data)) {
        prices = data.data;
      } else if (Array.isArray(data)) {
        prices = data;
      } else if (data.data && Array.isArray(data.data)) {
        prices = data.data;
      } else {
        console.error('Estructura de respuesta inesperada:', data);
        return {
          success: false,
          error: 'Estructura de respuesta inesperada de la API',
        };
      }

      console.log('Precios procesados:', prices);
      console.log('Primer precio:', prices[0]);

      return {
        success: true,
        data: prices,
      };
    } catch (error) {
      console.error('Error al obtener precios:', error);
      const msg = error instanceof Error ? error.message : 'Error desconocido';
      const isAbort = error instanceof Error && /aborted|AbortError/i.test(error.message);
      return { success: false, error: isAbort ? 'Timeout de la solicitud de precios' : `Error de conexión: ${msg}` };
    }
  }

  logout() {
    this.token = null;
    if (typeof window !== 'undefined') {
      localStorage.removeItem('token');
    }
  }

  isAuthenticated(): boolean {
    return this.token !== null;
  }

  // Funciones de WooCommerce
  private async makeWooCommerceRequest(
    endpoint: string,
    method: 'GET' | 'POST' | 'PUT' = 'GET',
    data?: Record<string, unknown>,
    opts: { retries?: number; retryDelayMs?: number } = {}
  ) {
    const auth = btoa(`${WOOCOMMERCE_CONFIG.consumerKey}:${WOOCOMMERCE_CONFIG.consumerSecret}`);
    const url = `${WOOCOMMERCE_CONFIG.url}wp-json/${WOOCOMMERCE_CONFIG.version}/${endpoint}`;
    const { retries = 3, retryDelayMs = 500 } = opts;

    let attempt = 0;
    while (true) {
      const options: RequestInit = {
        method,
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/json',
        },
      };

      if (data && (method === 'POST' || method === 'PUT')) {
        options.body = JSON.stringify(data);
      }

      let response: Response;
      try {
        response = await fetch(url, options);
      } catch (networkErr) {
        if (attempt < retries) {
          const delay = retryDelayMs * Math.pow(2, attempt) + Math.floor(Math.random() * 100);
          await new Promise((r) => setTimeout(r, delay));
          attempt++;
          continue;
        }
        throw networkErr;
      }

      if (response.ok) {
        try {
          return await response.json();
        } catch {
          return undefined;
        }
      }

      const status = response.status;
      const retriable = status === 429 || status === 502 || status === 503 || status === 504;
      if (!retriable || attempt >= retries) {
        // Intentar extraer detalles de error de WooCommerce
        try {
          const errorJson = await response.json();
          const detail = (typeof errorJson === 'object' && errorJson && 'message' in errorJson)
            ? String((errorJson as { message?: unknown }).message ?? '')
            : JSON.stringify(errorJson);
          throw new Error(`WooCommerce API Error: ${response.status} ${response.statusText} - ${detail}`);
        } catch {
          const errorText = await response.text();
          throw new Error(`WooCommerce API Error: ${response.status} ${response.statusText} - ${errorText}`);
        }
      }

      const retryAfter = Number(response.headers.get('Retry-After') || 0);
      const baseDelay = retryAfter ? retryAfter * 1000 : retryDelayMs * Math.pow(2, attempt);
      const jitter = Math.floor(Math.random() * 250);
      await new Promise((r) => setTimeout(r, baseDelay + jitter));
      attempt++;
    }
  }

  async searchProductBySku(sku: string): Promise<WooCommerceProduct | null> {
    try {
      console.log(`Buscando producto con SKU: ${sku}`);
      const products = await this.makeWooCommerceRequest(`products?sku=${encodeURIComponent(sku)}`);
      
      if (products && products.length > 0) {
        console.log('Producto encontrado:', products[0]);
        return products[0];
      }
      
      console.log('Producto no encontrado');
      return null;
    } catch (error) {
      console.error('Error buscando producto:', error);
      throw error;
    }
  }

  // Obtener todos los productos de WooCommerce con paginación
  async getAllWooProducts(): Promise<WooCommerceProduct[]> {
    const perPage = 100;
    let page = 1;
    const all: WooCommerceProduct[] = [];
    try {
      // Paginación hasta que una página devuelva menos de perPage
      while (true) {
        const products = await this.makeWooCommerceRequest(`products?per_page=${perPage}&page=${page}&status=any&_fields=id,sku,regular_price,sale_price,stock_quantity,manage_stock,in_stock,status`);
        if (Array.isArray(products)) {
          all.push(...products);
          if (products.length < perPage) break;
          page += 1;
          // Pequeña pausa para evitar saturar la API
          await new Promise(resolve => setTimeout(resolve, 50));
        } else {
          break;
        }
      }
    } catch (error) {
      console.error('Error obteniendo todos los productos de WooCommerce:', error);
    }
    return all;
  }

  // Marcar como borrador y stock 0 todos los productos de WooCommerce que no estén en la lista de Novasoft
  async markMissingWooProductsAsDraft(
    novasoftProducts: Product[],
    onProgress?: (progress: { current: number; total: number; percentage: number }) => void
  ): Promise<{ updated: number; failed: number; totalCandidates: number; details: Array<{ id: number; sku: string; success: boolean; message?: string; error?: string }> }>
  {
    const details: Array<{ id: number; sku: string; success: boolean; message?: string; error?: string }> = [];
    let updated = 0;
    let failed = 0;

    // SKUs presentes en Novasoft
    const nsSkuSet = new Set(
      novasoftProducts
        .map(p => (p.cod_item || '').trim())
        .filter(s => s !== '')
    );

    // Obtener todos los productos de WooCommerce
    const wooAll = await this.getAllWooProducts();
    // Filtrar candidatos: productos de WooCommerce con SKU que NO están en Novasoft
    const candidates = wooAll.filter(p => (p.sku || '').trim() !== '' && !nsSkuSet.has(p.sku.trim()));

    for (let i = 0; i < candidates.length; i++) {
      const p = candidates[i];
      try {
        await this.updateWooCommerceProduct(p.id, {
          manage_stock: true,
          stock_quantity: 0,
          in_stock: false,
          status: 'draft'
        });
        updated += 1;
        details.push({ id: p.id, sku: p.sku, success: true, message: 'Marcado como borrador y stock 0' });
      } catch (error) {
        failed += 1;
        details.push({ id: p.id, sku: p.sku, success: false, error: error instanceof Error ? error.message : 'Error desconocido' });
      }

      if (onProgress) {
        onProgress({ current: i + 1, total: candidates.length, percentage: Math.round(((i + 1) / candidates.length) * 100) });
      }

      // Pequeña pausa para evitar saturar la API
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    return { updated, failed, totalCandidates: candidates.length, details };
  }

  // Obtener detalles de múltiples productos por SKU en una sola llamada
  async getWooProductsBySkus(skus: string[]): Promise<Map<string, WooCommerceProduct>> {
    const result = new Map<string, WooCommerceProduct>();
    try {
      const validSkus = skus.filter(s => s && s.trim() !== '').map(s => s.trim());
      if (validSkus.length === 0) return result;

      // WooCommerce limita 'per_page'. Consultar en lotes de 100 SKUs máximo
      const chunkSize = 100;
      for (let i = 0; i < validSkus.length; i += chunkSize) {
        const chunk = validSkus.slice(i, i + chunkSize);
        const skuQuery = chunk.map(sku => encodeURIComponent(sku)).join(',');
        const products = await this.makeWooCommerceRequest(`products?sku=${skuQuery}&per_page=100`);

        if (products && Array.isArray(products)) {
          products.forEach((product: WooCommerceProduct) => {
            if (product.sku) {
              result.set(product.sku.trim(), product);
            }
          });
        }
      }
      return result;
    } catch (error) {
      console.error('Error obteniendo productos de WooCommerce por SKUs:', error);
      return result;
    }
  }

  async checkProductExistence(sku: string): Promise<{ exists: boolean; error?: string }> {
    try {
      if (!sku || sku.trim() === '') {
        return { exists: false, error: 'SKU vacío' };
      }

      console.log(`Verificando existencia del producto con SKU: ${sku}`);
      const product = await this.searchProductBySku(sku.trim());
      
      return { exists: product !== null };
    } catch (error) {
      console.error('Error verificando existencia del producto:', error);
      return { 
        exists: false, 
        error: error instanceof Error ? error.message : 'Error desconocido' 
      };
    }
  }

  // Nueva función para verificación en lotes - más eficiente
  async checkMultipleProductsExistence(skus: string[]): Promise<Map<string, { exists: boolean; error?: string }>> {
    const results = new Map<string, { exists: boolean; error?: string }>();
    
    if (!skus || skus.length === 0) {
      return results;
    }

    try {
      // Filtrar SKUs válidos
      const validSkus = skus.filter(sku => sku && sku.trim() !== '').map(sku => sku.trim());
      
      if (validSkus.length === 0) {
        return results;
      }

      console.log(`Verificando existencia de ${validSkus.length} productos en lote`);
      
      // Crear consulta para múltiples SKUs usando el parámetro 'sku' con valores separados por comas
      // WooCommerce API permite buscar múltiples SKUs en una sola llamada
      const skuQuery = validSkus.map(sku => encodeURIComponent(sku)).join(',');
      const products = await this.makeWooCommerceRequest(`products?sku=${skuQuery}&per_page=100`);
      
      // Crear un mapa de productos encontrados por SKU
      const foundProducts = new Map<string, boolean>();
      if (products && Array.isArray(products)) {
        products.forEach((product: WooCommerceProduct) => {
          if (product.sku) {
            foundProducts.set(product.sku.trim(), true);
          }
        });
      }

      // Generar resultados para todos los SKUs solicitados
      validSkus.forEach(sku => {
        results.set(sku, {
          exists: foundProducts.has(sku) || false
        });
      });

      console.log(`Verificación en lote completada: ${foundProducts.size} productos encontrados de ${validSkus.length} consultados`);
      
    } catch (error) {
      console.error('Error en verificación en lote:', error);
      // En caso de error, marcar todos como no existentes con error
      skus.forEach(sku => {
        if (sku && sku.trim() !== '') {
          results.set(sku.trim(), {
            exists: false,
            error: error instanceof Error ? error.message : 'Error desconocido'
          });
        }
      });
    }

    return results;
  }

  // Verificación de sincronización de precio/stock entre Novasoft y WooCommerce
  async verifySingleProductSync(product: Product): Promise<{ exists: boolean; priceMatches: boolean; stockMatches: boolean; sincronizado: boolean }> {
    const sku = (product.cod_item || '').trim();
    if (!sku) {
      return { exists: false, priceMatches: false, stockMatches: false, sincronizado: false };
    }

    try {
      const woo = await this.searchProductBySku(sku);
      const exists = !!woo;

      if (!exists) {
        return { exists, priceMatches: false, stockMatches: false, sincronizado: false };
      }

      const nsAnterior = Number(product.precioAnterior || 0);
      const nsActual = Number(product.precioActual || 0);
      const nsStock = Number(product.existencia || 0);

      // Determinar precios esperados en WooCommerce según reglas usadas en create/sync
      let expectedRegular = 0;
      let expectedSale: number | undefined = undefined;
      const hasAnterior = nsAnterior > 0;
      const hasActual = nsActual > 0;
      if (hasAnterior && hasActual) {
        expectedRegular = nsAnterior;
        if (nsActual < nsAnterior) {
          expectedSale = nsActual;
        } else {
          expectedSale = undefined; // no debería haber oferta si no es menor
        }
      } else if (hasActual) {
        expectedRegular = nsActual;
        expectedSale = undefined;
      } else if (hasAnterior) {
        expectedRegular = nsAnterior;
        expectedSale = undefined;
      }

      const wcRegular = Number(woo!.regular_price || 0);
      const wcSaleRaw = (woo!.sale_price ?? '').toString();
      const wcSalePresent = wcSaleRaw.trim() !== '';
      const wcSale = wcSalePresent ? Number(wcSaleRaw) : undefined;

      const priceMatches = (
        wcRegular === expectedRegular &&
        ((expectedSale === undefined && !wcSalePresent) || (expectedSale !== undefined && wcSale === expectedSale))
      );

      const wcStock = Number(woo!.stock_quantity ?? 0);
      const stockMatches = wcStock === nsStock;

      const sincronizado = exists && priceMatches && stockMatches;
      return { exists, priceMatches, stockMatches, sincronizado };
    } catch (error) {
      console.error('Error verificando sincronización del producto:', error);
      return { exists: false, priceMatches: false, stockMatches: false, sincronizado: false };
    }
  }

  async verifyProductsSyncStatus(products: Product[]): Promise<Map<string, { exists: boolean; priceMatches: boolean; stockMatches: boolean; sincronizado: boolean }>> {
    const results = new Map<string, { exists: boolean; priceMatches: boolean; stockMatches: boolean; sincronizado: boolean }>();
    const skus = products
      .map(p => (p.cod_item || '').trim())
      .filter(s => s !== '');

    if (skus.length === 0) return results;

    try {
      // Obtener productos de WooCommerce en lote
      const wooMap = await this.getWooProductsBySkus(skus);

      // Evaluar cada producto
      products.forEach(product => {
        const sku = (product.cod_item || '').trim();
        if (!sku) return;
        const woo = wooMap.get(sku);
        const exists = !!woo;

        if (!exists) {
          results.set(sku, { exists, priceMatches: false, stockMatches: false, sincronizado: false });
          return;
        }

        const nsAnterior = Number(product.precioAnterior || 0);
        const nsActual = Number(product.precioActual || 0);
        const nsStock = Number(product.existencia || 0);

        let expectedRegular = 0;
        let expectedSale: number | undefined = undefined;
        const hasAnterior = nsAnterior > 0;
        const hasActual = nsActual > 0;
        if (hasAnterior && hasActual) {
          expectedRegular = nsAnterior;
          if (nsActual < nsAnterior) {
            expectedSale = nsActual;
          } else {
            expectedSale = undefined;
          }
        } else if (hasActual) {
          expectedRegular = nsActual;
        } else if (hasAnterior) {
          expectedRegular = nsAnterior;
        }

        const wcRegular = Number((woo!.regular_price ?? 0));
        const wcSaleRaw = (woo!.sale_price ?? '').toString();
        const wcSalePresent = wcSaleRaw.trim() !== '';
        const wcSale = wcSalePresent ? Number(wcSaleRaw) : undefined;

        const priceMatches = (
          wcRegular === expectedRegular &&
          ((expectedSale === undefined && !wcSalePresent) || (expectedSale !== undefined && wcSale === expectedSale))
        );

        const wcStock = Number(woo!.stock_quantity ?? 0);
        const stockMatches = wcStock === nsStock;

        const sincronizado = exists && priceMatches && stockMatches;
        results.set(sku, { exists, priceMatches, stockMatches, sincronizado });
      });
    } catch (error) {
      console.error('Error en verificación de sincronización en lote:', error);
      // Si falla la llamada, marcar todos como no sincronizados
      skus.forEach(sku => {
        results.set(sku, { exists: false, priceMatches: false, stockMatches: false, sincronizado: false });
      });
    }

    return results;
  }

  async updateWooCommerceProduct(productId: number, updateData: Partial<WooCommerceProduct>): Promise<WooCommerceProduct> {
    try {
      console.log(`Actualizando producto ${productId} con datos:`, updateData);
      const updatedProduct = await this.makeWooCommerceRequest(`products/${productId}`, 'PUT', updateData);
      console.log('Producto actualizado:', updatedProduct);
      return updatedProduct;
    } catch (error) {
      console.error('Error actualizando producto:', error);
      throw error;
    }
  }

  async batchUpdateWooProducts(
    updates: Array<{ id: number } & Partial<WooCommerceProduct>>
  ): Promise<{ updated: number; failed: number; responses: unknown[] }> {
    try {
      if (!updates || updates.length === 0) {
        return { updated: 0, failed: 0, responses: [] };
      }
      const chunkSize = 100;
      let updated = 0;
      let failed = 0;
      const responses: unknown[] = [];

      for (let i = 0; i < updates.length; i += chunkSize) {
        const chunk = updates.slice(i, i + chunkSize);
        try {
          const res = await this.makeWooCommerceRequest('products/batch', 'POST', { update: chunk }, { retries: 3, retryDelayMs: 600 });
          responses.push(res);
          const count = (typeof res === 'object' && res !== null && Array.isArray((res as { update?: unknown[] }).update))
            ? ((res as { update: unknown[] }).update.length)
            : chunk.length;
          updated += count;
        } catch (err) {
          failed += chunk.length;
          responses.push({ error: err instanceof Error ? err.message : String(err), chunk });
        }
        await new Promise(resolve => setTimeout(resolve, 120));
      }

      return { updated, failed, responses };
    } catch (error) {
      console.error('Error en batchUpdateWooProducts:', error);
      throw error;
    }
  }

  async createProductInWooCommerce(product: Product): Promise<SyncResult> {
    try {
      if (!product.cod_item || !product.cod_item.trim()) {
        return {
          success: false,
          message: 'El producto no tiene código SKU',
          error: 'SKU requerido para creación'
        };
      }

      const sku = product.cod_item.trim();

      // Comprobar si ya existe antes de crear
      const existing = await this.searchProductBySku(sku);
      if (existing) {
        return {
          success: false,
          message: 'El producto ya existe en WooCommerce',
          error: `Ya existe un producto con SKU: ${sku}`
        };
      }
      // Reglas de precios: asegurar consistencia y evitar errores
      let regularPrice = '0';
      let salePrice: string | undefined = undefined;
      let priceNotice = '';

      const hasPrecioAnterior = !!(product.precioAnterior && product.precioAnterior > 0);
      const hasPrecioActual = !!(product.precioActual && product.precioActual > 0);

      if (hasPrecioAnterior && hasPrecioActual) {
        // Usar precioAnterior como regular y precioActual como oferta si es menor
        regularPrice = product.precioAnterior!.toString();
        if ((product.precioActual as number) < (product.precioAnterior as number)) {
          salePrice = product.precioActual!.toString();
        } else {
          priceNotice = 'sale_price omitido por ser mayor o igual al regular_price';
        }
      } else if (hasPrecioActual) {
        // Si solo hay precioActual, usarlo como regular
        regularPrice = product.precioActual!.toString();
      } else if (hasPrecioAnterior) {
        regularPrice = product.precioAnterior!.toString();
      }

      const createData: {
        name: string;
        sku: string;
        type: 'simple';
        status: string;
        manage_stock: boolean;
        stock_quantity: number;
        stock_status: 'instock' | 'outofstock';
        regular_price: string;
        sale_price?: string;
      } = {
        name: (product.des_item && product.des_item.trim()) || sku,
        sku,
        type: 'simple',
        status: 'draft',
        manage_stock: true,
        stock_quantity: product.existencia || 0,
        stock_status: (product.existencia || 0) > 0 ? 'instock' : 'outofstock',
        regular_price: regularPrice,
      };

      if (salePrice) {
        createData.sale_price = salePrice;
      }

      console.log('Creando producto en WooCommerce:', createData);
      const createdProduct = await this.makeWooCommerceRequest('products', 'POST', createData);
      console.log('Producto creado:', createdProduct);

      return {
        success: true,
        message: `Producto creado exitosamente en WooCommerce${priceNotice ? ` (${priceNotice})` : ''}`,
        productData: createdProduct
      };

    } catch (error) {
      console.error('Error creando producto en WooCommerce:', error);
      return {
        success: false,
        message: 'Error durante la creación del producto',
        error: error instanceof Error ? error.message : 'Error desconocido'
      };
    }
  }

  async syncProductWithWooCommerce(product: Product): Promise<SyncResult> {
    try {
      if (!product.cod_item) {
        return {
          success: false,
          message: 'El producto no tiene código SKU',
          error: 'SKU requerido para sincronización'
        };
      }

      // Buscar producto en WooCommerce por SKU
      const wooProduct = await this.searchProductBySku(product.cod_item);
      
      if (!wooProduct) {
        return {
          success: false,
          message: 'Producto no encontrado en WooCommerce',
          error: `No se encontró producto con SKU: ${product.cod_item}`
        };
      }

      // Preparar datos de actualización
      const updateData: Partial<WooCommerceProduct> = {
        manage_stock: true,
        stock_quantity: product.existencia || 0,
        in_stock: (product.existencia || 0) > 0
      };

      // Actualizar precios si están disponibles
      if (product.precioAnterior && product.precioAnterior > 0) {
        updateData.regular_price = product.precioAnterior.toString();
      }
      
      if (product.precioActual && product.precioActual > 0) {
        updateData.sale_price = product.precioActual.toString();
      }

      // Actualizar producto en WooCommerce
      const updatedProduct = await this.updateWooCommerceProduct(wooProduct.id, updateData);

      return {
        success: true,
        message: 'Producto sincronizado exitosamente',
        productData: updatedProduct
      };

    } catch (error) {
      console.error('Error en sincronización:', error);
      return {
        success: false,
        message: 'Error durante la sincronización',
        error: error instanceof Error ? error.message : 'Error desconocido'
      };
    }
  }

  async createAllNonExistentProducts(
    products: Product[], 
    onProgress?: (progress: {
      current: number;
      total: number;
      percentage: number;
      currentProduct?: Product;
      lastResult?: SyncResult;
    }) => void
  ): Promise<{
    success: boolean;
    results: Array<{ product: Product; result: SyncResult }>;
    summary: { total: number; successful: number; failed: number };
  }> {
    const results: Array<{ product: Product; result: SyncResult }> = [];
    let successful = 0;
    let failed = 0;

    // Filtrar solo productos que no existen (usando la misma lógica que el frontend)
    const nonExistentProducts = products.filter(product => {
      if (product.cod_item) {
        const sku = product.cod_item.trim();
        // Si tenemos información de existencia, usarla
        // Si no tenemos información, asumir que no existe para permitir la creación
        return sku && sku !== '';
      }
      return false;
    });

    console.log(`Iniciando creación masiva de ${nonExistentProducts.length} productos`);

    // Procesamiento en paralelo fijo: lotes de 100 productos
    const BATCH_SIZE = 100;
    const batches: Product[][] = [];
    
    // Dividir productos en lotes
    for (let i = 0; i < nonExistentProducts.length; i += BATCH_SIZE) {
      batches.push(nonExistentProducts.slice(i, i + BATCH_SIZE));
    }

    let processedCount = 0;

    // Procesar cada lote en paralelo
    for (const batch of batches) {
      const batchPromises = batch.map(async (product) => {
        try {
          const result = await this.createProductInWooCommerce(product);
          return { product, result };
        } catch (error) {
          const errorResult: SyncResult = {
            success: false,
            message: 'Error durante la creación',
            error: error instanceof Error ? error.message : 'Error desconocido'
          };
          return { product, result: errorResult };
        }
      });

      // Esperar a que termine el lote actual
      const batchResults = await Promise.all(batchPromises);
      
      // Procesar resultados del lote
      for (const { product, result } of batchResults) {
        results.push({ product, result });
        processedCount++;
        
        if (result.success) {
          successful++;
        } else {
          failed++;
        }

        // Reportar progreso en tiempo real
        if (onProgress) {
          onProgress({
            current: processedCount,
            total: nonExistentProducts.length,
            percentage: Math.round((processedCount / nonExistentProducts.length) * 100),
            currentProduct: product,
            lastResult: result
          });
        }
      }

      // Pausa más corta entre lotes para mayor velocidad
      if (batches.indexOf(batch) < batches.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 50)); // Reducido de 200ms a 50ms
      }
    }

    return {
      success: successful > 0,
      results,
      summary: {
        total: nonExistentProducts.length,
        successful,
        failed
      }
    };
  }

  // Nueva función optimizada para sincronización masiva que solo actualiza productos existentes
  async syncAllProductsOptimized(
    products: Product[],
    callbacks?: {
      onProgress?: (current: number, total: number, message: string) => void;
      onBatchComplete?: (batchResults: Array<{
        product: string;
        success: boolean;
        message: string;
        responseTime?: number;
      }>) => void;
    }
  ): Promise<{
    success: boolean;
    results: Array<{ 
      product: string; 
      success: boolean; 
      message: string; 
      productId?: number;
      productData?: Product;
    }>;
    summary: { 
      total: number; 
      successful: number; 
      failed: number; 
      skipped: number;
      existingInWoo: number;
      totalNovasoft: number;
    };
  }> {
    const results: Array<{ product: Product; result: SyncResult }> = [];
    const validProducts = products.filter(p => p.cod_item && p.cod_item.trim());
    
    if (validProducts.length === 0) {
      return {
        success: true,
        results: [],
        summary: { 
          total: 0, 
          successful: 0, 
          failed: 0, 
          skipped: 0,
          existingInWoo: 0,
          totalNovasoft: products.length
        }
      };
    }

    const { onProgress = () => {}, onBatchComplete = () => {} } = callbacks || {};

    // Fase 1: Obtener todos los productos de WooCommerce
    onProgress(0, validProducts.length, 'Obteniendo lista de productos existentes en WooCommerce...');

    const wooProducts = await this.getAllWooProducts();
    const wooSkuMap = new Map<string, WooCommerceProduct>();
    
    // Crear mapa de SKUs existentes en WooCommerce
    wooProducts.forEach(wooProduct => {
      if (wooProduct.sku && wooProduct.sku.trim()) {
        wooSkuMap.set(wooProduct.sku.trim().toLowerCase(), wooProduct);
      }
    });

    // Fase 2: Filtrar productos que existen en WooCommerce
    if (callbacks?.onProgress) {
      onProgress(0, validProducts.length, `Comparando ${validProducts.length} productos de Novasoft con ${wooProducts.length} productos de WooCommerce...`);
    }

    const productsToSync: Product[] = [];
    const skippedProducts: Product[] = [];

    validProducts.forEach(product => {
      const sku = product.cod_item!.trim().toLowerCase();
      if (wooSkuMap.has(sku)) {
        productsToSync.push(product);
      } else {
        skippedProducts.push(product);
        // Agregar resultado para productos no encontrados
        results.push({
          product,
          result: {
            success: false,
            message: 'Producto no encontrado en WooCommerce - omitido',
            error: `SKU ${product.cod_item} no existe en WooCommerce`
          }
        });
      }
    });

    if (callbacks?.onProgress) {
      onProgress(0, productsToSync.length, `Sincronizando ${productsToSync.length} productos existentes (${skippedProducts.length} omitidos)...`);
    }

    // Fase 3: Sincronizar solo los productos que existen en WooCommerce (batch + diff)
    let successful = 0;
    let failed = 0;
    let processedCount = 0;

    // Construir diffs mínimos por producto
    const diffs: Array<{ id: number } & Partial<WooCommerceProduct>> = [];
    const idBySku = new Map<string, number>();
    productsToSync.forEach(p => {
      const skuKey = p.cod_item!.trim().toLowerCase();
      const w = wooSkuMap.get(skuKey)!;
      idBySku.set(skuKey, w.id);

      const nsStock = Number(p.existencia || 0);
      const inStock = nsStock > 0;

      const nsAnterior = Number(p.precioAnterior || 0);
      const nsActual = Number(p.precioActual || 0);
      let expectedRegular = 0;
      let expectedSale: number | undefined = undefined;
      const hasAnterior = nsAnterior > 0;
      const hasActual = nsActual > 0;
      if (hasAnterior && hasActual) {
        expectedRegular = nsAnterior;
        if (nsActual < nsAnterior) expectedSale = nsActual;
      } else if (hasActual) {
        expectedRegular = nsActual;
      } else if (hasAnterior) {
        expectedRegular = nsAnterior;
      }

      const upd: Partial<WooCommerceProduct> & { id: number } = { id: w.id };
      let changed = false;

      if (!w.manage_stock) { upd.manage_stock = true; changed = true; }
      const wcStock = Number(w.stock_quantity ?? 0);
      if (wcStock !== nsStock) { upd.stock_quantity = nsStock; changed = true; }
      const wcInStock = !!w.in_stock;
      if (wcInStock !== inStock) { upd.in_stock = inStock; changed = true; }

      const wcRegular = Number(w.regular_price || 0);
      if (expectedRegular > 0 && wcRegular !== expectedRegular) {
        upd.regular_price = String(expectedRegular);
        changed = true;
      }

      const wcSaleRaw = (w.sale_price ?? '').toString();
      const wcSalePresent = wcSaleRaw.trim() !== '';
      const wcSale = wcSalePresent ? Number(wcSaleRaw) : undefined;

      if (expectedSale === undefined) {
        if (wcSalePresent) { upd.sale_price = ''; changed = true; }
      } else {
        if (!wcSalePresent || wcSale !== expectedSale) {
          upd.sale_price = String(expectedSale);
          changed = true;
        }
      }

      if (changed) diffs.push(upd);
    });

    const finalResults: Array<{ 
      product: string; 
      success: boolean; 
      message: string; 
      productId?: number;
      productData?: Product;
    }> = [];

    const BATCH_SIZE = 100;
    for (let i = 0; i < diffs.length; i += BATCH_SIZE) {
      const chunk = diffs.slice(i, i + BATCH_SIZE);
      try {
        await this.makeWooCommerceRequest('products/batch', 'POST', { update: chunk }, { retries: 3, retryDelayMs: 600 });
        for (const u of chunk) {
          const sku = Array.from(idBySku.keys()).find(k => idBySku.get(k) === u.id) || '';
          const p = productsToSync.find(pp => pp.cod_item!.trim().toLowerCase() === sku)!;
          finalResults.push({
            product: p.cod_item || 'Sin código',
            success: true,
            message: 'Actualizado por lotes (diff)',
            productId: u.id,
            productData: p
          });
          successful++;
          processedCount++;
          if (callbacks?.onProgress) {
            onProgress(processedCount, productsToSync.length, `Actualizando por lotes... (${processedCount}/${productsToSync.length})`);
          }
        }
      } catch (err) {
        for (const u of chunk) {
          const sku = Array.from(idBySku.keys()).find(k => idBySku.get(k) === u.id) || '';
          const p = productsToSync.find(pp => pp.cod_item!.trim().toLowerCase() === sku)!;
          finalResults.push({
            product: p.cod_item || 'Sin código',
            success: false,
            message: err instanceof Error ? err.message : 'Error en actualización por lotes',
            productId: u.id,
            productData: p
          });
          failed++;
          processedCount++;
          if (callbacks?.onProgress) {
            onProgress(processedCount, productsToSync.length, `Actualizando por lotes... (${processedCount}/${productsToSync.length})`);
          }
        }
      }

      if (i + BATCH_SIZE < diffs.length) {
        await new Promise(resolve => setTimeout(resolve, 120));
      }
    }

    // Marcar productos sin cambios como omitidos (sin petición)
    const updatedIds = new Set(diffs.map(d => d.id));
    for (const p of productsToSync) {
      const id = idBySku.get(p.cod_item!.trim().toLowerCase())!;
      if (!updatedIds.has(id)) {
        finalResults.push({
          product: p.cod_item || 'Sin código',
          success: true,
          message: 'Sin cambios',
          productId: id,
          productData: p
        });
        processedCount++;
        if (callbacks?.onProgress) {
          onProgress(processedCount, productsToSync.length, `Sin cambios... (${processedCount}/${productsToSync.length})`);
        }
      }
    }

    const success = failed === 0;
    return {
      success,
      results: finalResults,
      summary: {
        total: validProducts.length,
        successful,
        failed,
        skipped: skippedProducts.length,
        existingInWoo: productsToSync.length,
        totalNovasoft: products.length
      }
    };
  }

  async syncAllProducts(
    products: Product[],
    onProgress?: (progress: {
      current: number;
      total: number;
      percentage: number;
      currentProduct?: Product;
      lastResult?: SyncResult;
    }) => void
  ): Promise<{
    success: boolean;
    results: Array<{ product: Product; result: SyncResult }>;
    summary: { total: number; successful: number; failed: number };
  }> {
    const results: Array<{ product: Product; result: SyncResult }> = [];
    let successful = 0;
    let failed = 0;

    // Filtrar productos con SKU válido
    const validProducts = products.filter(p => p.cod_item?.trim());

    // Procesamiento en paralelo fijo: lotes de 100 productos
    const BATCH_SIZE = 100;
    const batches: Product[][] = [];

    for (let i = 0; i < validProducts.length; i += BATCH_SIZE) {
      batches.push(validProducts.slice(i, i + BATCH_SIZE));
    }

    let processedCount = 0;

    for (const batch of batches) {
      // Concurrencia máxima de 10 procesos dentro del lote
      const CONCURRENCY_LIMIT = 10;

      const batchResults: Array<{ product: Product; result: SyncResult }> = [];
      let nextIndex = 0;

      const worker = async () => {
        while (true) {
          const i = nextIndex++;
          if (i >= batch.length) break;

          const product = batch[i];
          let result: SyncResult;
          try {
            result = await this.syncProductWithWooCommerce(product);
          } catch (error) {
            result = {
              success: false,
              message: 'Error during synchronization',
              error: error instanceof Error ? error.message : 'Unknown error'
            };
          }

          batchResults.push({ product, result });
          results.push({ product, result });
          processedCount++;

          if (result.success) {
            successful++;
          } else {
            failed++;
          }

          if (onProgress) {
            onProgress({
              current: processedCount,
              total: validProducts.length,
              percentage: Math.round((processedCount / validProducts.length) * 100),
              currentProduct: product,
              lastResult: result
            });
          }
        }
      };

      const workers = Array.from(
        { length: Math.min(CONCURRENCY_LIMIT, batch.length) },
        () => worker()
      );

      await Promise.all(workers);

      // Pausa corta entre lotes para estabilidad
      await new Promise(resolve => setTimeout(resolve, 50));
    }

    return {
      success: failed === 0,
      results,
      summary: {
        total: validProducts.length,
        successful,
        failed
      }
    };
  }
}

export const apiService = new ApiService();