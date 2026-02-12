import { NextResponse } from 'next/server';
import { getNovasoftToken } from '@/lib/novasoft-auth';

const PRICES_URL = process.env.NS_PRICES_URL || 'http://192.168.1.32:8082/api/consultas/listas';

interface PricesApiResponse {
  data?: unknown[];
  total_pages?: number;
}

interface PriceItem {
  cod_item: string;
  precioiva?: number;
  cod_lis?: string;
  pre_vta?: number;
}

export async function GET() {
  try {
    const token = await getNovasoftToken();
    
    // Construir URL
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
    
    console.log(`[API Precios] Total precios descargados: ${allPrices.length}`);

    // Agrupar precios por código de ítem
    const groupedPrices = new Map<string, { 
      codigo: string; 
      precioActual: number; 
      precioAnterior: number; 
      existencia: number;
    }>();

    allPrices.forEach((item) => {
      const p = item as PriceItem;
      const code = p.cod_item?.trim();
      
      if (!code) return;

      if (!groupedPrices.has(code)) {
        groupedPrices.set(code, { 
          codigo: code, 
          precioActual: 0, 
          precioAnterior: 0,
          existencia: 0 
        });
      }
      
      const entry = groupedPrices.get(code)!;
      const codLis = String(p.cod_lis || '');

      // Precio Actual: cod_lis "05"
      if (codLis === "05" && p.precioiva !== undefined) {
        entry.precioActual = p.precioiva;
      } 
      // Precio Anterior: cod_lis "22"
      else if (codLis === "22" && p.precioiva !== undefined) {
        entry.precioAnterior = p.precioiva;
      }
    });

    const prices = Array.from(groupedPrices.values()).map(p => ({
      ...p,
      descripcion: ''
    }));

    return NextResponse.json({ success: true, data: prices });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Error desconocido';
    
    console.error('[API Precios] Error:', message);

    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
