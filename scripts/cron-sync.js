const cron = require('node-cron');
const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');

// Cargar variables desde .env si existe
function loadDotEnv() {
  try {
    const envPath = path.resolve(process.cwd(), '.env');
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf8');
      content.split(/\r?\n/).forEach((line) => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) return;
        const eqIndex = trimmed.indexOf('=');
        if (eqIndex === -1) return;
        const key = trimmed.slice(0, eqIndex).trim();
        let value = trimmed.slice(eqIndex + 1).trim();
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith('\'') && value.endsWith('\''))) {
          value = value.slice(1, -1);
        }
        if (!process.env[key]) process.env[key] = value;
      });
      console.log(`Variables de entorno cargadas desde .env (${envPath}).`);
    }
  } catch (err) {
    console.warn('No se pudo cargar .env:', err?.message || err);
  }
}

loadDotEnv();

// Constantes de configuración
const STOCK_THRESHOLD = 3; // Umbral de stock para cambio de estado
const PRODUCT_STATUS = {
  DRAFT: 'draft',
  PUBLISH: 'publish'
};

// WooCommerce API configuration (can be overridden via environment variables)
const WOOCOMMERCE_CONFIG = {
  url: process.env.WC_URL || process.env.NEXT_PUBLIC_WC_URL || 'https://towncenter.co/',
  key: process.env.WC_KEY || process.env.WC_CONSUMER_KEY || process.env.NEXT_PUBLIC_WC_CONSUMER_KEY,
  secret: process.env.WC_SECRET || process.env.WC_CONSUMER_SECRET || process.env.NEXT_PUBLIC_WC_CONSUMER_SECRET,
  version: process.env.WC_VERSION || process.env.NEXT_PUBLIC_WC_VERSION || 'wc/v3'
};

// Novasoft API endpoints (can be overridden via environment variables)
const NS_AUTH_URL = process.env.NS_AUTH_URL || process.env.NEXT_PUBLIC_API_BASE_URL || 'http://190.85.4.139:3000/api/auth';
const NS_PRODUCTS_URL = process.env.NS_PRODUCTS_URL || process.env.NEXT_PUBLIC_NS_PRODUCTS_URL || 'http://190.85.4.139:3000/api/productos/novasoft';
const NS_PRICES_URL = process.env.NS_PRICES_URL || process.env.NEXT_PUBLIC_NS_PRICES_URL || 'http://190.85.4.139:3000/api/con-precios';

function base64Auth(key, secret) {
  return Buffer.from(`${key}:${secret}`).toString('base64');
}

async function makeWooRequest(endpoint, method = 'GET', data, opts = {}) {
  const url = `${WOOCOMMERCE_CONFIG.url}wp-json/${WOOCOMMERCE_CONFIG.version}/${endpoint}`;
  const auth = base64Auth(WOOCOMMERCE_CONFIG.key, WOOCOMMERCE_CONFIG.secret);
  const { retries = 3, retryDelayMs = 500 } = opts;

  let attempt = 0;
  while (true) {
    const options = {
      method,
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json',
      },
    };

    if (data && (method === 'POST' || method === 'PUT')) {
      options.body = JSON.stringify(data);
    }

    let res;
    try {
      res = await fetch(url, options);
    } catch (networkErr) {
      if (attempt < retries) {
        const delay = retryDelayMs * Math.pow(2, attempt) + Math.floor(Math.random() * 100);
        await new Promise((r) => setTimeout(r, delay));
        attempt++;
        continue;
      }
      throw networkErr;
    }

    if (res.ok) {
      try {
        return await res.json();
      } catch {
        return undefined;
      }
    }

    const status = res.status;
    const retriable = status === 429 || status === 502 || status === 503 || status === 504;
    if (!retriable || attempt >= retries) {
      let detail;
      try {
        const j = await res.json();
        detail = j?.message || JSON.stringify(j);
      } catch {
        detail = await res.text();
      }
      throw new Error(`WooCommerce API Error: ${res.status} ${res.statusText} - ${detail}`);
    }

    const retryAfter = Number(res.headers.get('Retry-After') || 0);
    const baseDelay = retryAfter ? retryAfter * 1000 : retryDelayMs * Math.pow(2, attempt);
    const jitter = Math.floor(Math.random() * 250);
    await new Promise((r) => setTimeout(r, baseDelay + jitter));
    attempt++;
  }
}

