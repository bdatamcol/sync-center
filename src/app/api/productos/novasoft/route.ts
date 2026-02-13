import { NextResponse } from 'next/server';

const AUTH_URL = process.env.NS_AUTH_URL || 'http://192.168.1.32:8082/api/Authenticate';
const PRODUCTS_URL = process.env.NS_PRODUCTS_URL || 'http://192.168.1.32:8082/api/consultas/bodega-existencia';
const USER = process.env.NOVASOFT_USER || '';
const PASS = process.env.NOVASOFT_PASS || '';

interface ProductItem {
    cod_item: string;
    des_item: string;
    existencia: number;
    por_iva?: number;
    empresa?: string;
}

interface ProductApiResponse {
    data?: ProductItem[];
    total_pages?: number;
}


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

async function fetchPage(token: string, baseUrl: string, params: URLSearchParams) {
    const url = new URL(baseUrl);
    params.forEach((value, key) => url.searchParams.append(key, value));

    const res = await fetch(url.toString(), {
        method: 'GET',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
        }
    });

    if (!res.ok) {
        throw new Error(`Error ${res.status}: ${res.statusText}`);
    }

    const contentType = res.headers.get('content-type') || '';
    const data = contentType.includes('application/json') ? await res.json() : await res.text();
    return typeof data === 'string' ? { raw: data } : data;
}

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const token = await getToken();

        // Default params logic
        const baseParams = new URLSearchParams();
        if (!searchParams.has('sucursal')) baseParams.append('sucursal', 'cuc');
        if (!searchParams.has('bodega')) baseParams.append('bodega', '080');
        if (!searchParams.has('empresa')) baseParams.append('empresa', 'cbb sas');

        // Merge user params (override defaults if present)
        searchParams.forEach((value, key) => {
            baseParams.set(key, value);
        });

        // If 'page' is explicitly requested, we just return that page
        if (searchParams.has('page')) {
            const data = await fetchPage(token, PRODUCTS_URL, baseParams);
            return NextResponse.json(data, { status: 200 });
        }

        let allItems: ProductItem[] = [];
        let firstResponseData: ProductApiResponse | null = null;
        let page = 1;
        let totalPages = 1;

        do {
            baseParams.set('page', String(page));
            const data = await fetchPage(token, PRODUCTS_URL, baseParams);

            if (page === 1) firstResponseData = data;

            let pageItems: ProductItem[] = [];
            if (data && typeof data === 'object') {
                if (Array.isArray(data.data)) pageItems = data.data;
                else if (Array.isArray(data)) pageItems = data;
                else if (data.productos && Array.isArray(data.productos)) pageItems = data.productos;

                if (data.total_pages && typeof data.total_pages === 'number') {
                    totalPages = data.total_pages;
                }
            }

            allItems = allItems.concat(pageItems);
            page++;
        } while (page <= totalPages);

        // Return combined result, preserving metadata structure of the first response if possible
        const result = {
            ...firstResponseData,
            data: allItems,
            page: 1,
            total_pages: 1,
            rows: allItems.length,
            total_rows: allItems.length
        };

        return NextResponse.json(result, { status: 200 });

    } catch (err) {
        const message = err instanceof Error ? err.message : 'Error desconocido';
        return NextResponse.json({ success: false, error: message }, { status: 500 });
    }
}
