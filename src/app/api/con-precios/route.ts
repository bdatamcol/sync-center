import { NextResponse } from 'next/server';

const AUTH_URL = process.env.NS_AUTH_URL || 'http://192.168.1.32:8082/api/Authenticate';
const PRICES_URL = process.env.NS_PRICES_URL || 'http://192.168.1.32:8082/api/consultas/listas';
const USER = process.env.NOVASOFT_USER || '';
const PASS = process.env.NOVASOFT_PASS || '';

// Cache simple en memoria
let cachedToken: string | null = null;
let tokenExpiresAt = 0;

async function getToken(): Promise<string> {
  const now = Date.now();
  // Validar caché
  if (cachedToken && tokenExpiresAt > now + 5000) {
    return cachedToken;
  }

  console.log(`[API Precios] Iniciando login en: ${AUTH_URL}/login`);
  console.log(`[API Precios] Usuario: ${USER}`);
  
  try {
    const res = await fetch(`${AUTH_URL}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: USER, password: PASS })
    });

    if (!res.ok) {
      const msg = await res.text();
      console.error(`[API Precios] Error login: ${res.status} ${res.statusText} - ${msg}`);
      throw new Error(`Login Novasoft falló (${res.status}): ${msg}`);
    }

    const data = await res.json();
    console.log(`[API Precios] Login exitoso. Respuesta recibida.`);

    // Extracción de token más robusta
    let token = null;
    if (typeof data === 'string') token = data;
    else if (data.token) token = data.token;
    else if (data.accessToken) token = data.accessToken;
    else if (data.access_token) token = data.access_token;
    
    if (!token) {
      console.error("[API Precios] No se encontró token en respuesta:", JSON.stringify(data));
      throw new Error("No se recibió token válido en la respuesta de login");
    }

    cachedToken = token;
    // Default 1 hora si no viene expiración
    const ttlMs = (typeof data.expiresIn === 'number') ? data.expiresIn * 1000 : 3600 * 1000;
    tokenExpiresAt = Date.now() + ttlMs;
    
    return cachedToken!;
  } catch (error) {
    console.error("[API Precios] Excepción en getToken:", error);
    throw error;
  }
}

export async function GET() {
  console.log("[API Precios] Iniciando petición GET /api/con-precios");
  
  try {
    const token = await getToken();
    
    // Construir URL
    const url = new URL(PRICES_URL);
    url.searchParams.append('sucursal', 'cuc');
    url.searchParams.append('bodega', '080');
    
    let allPrices: any[] = [];
    let page = 1;
    let totalPages = 1;

    console.log(`[API Precios] Iniciando descarga de precios completa...`);

    do {
      url.searchParams.set('page', page.toString());
      console.log(`[API Precios] Consultando página ${page} en: ${url.toString()}`);

      const res = await fetch(url.toString(), {
        method: 'GET',
        headers: { 
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      console.log(`[API Precios] Respuesta página ${page} status: ${res.status}`);

      const contentType = res.headers.get('content-type') || '';
      if (!res.ok) {
        const payload = contentType.includes('application/json') ? await res.json() : await res.text();
        console.error(`[API Precios] Error en página ${page}:`, payload);
        return NextResponse.json({ 
          success: false, 
          error: `Error API externa (${res.status})`, 
          details: payload 
        }, { status: res.status });
      }

      let data;
      if (contentType.includes('application/json')) {
        data = await res.json();
      } else {
        console.warn(`[API Precios] Respuesta no es JSON: ${contentType}`);
        const text = await res.text();
        try {
          data = JSON.parse(text);
        } catch (e) {
          data = text;
        }
      }

      // Normalizar datos de la página actual
      let pagePrices: any[] = [];
      if (data && typeof data === 'object') {
        if (Array.isArray(data.data)) pagePrices = data.data;
        else if (Array.isArray(data)) pagePrices = data;

        // Actualizar totalPages
        if (data.total_pages && typeof data.total_pages === 'number') {
           totalPages = data.total_pages;
        }
      }
      
      console.log(`[API Precios] Página ${page}: ${pagePrices.length} precios encontrados.`);
      allPrices = allPrices.concat(pagePrices);

      page++;
    } while (page <= totalPages);
    
    console.log(`[API Precios] Total precios descargados: ${allPrices.length}`);

    const prices = allPrices.map((item: any) => ({
      codigo: item.cod_item,
      descripcion: '',
      precioActual: item.precioiva || item.pre_vta,
      precioAnterior: item.pre_vta,
      existencia: 0
    }));

    return NextResponse.json({ success: true, data: prices }, { status: 200 });

  } catch (err) {
    console.error("[API Precios] Error fatal en handler:", err);
    const message = err instanceof Error ? err.message : 'Error desconocido';
    // Importante: Devolver JSON válido incluso en error 500
    return NextResponse.json({ 
      success: false, 
      error: message,
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}