async function getAllWooProducts() {
  const perPage = 100;
  let page = 1;
  const all = [];
  try {
    while (true) {
      const products = await makeWooRequest(`products?per_page=${perPage}&page=${page}&status=any&_fields=id,sku,regular_price,sale_price,stock_quantity,manage_stock,in_stock,status`);
      if (Array.isArray(products)) {
        all.push(...products);
        if (products.length < perPage) break;
        page += 1;
        await new Promise((r) => setTimeout(r, 50));
      } else {
        break;
      }
    }
  } catch (err) {
    console.error('Error obteniendo todos los productos de WooCommerce:', err.message || err);
  }
  return all;
}

async function loginNovasoft() {
  const username = process.env.NOVASOFT_USER;
  const password = process.env.NOVASOFT_PASS;
  if (!username || !password) {
    throw new Error('Credenciales NOVASOFT no configuradas (NOVASOFT_USER, NOVASOFT_PASS)');
  }
  const res = await fetch(`${NS_AUTH_URL}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Login NOVASOFT falló: ${res.status} ${res.statusText} - ${text}`);
  }
  const data = await res.json();
  if (!data.token) throw new Error(data.message || data.error || 'No se recibió token de autenticación');
  return data.token;
}

async function getProducts(token) {
  const res = await fetch(NS_PRODUCTS_URL, {
    method: 'GET',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Error obteniendo productos: ${res.status} ${res.statusText} - ${text}`);
  }
  const data = await res.json();
  let products = [];
  if (Array.isArray(data)) products = data;
  else if (Array.isArray(data?.data)) products = data.data;
  else if (Array.isArray(data?.productos)) products = data.productos;
  else throw new Error('Estructura de respuesta inesperada de la API de productos');
  return products;
}

async function getPrices(token) {
  const res = await fetch(NS_PRICES_URL, {
    method: 'GET',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Error obteniendo precios: ${res.status} ${res.statusText} - ${text}`);
  }
  const data = await res.json();
  let prices = [];
  if (data?.success && Array.isArray(data?.data)) prices = data.data;
  else if (Array.isArray(data)) prices = data;
  else if (Array.isArray(data?.data)) prices = data.data;
  else throw new Error('Estructura de respuesta inesperada del endpoint de precios');
  return prices;
}

function mergeProductsWithPrices(products, prices) {
  const pricesMap = new Map();
  for (const price of prices) {
    if (price && price.codigo != null) {
      pricesMap.set(String(price.codigo).trim(), price);
    }
  }
  return products.map((product) => {
    const code = product.cod_item?.trim();
    const priceData = code ? pricesMap.get(code) : null;
    if (priceData) {
      return {
        ...product,
        precioAnterior: priceData.precioAnterior,
        precioActual: priceData.precioActual,
        existencia: priceData.existencia ?? product.existencia,
      };
    }
    return product;
  });
}

// Función auxiliar para normalizar stock
function normalizeStock(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || Number.isNaN(n)) return 0;
  return n < 0 ? 0 : Math.floor(n);
}

// Determina el estado correcto del producto según las reglas
function determineProductStatus(stockQuantity) {
  const normalizedStock = normalizeStock(stockQuantity);
  return normalizedStock > STOCK_THRESHOLD ? PRODUCT_STATUS.PUBLISH : PRODUCT_STATUS.DRAFT;
}

