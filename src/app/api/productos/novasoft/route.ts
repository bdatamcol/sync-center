import { NextResponse } from 'next/server';

const AUTH_URL = process.env.NS_AUTH_URL || 'http://192.168.1.32:8082/api/Authenticate';
const PRODUCTS_URL = process.env.NS_PRODUCTS_URL || 'http://192.168.1.32:8082/api/consultas/bodega-existencia';
const USER = process.env.NOVASOFT_USER || '';
const PASS = process.env.NOVASOFT_PASS || '';

// Sencillo caché de token en memoria del proceso
let cachedToken: string | null = null;
let tokenExpiresAt = 0; // epoch ms

async function getToken(): Promise<string> {
  const now = Date.now();
  if (cachedToken && tokenExpiresAt > now + 5000) {
    return cachedToken;
  }

  const res = await fetch(`${AUTH_URL}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: USER, password: PASS })
  });

  if (!res.ok) {
    const msg = await res.text();
    throw new Error(`Login Novasoft falló (${res.status}): ${msg}`);
  }

  const data = await res.json();
  const token = data.token || data.accessToken || data.access_token;
  
  if (!token) {
      throw new Error('No se recibió token en la respuesta de login');
  }
  
  cachedToken = token;
  // Expira en 1 hora por defecto si no viene expiresIn
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

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const token = await getToken();
    
    // Forward query parameters with defaults
    const targetUrl = new URL(PRODUCTS_URL);
    
    // Default params
    if (!searchParams.has('sucursal')) targetUrl.searchParams.append('sucursal', 'cuc');
    if (!searchParams.has('bodega')) targetUrl.searchParams.append('bodega', '080');
    if (!searchParams.has('empresa')) targetUrl.searchParams.append('empresa', 'cbb sas');
    if (!searchParams.has('page')) targetUrl.searchParams.append('page', '1');

    searchParams.forEach((value, key) => {
        // Overwrite or append? URLSearchParams append by default. 
        // We should delete defaults if user provided them, or just use set.
        // Let's use set to enforce user provided values if present, or defaults if not.
        targetUrl.searchParams.set(key, value);
    });
    
    const res = await fetch(targetUrl.toString(), {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    const contentType = res.headers.get('content-type') || '';
    if (!res.ok) {
      const payload = contentType.includes('application/json') ? await res.json() : await res.text();
      return NextResponse.json({ success: false, error: 'Error obteniendo productos', details: payload }, { status: res.status });
    }

    const data = contentType.includes('application/json') ? await res.json() : await res.text();
    // Normalizar a JSON si fuera texto
    const body = typeof data === 'string' ? { raw: data } : data;
    return NextResponse.json(body, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}