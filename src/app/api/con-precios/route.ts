import { NextResponse } from 'next/server';
import { getNovasoftToken } from '@/lib/novasoft-auth';

const PRICES_URL = process.env.NS_PRICES_URL || 'http://192.168.1.32:8082/api/consultas/listas';

export async function GET() {
  console.log("[API Precios] Iniciando petición GET /api/con-precios");
  
  try {
    const token = await getNovasoftToken();
    
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

    // Agrupar precios por SKU
    const pricesMap = new Map<string, { precioActual: number, precioAnterior: number }>();

    allPrices.forEach((item: any) => {
      const sku = item.cod_item?.trim();
      if (!sku) return;

      if (!pricesMap.has(sku)) {
        pricesMap.set(sku, { precioActual: 0, precioAnterior: 0 });
      }

      const priceData = pricesMap.get(sku)!;

      // Lógica de asignación de precios basada en cod_lis
      if (item.cod_lis === '05') {
        priceData.precioActual = item.precioiva;
      } else if (item.cod_lis === '22') {
        priceData.precioAnterior = item.precioiva;
      }
    });

    const prices = Array.from(pricesMap.entries()).map(([sku, data]) => ({
      codigo: sku,
      descripcion: '',
      precioActual: data.precioActual,
      precioAnterior: data.precioAnterior,
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
