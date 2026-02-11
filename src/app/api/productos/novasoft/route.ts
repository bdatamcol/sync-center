import { NextResponse } from 'next/server';

const AUTH_URL = process.env.NS_AUTH_URL || 'http://192.168.1.32:8082/api/Authenticate';
const PRODUCTS_URL = process.env.NS_PRODUCTS_URL || 'http://192.168.1.32:8082/api/consultas/bodega-existencia';
const USER = process.env.NOVASOFT_USER || '';
const PASS = process.env.NOVASOFT_PASS || '';

// Cache simple
let cachedToken: string | null = null;
let tokenExpiresAt = 0;

async function getToken(): Promise<string> {
  const now = Date.now();
  if (cachedToken && tokenExpiresAt > now + 5000) {
    return cachedToken;
  }

  console.log(`[API Productos] Iniciando login en: ${AUTH_URL}/login`);

  try {
    const res = await fetch(`${AUTH_URL}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: USER, password: PASS })
    });

    if (!res.ok) {
      const msg = await res.text();
      console.error(`[API Productos] Error login: ${res.status} ${res.statusText} - ${msg}`);
      throw new Error(`Login Novasoft falló (${res.status}): ${msg}`);
    }

    const data = await res.json();
    let token = null;
    if (typeof data === 'string') token = data;
    else if (data.token) token = data.token;
    else if (data.accessToken) token = data.accessToken;
    else if (data.access_token) token = data.access_token;
    
    if (!token) {
      console.error("[API Productos] No se encontró token en respuesta:", JSON.stringify(data));
      throw new Error("No se recibió token válido en login");
    }

    cachedToken = token;
    const ttlMs = (typeof data.expiresIn === 'number') ? data.expiresIn * 1000 : 3600 * 1000;
    tokenExpiresAt = Date.now() + ttlMs;
    return cachedToken!;
  } catch (error) {
    console.error("[API Productos] Excepción en getToken:", error);
    throw error;
  }
}

export async function GET() {
  console.log("[API Productos] Iniciando petición GET /api/productos/novasoft");
  try {
    const token = await getToken();
    
    const url = new URL(PRODUCTS_URL);
    url.searchParams.append('sucursal', 'cuc');
    url.searchParams.append('bodega', '080');
    url.searchParams.append('empresa', 'cbb sas');
    // page_size opcional si la API lo soporta para traer más datos por request
    // url.searchParams.append('page_size', '1000'); 

    let allProducts: any[] = [];
    let page = 1;
    let totalPages = 1;

    console.log(`[API Productos] Iniciando descarga de inventario completo...`);

    do {
      url.searchParams.set('page', page.toString());
      console.log(`[API Productos] Consultando página ${page} en: ${url.toString()}`);

      const res = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      console.log(`[API Productos] Respuesta página ${page} status: ${res.status}`);

      const contentType = res.headers.get('content-type') || '';
      if (!res.ok) {
        const payload = contentType.includes('application/json') ? await res.json() : await res.text();
        console.error(`[API Productos] Error en página ${page}:`, payload);
        // Si falla una página, devolvemos lo que llevamos o error?
        // Mejor lanzar error para reintentar o manejar parcial
        return NextResponse.json({ 
          success: false, 
          error: `Error API externa en página ${page} (${res.status})`, 
          details: payload 
        }, { status: res.status });
      }

      let data;
      if (contentType.includes('application/json')) {
        data = await res.json();
      } else {
        console.warn(`[API Productos] Respuesta no es JSON: ${contentType}`);
        const text = await res.text();
        try {
          data = JSON.parse(text);
        } catch (e) {
          data = text;
        }
      }

      // Normalizar respuesta de la página actual
      let pageProducts = [];
      if (data && typeof data === 'object') {
         if (data.data && Array.isArray(data.data)) pageProducts = data.data;
         else if (Array.isArray(data)) pageProducts = data;
         
         // Actualizar totalPages desde la respuesta de la API
         if (data.total_pages && typeof data.total_pages === 'number') {
           totalPages = data.total_pages;
         }
      }

      console.log(`[API Productos] Página ${page}: ${pageProducts.length} productos encontrados.`);
      allProducts = allProducts.concat(pageProducts);
      
      page++;
    } while (page <= totalPages);

    console.log(`[API Productos] Total productos descargados: ${allProducts.length}`);

    return NextResponse.json(allProducts, { status: 200 });
  } catch (err) {
    console.error("[API Productos] Error fatal en handler:", err);
    const message = err instanceof Error ? err.message : 'Error desconocido';
    return NextResponse.json({ 
      success: false, 
      error: message,
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}
