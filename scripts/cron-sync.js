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

// Node 18+ has global fetch; if not, uncomment the next line to use node-fetch
// const fetch = global.fetch || require('node-fetch');

// WooCommerce API configuration (can be overridden via environment variables)
const WOOCOMMERCE_CONFIG = {
  url: process.env.WC_URL || 'https://towncenter.co/',
  key: process.env.WC_KEY || 'ck_b11fce7a670af01eb9af281e07f1721dd263c0c8',
  secret: process.env.WC_SECRET || 'cs_3149467594c309d9bd48b8536c951bb58973fd6d',
  version: process.env.WC_VERSION || 'wc/v3'
};

// Novasoft API endpoints (can be overridden via environment variables)
const NS_AUTH_URL = process.env.NS_AUTH_URL || 'http://190.85.4.139:3000/api/auth';
const NS_PRODUCTS_URL = process.env.NS_PRODUCTS_URL || 'http://190.85.4.139:3000/api/productos/novasoft';
const NS_PRICES_URL = process.env.NS_PRICES_URL || 'http://190.85.4.139:3000/api/con-precios';

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

async function searchProductBySku(sku) {
  try {
    const products = await makeWooRequest(`products?sku=${encodeURIComponent(sku)}`);
    if (Array.isArray(products) && products.length > 0) return products[0];
    return null;
  } catch (err) {
    console.error('Error buscando producto:', err.message || err);
    throw err;
  }
}

async function updateWooProduct(productId, updateData) {
  try {
    return await makeWooRequest(`products/${productId}`, 'PUT', updateData);
  } catch (err) {
    console.error('Error actualizando producto:', err.message || err);
    throw err;
  }
}

async function batchUpdateWooProducts(updates, opts = {}) {
  if (!Array.isArray(updates) || updates.length === 0) return { updated: 0, failed: 0 };
  const chunkSize = 100;
  let updated = 0, failed = 0;
  for (let i = 0; i < updates.length; i += chunkSize) {
    const chunk = updates.slice(i, i + chunkSize);
    try {
      await makeWooRequest('products/batch', 'POST', { update: chunk }, { retries: 3, retryDelayMs: 600, ...opts });
      updated += chunk.length;
    } catch (err) {
      failed += chunk.length;
      console.warn('Batch update failed:', err?.message || err);
    }
    await new Promise(r => setTimeout(r, 120));
  }
  return { updated, failed };
}

// Obtener todos los productos de WooCommerce con paginación
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

// Verificación segura de stock: convierte a número, evita NaN/inf, limita a enteros >= 0
function normalizeStock(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || Number.isNaN(n)) return 0;
  return n < 0 ? 0 : Math.floor(n);
}

