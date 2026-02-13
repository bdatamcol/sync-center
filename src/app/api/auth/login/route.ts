import { NextResponse } from 'next/server';

const AUTH_URL = process.env.NS_AUTH_URL || 'http://192.168.1.32:8082/api/Authenticate';
const USER = process.env.NOVASOFT_USER || '';
const PASS = process.env.NOVASOFT_PASS || '';

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const username = body.username || USER;
    const password = body.password || PASS;

    if (!username || !password) {
      return NextResponse.json({ success: false, error: 'Credenciales no configuradas' }, { status: 400 });
    }

    const res = await fetch(`${AUTH_URL}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    const contentType = res.headers.get('content-type') || '';
    if (!res.ok) {
      const text = contentType.includes('application/json') ? await res.json() : await res.text();
      return NextResponse.json({ success: false, error: 'Error de autenticación', details: text }, { status: res.status });
    }

    const data = await res.json();
    return NextResponse.json({ success: true, ...data }, { status: 200 });
  } catch (err) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : 'Error desconocido' }, { status: 500 });
  }
}