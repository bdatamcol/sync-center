import { NextResponse } from 'next/server';

const AUTH_URL = process.env.NS_AUTH_URL || 'http://192.168.1.32:8082/api/Authenticate';
const PRICES_URL = process.env.NS_PRICES_URL || 'http://192.168.1.32:8082/api/consultas/listas';
const USER = process.env.NOVASOFT_USER || '';
const PASS = process.env.NOVASOFT_PASS || '';

let cachedToken: string | null = null;
let tokenExpiresAt = 0;

async function getToken(): Promise<string> {
  const now = Date.now();
  if (cachedToken && tokenExpiresAt > now + 5000) return cachedToken;

  const res = await fetch(`${AUTH_URL}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: USER, password: PASS })
  });

  if (!res.ok) {
    const details = await res.text();
    throw new Error(`Login Novasoft falló (${res.status}): ${details}`);
  }

  const data = await res.json();
  const token = data.token || data.accessToken || data.access_token;

  if (!token) {
      throw new Error('No se recibió token en la respuesta de login');
  }

  cachedToken = token;
  const expires = data.expiresIn || data.expires_at;
  let ttlMs = 60 * 60 * 1000;

  if (typeof expires === 'number') {
      ttlMs = expires * 1000;
  } else if (typeof expires === 'string') {
      const parsed = Date.parse(expires);
      if (!isNaN(parsed)) {
          ttlMs = parsed - Date.now();
      }
  }

  tokenExpiresAt = Date.now() + ttlMs;
  return cachedToken!;
}

async function fetchPage(token: string, baseUrl: string, params: URLSearchParams) {
    const url = new URL(baseUrl);
    params.forEach((value, key) => url.searchParams.append(key, value));
    
    const res = await fetch(url.toString(), {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
    });

    if (!res.ok) {
        const contentType = res.headers.get('content-type') || '';
        const payload = contentType.includes('application/json') ? await res.json() : await res.text();
        throw new Error(`Error obteniendo precios (${res.status}): ${JSON.stringify(payload)}`);
    }

    const contentType = res.headers.get('content-type') || '';
    const data = contentType.includes('application/json') ? await res.json() : JSON.parse(await res.text());
    return data;
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const token = await getToken();

    // Default params
    const baseParams = new URLSearchParams();
    if (!searchParams.has('sucursal')) baseParams.append('sucursal', 'cuc');
    if (!searchParams.has('bodega')) baseParams.append('bodega', '080');
    
    // Merge user params
    searchParams.forEach((value, key) => {
        baseParams.set(key, value);
    });

    let allRawItems: any[] = [];
    let firstResponseData: any = null;

    // If 'page' is explicitly requested, fetch only that page
    if (searchParams.has('page')) {
        const data = await fetchPage(token, PRICES_URL, baseParams);
        firstResponseData = data;
        if (data && typeof data === 'object') {
            if (Array.isArray(data.data)) allRawItems = data.data;
            else if (Array.isArray(data)) allRawItems = data;
        }
    } else {
        // Fetch ALL pages
        let page = 1;
        let totalPages = 1;

        do {
            baseParams.set('page', String(page));
            const data = await fetchPage(token, PRICES_URL, baseParams);
            
            if (page === 1) firstResponseData = data;

            let pageItems: any[] = [];
            if (data && typeof data === 'object') {
                if (Array.isArray(data.data)) pageItems = data.data;
                else if (Array.isArray(data)) pageItems = data;
                
                if (data.total_pages && typeof data.total_pages === 'number') {
                    totalPages = data.total_pages;
                }
            }
            
            allRawItems = allRawItems.concat(pageItems);
            page++;
        } while (page <= totalPages);
    }

    // Transformation logic: Group by cod_item and pivot prices
    const pricesMap = new Map();
    
    allRawItems.forEach((item: any) => {
        const code = item.cod_item ? String(item.cod_item).trim() : '';
        if (!code) return;

        if (!pricesMap.has(code)) {
            pricesMap.set(code, {
                codigo: code,
                descripcion: item.des_item || '',
                precioAnterior: 0,
                precioActual: 0,
                existencia: 0 // API de precios no trae existencia
            });
        }
        
        const entry = pricesMap.get(code);
        // Usar precioiva como precio final
        const precio = Number(item.precioiva || 0);
        const codLis = String(item.cod_lis || '').trim();

        if (codLis === '05' || codLis === '5') {
            entry.precioActual = precio;
        } else if (codLis === '22') {
            entry.precioAnterior = precio;
        }
    });

    const transformedData = Array.from(pricesMap.values());

    return NextResponse.json({
        success: true,
        data: transformedData,
        // Preserve pagination info if available (fake if aggregated)
        page: 1,
        total_pages: 1,
        total_rows: transformedData.length
    }, { status: 200 });

  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