async function syncProduct(product) {
  try {
    const sku = product.cod_item;
    if (!sku) {
      return { success: false, message: 'El producto no tiene código SKU', error: 'SKU requerido para sincronización' };
    }

    const wooProduct = await searchProductBySku(sku);
    if (!wooProduct) {
      return { success: false, message: 'Producto no encontrado en WooCommerce', error: `No se encontró producto con SKU: ${sku}` };
    }

    const updateData = {
      manage_stock: true,
      stock_quantity: product.existencia || 0,
      in_stock: (product.existencia || 0) > 0,
    };

    if (product.precioAnterior && product.precioAnterior > 0) {
      updateData.regular_price = String(product.precioAnterior);
    }
    if (product.precioActual && product.precioActual > 0) {
      updateData.sale_price = String(product.precioActual);
    }

    const updated = await updateWooProduct(wooProduct.id, updateData);
    return { success: true, message: 'Producto sincronizado exitosamente', productData: updated };
  } catch (err) {
    console.error('Error en sincronización:', err.message || err);
    return { success: false, message: 'Error durante la sincronización', error: err.message || 'Error desconocido' };
  }
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
        totalNovasoft: products.length
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

  // Fase 2: Filtrar productos que existen en WooCommerce
  console.log(`Comparando ${validProducts.length} productos de Novasoft con ${wooProducts.length} productos de WooCommerce...`);
  const productsToSync = [];
  const skippedProducts = [];

  validProducts.forEach(product => {
    const sku = String(product.cod_item).trim().toLowerCase();
    if (wooSkuMap.has(sku)) {
      productsToSync.push(product);
    } else {
      skippedProducts.push(product);
      // Agregar resultado para productos no encontrados
      results.push({
        product,
        result: {
          success: false,
          message: 'Producto no encontrado en WooCommerce - omitido',
          error: `SKU ${product.cod_item} no existe en WooCommerce`
        }
      });
    }
  });

  console.log(`Sincronizando ${productsToSync.length} productos existentes (${skippedProducts.length} omitidos)...`);

  // Fase 3: Sincronizar solo los productos que existen en WooCommerce (batch + diff)
  let successful = 0;
  let failed = 0;
  let processedCount = 0;

  // Construir diffs mínimos por producto existente
  const diffs = [];
  const skuToId = new Map();
  for (const product of productsToSync) {
    const sku = String(product.cod_item).trim().toLowerCase();
    const wooProduct = wooSkuMap.get(sku);
    if (!wooProduct) continue;
    skuToId.set(sku, wooProduct.id);

    const nsStock = Number(product.existencia || 0);
    const nsInStock = nsStock > 0;

    const update = { id: wooProduct.id };
    let changed = false;

    // Asegurar manage_stock activado
    if (!wooProduct.manage_stock) {
      update.manage_stock = true;
      changed = true;
    }

    // stock_quantity e in_stock
    const wcStock = Number(wooProduct.stock_quantity ?? 0);
    if (wcStock !== nsStock) {
      update.stock_quantity = nsStock;
      changed = true;
    }
    const wcInStock = Boolean(wooProduct.in_stock);
    if (wcInStock !== nsInStock) {
      update.in_stock = nsInStock;
      changed = true;
    }

    // Precios: mantener misma semántica previa
    if (product.precioAnterior && product.precioAnterior > 0) {
      const wcRegular = Number(wooProduct.regular_price || 0);
      if (wcRegular !== Number(product.precioAnterior)) {
        update.regular_price = String(product.precioAnterior);
        changed = true;
      }
    }
    if (product.precioActual && product.precioActual > 0) {
      const wcSale = Number(wooProduct.sale_price || 0);
      if (wcSale !== Number(product.precioActual)) {
        update.sale_price = String(product.precioActual);
        changed = true;
      }
    }

    if (changed) diffs.push(update);
  }

  // Enviar diffs por lotes a products/batch
  const BATCH_SIZE = 100;
  for (let i = 0; i < diffs.length; i += BATCH_SIZE) {
    const chunk = diffs.slice(i, i + BATCH_SIZE);
    try {
      await makeWooRequest('products/batch', 'POST', { update: chunk }, { retries: 3, retryDelayMs: 600 });
      for (const u of chunk) {
        // Buscar el producto original para registrar resultado
        const prod = productsToSync.find(p => skuToId.get(String(p.cod_item).trim().toLowerCase()) === u.id);
        results.push({ product: prod, result: { success: true, message: 'Actualizado por lotes (diff)' } });
        successful++;
        processedCount++;
        if (processedCount % 50 === 0 || processedCount === productsToSync.length) {
          console.log(`Progreso sincronización: ${processedCount}/${productsToSync.length} (${Math.round((processedCount / productsToSync.length) * 100)}%)`);
        }
      }
    } catch (error) {
      console.warn('Error en actualización por lotes:', error?.message || error);
      for (const u of chunk) {
        const prod = productsToSync.find(p => skuToId.get(String(p.cod_item).trim().toLowerCase()) === u.id);
        results.push({ product: prod, result: { success: false, message: 'Error en actualización por lotes', error: error?.message || 'Error' } });
        failed++;
        processedCount++;
        if (processedCount % 50 === 0 || processedCount === productsToSync.length) {
          console.log(`Progreso sincronización: ${processedCount}/${productsToSync.length} (${Math.round((processedCount / productsToSync.length) * 100)}%)`);
        }
      }
    }
    if (i + BATCH_SIZE < diffs.length) {
      await new Promise(resolve => setTimeout(resolve, 120));
    }
  }

  // Marcar como "Sin cambios" los productos que no requirieron actualización
  const updatedIds = new Set(diffs.map(d => d.id));
  for (const product of productsToSync) {
    const id = skuToId.get(String(product.cod_item).trim().toLowerCase());
    if (id && !updatedIds.has(id)) {
      results.push({ product, result: { success: true, message: 'Sin cambios' } });
      successful++;
      processedCount++;
      if (processedCount % 50 === 0 || processedCount === productsToSync.length) {
        console.log(`Progreso sincronización: ${processedCount}/${productsToSync.length} (${Math.round((processedCount / productsToSync.length) * 100)}%)`);
      }
    }
  }

  const success = failed === 0;
  return {
    success,
    results,
    summary: {
      total: validProducts.length,
      successful,
      failed,
      skipped: skippedProducts.length,
      existingInWoo: productsToSync.length,
      totalNovasoft: products.length
    }
  };
}

