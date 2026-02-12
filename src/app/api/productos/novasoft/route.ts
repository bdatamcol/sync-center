import { NextResponse } from 'next/server';
import { getNovasoftToken } from '@/lib/novasoft-auth';

const PRODUCTS_URL = process.env.NS_PRODUCTS_URL || 'http://192.168.1.32:8082/api/consultas/bodega-existencia';

interface ProductsApiResponse {
  data?: unknown[];
  total_pages?: number;
}

export async function GET() {
  try {
    const token = await getNovasoftToken();

    const url = new URL(PRODUCTS_URL);
    url.searchParams.append('sucursal', 'cuc');
    url.searchParams.append('bodega', '080');
    url.searchParams.append('empresa', 'cbb sas');

    const allProducts: unknown[] = [];
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
        const data = raw as ProductsApiResponse;

        if (Array.isArray(data.data)) {
          pageData = data.data;
        } else if (Array.isArray(raw)) {
          pageData = raw;
        }

        if (typeof data.total_pages === 'number') {
          totalPages = data.total_pages;
        }
      }

      allProducts.push(...pageData);
      page++;
    } while (page <= totalPages);

    return NextResponse.json(allProducts);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Error desconocido';

    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
