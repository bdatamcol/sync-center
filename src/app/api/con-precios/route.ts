import { NextResponse } from 'next/server';

const AUTH_URL = process.env.NS_AUTH_URL || 'http://192.168.1.32:8082/api/Authenticate';
const PRICES_URL = process.env.NS_PRICES_URL || 'http://192.168.1.32:8082/api/consultas/listas';
const USER = process.env.NOVASOFT_USER || '';
const PASS = process.env.NOVASOFT_PASS || '';

let cachedToken: string | null = null;
let tokenExpiresAt = 0;

interface LoginResponse {
  token?: string;
  accessToken?: string;
  access_token?: string;
  expiresIn?: number;
}

interface PricesApiResponse {
  data?: unknown[];
  total_pages?: number;
}

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

  const raw: unknown = await res.json();

  let token: string | null = null;

  if (typeof raw === 'string') {
    token = raw;
  } else if (typeof raw === 'object' && raw !== null) {
    const data = raw as LoginResponse;
    token = data.token || data.accessToken || data.access_token || null;

    const ttlMs =
      typeof data.expiresIn === 'number'
        ? data.expiresIn * 1000
        : 3600 * 1000;

    tokenExpiresAt = Date.now() + ttlMs;
  }

  if (!token) {
    throw new Error('No se recibió token válido en la respuesta de login');
  }

  cachedToken = token;
  return token;
}

export async function GET() {
  try {
    const token = await getToken();

    const url = new URL(PRICES_URL);
    url.searchParams.append('sucursal', 'cuc');
    url.searchParams.append('bodega', '080');

    const allPrices: unknown[] = [];
    let page = 1;
    let totalPages = 1;

    do {
      url.searchParams.set('page', page.toString());

      const res = await fetch(url.toString(), {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!res.ok) {
        const payload = await res.text();
        return NextResponse.json(
          { success: false, error: payload },
          { status: res.status }
        );
      }

      const raw: unknown = await res.json();

      let pageData: unknown[] = [];

      if (typeof raw === 'object' && raw !== null) {
        const data = raw as PricesApiResponse;

        if (Array.isArray(data.data)) {
          pageData = data.data;
        } else if (Array.isArray(raw)) {
          pageData = raw;
        }

        if (typeof data.total_pages === 'number') {
          totalPages = data.total_pages;
        }
      }

      allPrices.push(...pageData);
      page++;
    } while (page <= totalPages);

    const prices = allPrices.map((item) => {
      if (typeof item !== 'object' || item === null) {
        return null;
      }

      const obj = item as Record<string, unknown>;

      return {
        codigo: obj.cod_item,
        descripcion: '',
        precioActual: obj.precioiva ?? obj.pre_vta,
        precioAnterior: obj.pre_vta,
        existencia: 0
      };
    }).filter(Boolean);

    return NextResponse.json({ success: true, data: prices });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Error desconocido';

    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
