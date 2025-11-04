import { NextResponse } from 'next/server'

type CheckResult = {
  name: string
  ok: boolean
  status?: number
  message?: string
}

const NS_AUTH_URL = process.env.NS_AUTH_URL || 'http://190.85.4.139:3000/api/auth'
const NS_PRODUCTS_URL = process.env.NS_PRODUCTS_URL || 'http://190.85.4.139:3000/api/productos/novasoft'
const NS_PRICES_URL = process.env.NS_PRICES_URL || 'http://190.85.4.139:3000/api/con-precios'
const NOVASOFT_USER = process.env.NOVASOFT_USER
const NOVASOFT_PASS = process.env.NOVASOFT_PASS

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit & { timeoutMs?: number } = {}) {
  const { timeoutMs = 10000, ...opts } = init
  const controller = new AbortController()
  const id = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(input, { ...opts, signal: controller.signal })
  } finally {
    clearTimeout(id)
  }
}

export async function GET() {
  const results: CheckResult[] = []

  // 1) Validación de variables de entorno
  const hasCreds = !!(NOVASOFT_USER && NOVASOFT_PASS)
  results.push({ name: 'env.credentials', ok: hasCreds, message: hasCreds ? 'Credenciales presentes' : 'Faltan NOVASOFT_USER/NOVASOFT_PASS' })
  results.push({ name: 'env.urls', ok: !!(NS_AUTH_URL && NS_PRODUCTS_URL && NS_PRICES_URL) })

  // 2) Login directo a Novasoft
  let token: string | undefined
  try {
    const res = await fetchWithTimeout(`${NS_AUTH_URL}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: NOVASOFT_USER, password: NOVASOFT_PASS }),
    })
    const ok = res.ok
    const status = res.status
    let message: string | undefined
    if (!ok) {
      message = `Login fallo: ${status}`
    } else {
      const ct = res.headers.get('content-type') || ''
      if (ct.includes('application/json')) {
        const data = await res.json()
        token = data?.token || data?.accessToken || data?.data?.token
        message = token ? 'Login exitoso' : 'Login sin token'
      } else {
        message = 'Login devolvió contenido no JSON'
      }
    }
    results.push({ name: 'novasoft.login', ok, status, message })
  } catch (e: any) {
    results.push({ name: 'novasoft.login', ok: false, message: `Error: ${e?.message || e}` })
  }

  // 3) Consultar productos vía proxy local
  try {
    const res = await fetchWithTimeout(`${process.env.NEXT_PUBLIC_NS_PRODUCTS_URL || '/api/productos/novasoft'}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    })
    const ok = res.ok
    const status = res.status
    let message: string | undefined
    if (!ok) {
      const txt = await res.text()
      message = `Productos fallo: ${status} ${txt?.slice(0, 120)}`
    } else {
      const ct = res.headers.get('content-type') || ''
      message = ct.includes('application/json') ? 'Productos OK' : 'Productos no JSON'
    }
    results.push({ name: 'proxy.products', ok, status, message })
  } catch (e: any) {
    results.push({ name: 'proxy.products', ok: false, message: `Error: ${e?.message || e}` })
  }

  // 4) Consultar precios vía proxy local
  try {
    const res = await fetchWithTimeout(`${process.env.NEXT_PUBLIC_NS_PRICES_URL || '/api/con-precios'}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    })
    const ok = res.ok
    const status = res.status
    let message: string | undefined
    if (!ok) {
      const txt = await res.text()
      message = `Precios fallo: ${status} ${txt?.slice(0, 120)}`
    } else {
      const ct = res.headers.get('content-type') || ''
      message = ct.includes('application/json') ? 'Precios OK' : 'Precios no JSON'
    }
    results.push({ name: 'proxy.prices', ok, status, message })
  } catch (e: any) {
    results.push({ name: 'proxy.prices', ok: false, message: `Error: ${e?.message || e}` })
  }

  const overallOk = results.every(r => r.ok)
  return NextResponse.json({ ok: overallOk, results, tokenPresent: !!token }, { status: overallOk ? 200 : 500 })
}