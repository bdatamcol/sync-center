import { NextResponse } from 'next/server';

const AUTH_URL = process.env.NS_AUTH_URL || 'http://192.168.1.32:8082/api/Authenticate';
const PRICES_URL = process.env.NS_PRICES_URL || 'http://192.168.1.32:8082/api/consultas/listas';
const USER = process.env.NOVASOFT_USER || '';
const PASS = process.env.NOVASOFT_PASS || '';

interface AuthResponse {
    token?: string;
    accessToken?: string;
    access_token?: string;
    expiresIn?: number;
    expires_at?: string;
}

interface PriceItem {
    cod_item: string;
    des_item?: string;
    precioiva?: number;
    cod_lis?: string;
}

interface PriceApiResponse {
    data?: PriceItem[];
    total_pages?: number;
}

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
        throw new Error(`Login Novasoft falló (${res.status}): ${await res.text()}`);
    }

    const data: AuthResponse = await res.json();
    const token = data.token || data.accessToken || data.access_token;

    if (!token) throw new Error('No se recibió token en la respuesta de login');

    cachedToken = token;

    let ttlMs = 60 * 60 * 1000;
    if (typeof data.expiresIn === 'number') {
        ttlMs = data.expiresIn * 1000;
    } else if (typeof data.expires_at === 'string') {
        const parsed = Date.parse(data.expires_at);
        if (!isNaN(parsed)) ttlMs = parsed - Date.now();
    }

    tokenExpiresAt = Date.now() + ttlMs;
    return cachedToken;
}

async function fetchPage(
    token: string,
    baseUrl: string,
    params: URLSearchParams
): Promise<PriceApiResponse> {
    const url = new URL(baseUrl);
    params.forEach((value, key) => url.searchParams.append(key, value));

    const res = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${token}` }
    });

    if (!res.ok) {
        throw new Error(`Error obteniendo precios (${res.status})`);
    }

    return res.json() as Promise<PriceApiResponse>;
}

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const token = await getToken();

        const baseParams = new URLSearchParams();
        if (!searchParams.has('sucursal')) baseParams.append('sucursal', 'cuc');
        if (!searchParams.has('bodega')) baseParams.append('bodega', '080');
        searchParams.forEach((value, key) => baseParams.set(key, value));

        let allRawItems: PriceItem[] = [];
        let page = 1;
        let totalPages = 1;

        do {
            baseParams.set('page', String(page));
            const data = await fetchPage(token, PRICES_URL, baseParams);

            if (Array.isArray(data.data)) {
                allRawItems = allRawItems.concat(data.data);
            }

            if (typeof data.total_pages === 'number') {
                totalPages = data.total_pages;
            }

            page++;
        } while (page <= totalPages);

        const pricesMap = new Map<string, {
            codigo: string;
            descripcion: string;
            precioAnterior: number;
            precioActual: number;
            existencia: number;
        }>();

        allRawItems.forEach((item) => {
            const code = item.cod_item?.trim();
            if (!code) return;

            if (!pricesMap.has(code)) {
                pricesMap.set(code, {
                    codigo: code,
                    descripcion: item.des_item ?? '',
                    precioAnterior: 0,
                    precioActual: 0,
                    existencia: 0
                });
            }

            const entry = pricesMap.get(code)!;
            const precio = Number(item.precioiva ?? 0);
            const codLis = item.cod_lis?.trim();

            if (codLis === '05' || codLis === '5') {
                entry.precioActual = precio;
            } else if (codLis === '22') {
                entry.precioAnterior = precio;
            }
        });

        return NextResponse.json({
            success: true,
            data: Array.from(pricesMap.values()),
            page: 1,
            total_pages: 1,
            total_rows: pricesMap.size
        });

    } catch (err) {
        const message = err instanceof Error ? err.message : 'Error desconocido';
        return NextResponse.json({ success: false, error: message }, { status: 500 });
    }
}