// Función principal de sincronización optimizada
async function syncAllProductsOptimized(products) {
  const validProducts = products.filter((p) => p.cod_item && String(p.cod_item).trim());
  const results = [];
  
  if (validProducts.length === 0) {
    return {
      success: true,
      results: [],
      summary: { 
        total: 0, 
        successful: 0, 
        failed: 0, 
        skipped: 0,
        existingInWoo: 0,
        totalNovasoft: products.length,
        statusChanges: { toDraft: 0, toPublish: 0 }
      }
    };
  }

  // Fase 1: Obtener todos los productos de WooCommerce
  console.log('Obteniendo lista de productos existentes en WooCommerce...');
  const wooProducts = await getAllWooProducts();
  const wooSkuMap = new Map();
  
  // Crear mapa de SKUs existentes en WooCommerce
  wooProducts.forEach(wooProduct => {
    if (wooProduct.sku && wooProduct.sku.trim()) {
      wooSkuMap.set(wooProduct.sku.trim().toLowerCase(), wooProduct);
    }
  });

  // Fase 2: Procesar productos
  console.log(`Procesando ${validProducts.length} productos de Novasoft...`);
  const updates = [];
  const nsSkuSet = new Set(validProducts.map(p => String(p.cod_item).trim().toLowerCase()));

  // Procesar productos existentes en Novasoft
  for (const product of validProducts) {
    const sku = String(product.cod_item).trim().toLowerCase();
    const wooProduct = wooSkuMap.get(sku);
    
    if (wooProduct) {
      const nsStock = normalizeStock(product.existencia);
      const currentStatus = wooProduct.status || PRODUCT_STATUS.DRAFT;
      const newStatus = determineProductStatus(nsStock);
      
      const update = {
        id: wooProduct.id,
        manage_stock: true,
        stock_quantity: nsStock,
        in_stock: nsStock > 0
      };

      // Actualizar precios si están disponibles
      if (product.precioAnterior && product.precioAnterior > 0) {
        update.regular_price = String(product.precioAnterior);
      }
      if (product.precioActual && product.precioActual > 0) {
        update.sale_price = String(product.precioActual);
      }

      // Actualizar estado según las reglas
      if (currentStatus !== newStatus) {
        update.status = newStatus;
      }

      updates.push(update);
    }
  }

  // Procesar productos en WooCommerce que no están en Novasoft
  const missingInNovasoft = wooProducts.filter(wp => 
    wp.sku && !nsSkuSet.has(wp.sku.trim().toLowerCase())
  );

  for (const wooProduct of missingInNovasoft) {
    if (wooProduct.status !== PRODUCT_STATUS.DRAFT) {
      updates.push({
        id: wooProduct.id,
        status: PRODUCT_STATUS.DRAFT,
        manage_stock: true,
        stock_quantity: 0,
        in_stock: false
      });
    }
  }

  // Fase 3: Aplicar actualizaciones por lotes
  console.log(`Aplicando ${updates.length} actualizaciones...`);
  let successful = 0;
  let failed = 0;
  let statusChanges = { toDraft: 0, toPublish: 0 };

  const BATCH_SIZE = 100;
  for (let i = 0; i < updates.length; i += BATCH_SIZE) {
    const chunk = updates.slice(i, i + BATCH_SIZE);
    try {
      await makeWooRequest('products/batch', 'POST', { update: chunk }, { retries: 3, retryDelayMs: 600 });
      
      // Contabilizar cambios de estado
      chunk.forEach(update => {
        if (update.status === PRODUCT_STATUS.DRAFT) {
          statusChanges.toDraft++;
        } else if (update.status === PRODUCT_STATUS.PUBLISH) {
          statusChanges.toPublish++;
        }
      });

      successful += chunk.length;
    } catch (error) {
      console.warn('Error en actualización por lotes:', error?.message || error);
      failed += chunk.length;
    }

    if (i + BATCH_SIZE < updates.length) {
      await new Promise(resolve => setTimeout(resolve, 120));
    }
  }

  return {
    success: failed === 0,
    results,
    summary: {
      total: updates.length,
      successful,
      failed,
      skipped: 0,
      existingInWoo: wooProducts.length,
      totalNovasoft: products.length,
      statusChanges
    }
  };
}

