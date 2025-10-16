import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  // Verificar si la ruta es del admin
  if (request.nextUrl.pathname.startsWith('/admin')) {
    // En el lado del servidor no podemos acceder a localStorage
    // Por lo que redirigimos al login y manejamos la autenticación en el cliente
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*']
};