async function runSync() {
  const startTime = Date.now();
  const startedAt = new Date(startTime).toISOString();
  console.log(`[${startedAt}] Iniciando sincronización automática de productos...`);

  // abrir/construir base de datos sqlite para historial
  const HISTORY_DB_PATH = path.resolve(process.cwd(), 'cron_history.db');
  let db;
  try {
    db = await open({ filename: HISTORY_DB_PATH, driver: sqlite3.Database });
    await db.exec(`CREATE TABLE IF NOT EXISTS cron_executions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      start_time TEXT NOT NULL,
      end_time TEXT,
      status TEXT NOT NULL CHECK (status IN ('running', 'completed', 'failed')),
      total_products INTEGER NOT NULL DEFAULT 0,
      successful_products INTEGER NOT NULL DEFAULT 0,
      failed_products INTEGER NOT NULL DEFAULT 0,
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
  } catch (e) {
    console.warn('No se pudo registrar inicio de ejecución:', e?.message || e);
  }

  try {
    const token = await loginNovasoft();
    const [products, prices] = await Promise.all([getProducts(token), getPrices(token)]);
    const merged = mergeProductsWithPrices(products, prices);
    console.log(`Productos listos para sincronizar: ${merged.filter((p) => p.cod_item).length}`);
    const syncResult = await syncAllProductsOptimized(merged);

    // Paso adicional: productos en WooCommerce que NO existen en Novasoft -> stock 0 y estado "draft"
    console.log('Ajustando productos de WooCommerce ausentes en Novasoft (stock 0 y draft)...');
    const nsSkuSet = new Set(merged.map(p => String(p.cod_item || '').trim()).filter(s => s));
    const wooAll = await getAllWooProducts();
    const candidates = wooAll.filter(p => (p?.sku || '').trim() && !nsSkuSet.has(String(p.sku).trim()));
    let adjusted = 0;
    let adjustErrors = 0;
    const updates = candidates.map(wc => ({ id: wc.id, manage_stock: true, stock_quantity: 0, in_stock: false, status: 'draft' }));
    const BATCH_SIZE_ADJ = 100;
    for (let i = 0; i < updates.length; i += BATCH_SIZE_ADJ) {
      const chunk = updates.slice(i, i + BATCH_SIZE_ADJ);
      try {
        await makeWooRequest('products/batch', 'POST', { update: chunk }, { retries: 3, retryDelayMs: 600 });
        adjusted += chunk.length;
        console.log(`Ajuste progreso: ${Math.min(i + BATCH_SIZE_ADJ, updates.length)}/${updates.length}`);
      } catch (err) {
        adjustErrors += chunk.length;
        console.warn('Error en ajuste por lotes:', err?.message || err);
      }
      await new Promise((r) => setTimeout(r, 120));
    }
    console.log(`Ajuste de ausentes completado: ${adjusted}/${updates.length} marcados como borrador con stock 0${adjustErrors ? `, ${adjustErrors} errores` : ''}.`);

    // Paso adicional: productos con stock <= 3 -> estado "draft" sin alterar stock/precios
    // console.log('Ajustando productos con stock bajo (<= 3) a estado "draft"...');
    // const LOW_STOCK_THRESHOLD = Number(process.env.LOW_STOCK_THRESHOLD || 3);
    // const lowStockCandidates = wooAll.filter(wc => {
    //   const sku = (wc?.sku || '').trim();
    //   if (!sku) return false;
    //   const qty = normalizeStock(wc?.stock_quantity);
    //   return qty <= LOW_STOCK_THRESHOLD && wc.status !== 'draft';
    // });
    // let lowAdjusted = 0;
    // let lowAdjustErrors = 0;
    // const lowUpdates = lowStockCandidates.map(wc => ({ id: wc.id, status: 'draft' }));
    // for (let i = 0; i < lowUpdates.length; i += BATCH_SIZE_ADJ) {
    //   const chunk = lowUpdates.slice(i, i + BATCH_SIZE_ADJ);
    //   try {
    //     await makeWooRequest('products/batch', 'POST', { update: chunk }, { retries: 3, retryDelayMs: 600 });
    //     lowAdjusted += chunk.length;
    //     console.log(`Bajo stock progreso: ${Math.min(i + BATCH_SIZE_ADJ, lowUpdates.length)}/${lowUpdates.length}`);
    //   } catch (err) {
    //     lowAdjustErrors += chunk.length;
    //     console.warn('Error en ajuste de bajo stock por lotes:', err?.message || err);
    //   }
    //   await new Promise((r) => setTimeout(r, 120));
    // }
    console.log(`Ajuste de bajo stock completado: ${lowAdjusted}/${lowUpdates.length} marcados como borrador${lowAdjustErrors ? `, ${lowAdjustErrors} errores` : ''}.`);

    const finishTime = Date.now();
    const finishedAt = new Date(finishTime).toISOString();
    const durationMs = finishTime - startTime;
    console.log(
      `Sincronización completada: ${syncResult.summary.successful}/${syncResult.summary.total} éxitos, ${syncResult.summary.failed} fallos, ${syncResult.summary.skipped} omitidos (${syncResult.summary.existingInWoo} existentes en WooCommerce de ${syncResult.summary.totalNovasoft} productos Novasoft). Tiempo: ${Math.round(durationMs / 1000)}s`
    );

    // Guardar en SQLite: resumen y detalles
    const detailsArray = syncResult.results.map(({ product, result }) => ({
      sku: product.cod_item,
      name: product.des_item,
      existencia: product.existencia,
      precioAnterior: product.precioAnterior,
      precioActual: product.precioActual,
      success: result.success,
      message: result.message,
      error: result.error || null,
    }));
    // Añadir resumen del ajuste de ausentes
    detailsArray.push({
      sku: 'AUSENTES',
      name: 'Productos WooCommerce ausentes en Novasoft',
      existencia: 0,
      precioAnterior: 0,
      precioActual: 0,
      success: adjustErrors === 0,
      message: `Ajuste: ${adjusted}/${candidates.length} marcados como borrador y stock 0`,
      error: adjustErrors ? `${adjustErrors} errores durante el ajuste` : null,
    });
    // Añadir resumen de bajo stock
    detailsArray.push({
      sku: 'BAJO_STOCK',
      name: 'Productos con stock <= umbral',
      existencia: LOW_STOCK_THRESHOLD,
      precioAnterior: 0,
      precioActual: 0,
      success: lowAdjustErrors === 0,
      message: `Ajuste: ${lowAdjusted}/${lowStockCandidates.length} marcados como borrador (umbral ${LOW_STOCK_THRESHOLD})`,
      error: lowAdjustErrors ? `${lowAdjustErrors} errores durante el ajuste de bajo stock` : null,
    });
    const detailsJson = JSON.stringify(detailsArray);
    try {
      if (db && executionId != null) {
        await db.run(
          `UPDATE cron_executions SET end_time = ?, status = 'completed', total_products = ?, successful_products = ?, failed_products = ?, duration = ?, error_message = NULL, details = ? WHERE id = ?`,
          finishedAt,
          syncResult.summary.total,
          syncResult.summary.successful,
          syncResult.summary.failed,
          durationMs,
          detailsJson,
          executionId
        );
      }
    } catch (e) {
      console.warn('No se pudo actualizar ejecución en historial:', e?.message || e);
    }
  } catch (err) {
    const finishTime = Date.now();
    const finishedAt = new Date(finishTime).toISOString();
    const durationMs = finishTime - startTime;
    console.error('Error en sincronización automática:', err.message || err);
    try {
      if (db && executionId != null) {
        await db.run(
          `UPDATE cron_executions SET end_time = ?, status = 'failed', total_products = 0, successful_products = 0, failed_products = 0, duration = ?, error_message = ? WHERE id = ?`,
          finishedAt,
          durationMs,
          err?.message || String(err),
          executionId
        );
      }
    } catch (e) {
      console.warn('No se pudo registrar error en historial (sqlite):', e?.message || e);
    }
  }
}

const schedule = process.env.CRON_SCHEDULE || '*/15 * * * *';
console.log(`Programador de cron iniciado. Frecuencia: '${schedule}'`);
cron.schedule(schedule, () => {
  runSync();
});

// Ejecutar una vez al inicio si se requiere
if (process.env.RUN_AT_START === 'true') {
  runSync();
}

// Manejadores de errores no capturados
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection en cron:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception en cron:', err);
});