// El resto del código permanece igual, solo actualizamos la función principal
async function runSync() {
  const startTime = Date.now();
  const startedAt = new Date(startTime).toISOString();
  console.log(`[${startedAt}] Iniciando sincronización automática de productos...`);

  let db;
  try {
    // Configuración de la base de datos SQLite
    const HISTORY_DB_PATH = path.resolve(process.cwd(), 'cron_history.db');
    db = await open({ filename: HISTORY_DB_PATH, driver: sqlite3.Database });
    await db.exec(`CREATE TABLE IF NOT EXISTS cron_executions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      start_time TEXT NOT NULL,
      end_time TEXT,
      status TEXT NOT NULL CHECK (status IN ('running', 'completed', 'failed')),
      total_products INTEGER NOT NULL DEFAULT 0,
      successful_products INTEGER NOT NULL DEFAULT 0,
      failed_products INTEGER NOT NULL DEFAULT 0,
      status_changes TEXT,
      duration INTEGER,
      error_message TEXT,
      details TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
  } catch (e) {
    console.warn('No se pudo abrir/crear la base de datos de historial:', e?.message || e);
  }

  let executionId = null;
  try {
    if (db) {
      const r = await db.run(
        `INSERT INTO cron_executions (start_time, status) VALUES (?, 'running')`,
        startedAt
      );
      executionId = r?.lastID || null;
    }

    // Proceso de sincronización
    const token = await loginNovasoft();
    const [products, prices] = await Promise.all([getProducts(token), getPrices(token)]);
    const merged = mergeProductsWithPrices(products, prices);
    
    console.log(`Iniciando sincronización de ${merged.length} productos...`);
    const syncResult = await syncAllProductsOptimized(merged);

    // Registro de resultados
    const finishTime = Date.now();
    const finishedAt = new Date(finishTime).toISOString();
    const durationMs = finishTime - startTime;

    if (db && executionId != null) {
      await db.run(
        `UPDATE cron_executions SET 
         end_time = ?, 
         status = 'completed', 
         total_products = ?, 
         successful_products = ?, 
         failed_products = ?, 
         status_changes = ?,
         duration = ?, 
         error_message = NULL 
         WHERE id = ?`,
        finishedAt,
        syncResult.summary.total,
        syncResult.summary.successful,
        syncResult.summary.failed,
        JSON.stringify(syncResult.summary.statusChanges),
        durationMs,
        executionId
      );
    }

    console.log(`Sincronización completada en ${Math.round(durationMs / 1000)}s`);
    console.log(`Resumen: ${syncResult.summary.successful} éxitos, ${syncResult.summary.failed} fallos`);
    console.log(`Cambios de estado: ${syncResult.summary.statusChanges.toDraft} a borrador, ${syncResult.summary.statusChanges.toPublish} a público`);

  } catch (err) {
    console.error('Error en sincronización:', err);
    if (db && executionId != null) {
      await db.run(
        `UPDATE cron_executions SET 
         status = 'failed', 
         error_message = ? 
         WHERE id = ?`,
        err?.message || String(err),
        executionId
      );
    }
  }
}

// Configuración del CRON
const schedule = process.env.CRON_SCHEDULE || '*/2 * * * *';
console.log(`Programador de cron iniciado. Frecuencia: '${schedule}'`);
cron.schedule(schedule, () => {
  runSync();
});

// Ejecución inicial si está configurado (soporta RUN_AT_START o CRON_RUN_ON_START en .env)
const runAtStartFlag = (v) => v === 'true' || v === '1' || v === true;
if (runAtStartFlag(process.env.RUN_AT_START) || runAtStartFlag(process.env.CRON_RUN_ON_START)) {
  runSync();
}

// Manejadores de errores no capturados
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection en cron:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception en cron:', err);
});