import { NextResponse } from 'next/server';

const AUTH_URL = process.env.NS_AUTH_URL || 'http://192.168.1.32:8082/api/Authenticate';
const USER = process.env.NOVASOFT_USER || '';
const PASS = process.env.NOVASOFT_PASS || '';

interface TokenInfo {
  token: string;
  expiresAt: number; // Timestamp in ms
}

let cachedTokenInfo: TokenInfo | null = null;

export async function getNovasoftToken(): Promise<string> {
  const now = Date.now();
  
  // If we have a valid token with at least 5 minutes remaining
  if (cachedTokenInfo && cachedTokenInfo.expiresAt > now + 5 * 60 * 1000) {
    return cachedTokenInfo.token;
  }

  // If token is expired or about to expire, try to refresh if we have one
  if (cachedTokenInfo) {
    try {
      console.log('[Novasoft Auth] Token expiring or expired, attempting refresh...');
      return await refreshToken(cachedTokenInfo.token);
    } catch (error) {
      console.warn('[Novasoft Auth] Refresh failed, falling back to full login:', error);
    }
  }

  // Default: Login
  return await login();
}

async function login(): Promise<string> {
  console.log(`[Novasoft Auth] Logging in to ${AUTH_URL}/login with user ${USER}`);
  
  const res = await fetch(`${AUTH_URL}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: USER, password: PASS })
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Login failed: ${res.status} ${text}`);
  }

  const data = await res.json();
  return parseAndCacheToken(data);
}

async function refreshToken(oldToken: string): Promise<string> {
  console.log(`[Novasoft Auth] Refreshing token at ${AUTH_URL}/refresh`);
  
  const res = await fetch(`${AUTH_URL}/refresh`, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${oldToken}`
    }
  });

  if (!res.ok) {
     const text = await res.text();
     throw new Error(`Refresh failed: ${res.status} ${text}`);
  }

  const data = await res.json();
  return parseAndCacheToken(data);
}

function parseAndCacheToken(data: any): string {
  let token = null;
  if (typeof data === 'string') token = data;
  else if (data.token) token = data.token;
  else if (data.accessToken) token = data.accessToken;
  else if (data.access_token) token = data.access_token;
  
  if (!token) {
    throw new Error('No access token found in response');
  }

  let expiresAt = Date.now() + 3600 * 1000; // Default 1 hour
  
  if (data.expires_at) {
    // Parse ISO string: "2026-02-13T13:23:03.149550"
    const parsed = Date.parse(data.expires_at);
    if (!isNaN(parsed)) {
      expiresAt = parsed;
    }
  } else if (typeof data.expiresIn === 'number') {
    expiresAt = Date.now() + data.expiresIn * 1000;
  }

  cachedTokenInfo = { token, expiresAt };
  console.log(`[Novasoft Auth] Token cached. Expires at: ${new Date(expiresAt).toISOString()}`);
  
  return token;
}
