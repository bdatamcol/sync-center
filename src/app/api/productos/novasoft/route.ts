import { NextResponse } from 'next/server';

const AUTH_URL = process.env.NS_AUTH_URL || process.env.API_BASE_URL || 'http://190.85.4.139:3000/api/auth';
const PRODUCTS_URL = process.env.NS_PRODUCTS_URL || 'http://190.85.4.139:3000/api/productos/novasoft';
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
  cachedToken = data.token;
  // Expira en 1 hora por defecto si no viene expiresIn
  const ttlMs = typeof data.expiresIn === 'number' ? data.expiresIn * 1000 : 60 * 60 * 1000;
  tokenExpiresAt = Date.now() + ttlMs;
  return cachedToken!;
}

export async function GET() {
  try {
    const token = await getToken();
    const res = await fetch(PRODUCTS_URL, {
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