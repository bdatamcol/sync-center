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
const NS_AUTH_URL = process.env.NS_AUTH_URL || 'http://192.168.1.32:3000/api/auth';
const NS_PRODUCTS_URL = process.env.NS_PRODUCTS_URL || 'http://192.168.1.32:3000/api/productos/novasoft';
const NS_PRICES_URL = process.env.NS_PRICES_URL || 'http://192.168.1.32:3000/api/con-precios';

function base64Auth(key, secret) {
  return Buffer.from(`${key}:${secret}`).toString('base64');
}

async function makeWooRequest(endpoint, method = 'GET', data) {
  const url = `${WOOCOMMERCE_CONFIG.url}wp-json/${WOOCOMMERCE_CONFIG.version}/${endpoint}`;
  const auth = base64Auth(WOOCOMMERCE_CONFIG.key, WOOCOMMERCE_CONFIG.secret);
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

  const res = await fetch(url, options);
  if (!res.ok) {
    let detail;
    try {
      const j = await res.json();
      detail = j?.message || JSON.stringify(j);
    } catch {
      detail = await res.text();
    }
    throw new Error(`WooCommerce API Error: ${res.status} ${res.statusText} - ${detail}`);
  }
  return res.json();
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

// Obtener todos los productos de WooCommerce con paginación
async function getAllWooProducts() {
  const perPage = 100;
  let page = 1;
  const all = [];
  try {
    while (true) {
      const products = await makeWooRequest(`products?per_page=${perPage}&page=${page}&status=any`);
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

  // Fase 3: Sincronizar solo los productos que existen en WooCommerce
  let successful = 0;
  let failed = 0;
  let processedCount = 0;

  // Procesar en lotes para mejor rendimiento
  const BATCH_SIZE = 50;
  const CONCURRENCY_LIMIT = 10;

  for (let i = 0; i < productsToSync.length; i += BATCH_SIZE) {
    const batch = productsToSync.slice(i, i + BATCH_SIZE);
    let nextIndex = 0;

    const worker = async () => {
      while (true) {
        const idx = nextIndex++;
        if (idx >= batch.length) break;

        const product = batch[idx];
        const startTime = Date.now();

        try {
          // Usar la función existente pero sabemos que el producto existe
          const sku = String(product.cod_item).trim().toLowerCase();
          const wooProduct = wooSkuMap.get(sku);

          // Preparar datos de actualización
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
          const result = { 
            success: true, 
            message: 'Producto sincronizado exitosamente', 
            productData: updated 
          };

          results.push({ product, result });
          successful++;
        } catch (error) {
          const result = {
            success: false,
            message: 'Error de conexión durante la sincronización',
            error: error.message || 'Error desconocido'
          };
          
          results.push({ product, result });
          failed++;
        }

        processedCount++;

        if (processedCount % 50 === 0 || processedCount === productsToSync.length) {
          console.log(
            `Progreso sincronización: ${processedCount}/${productsToSync.length} (${Math.round((processedCount / productsToSync.length) * 100)}%)`
          );
        }
      }
    };

    // Ejecutar workers concurrentes
    const workers = Array.from({ length: Math.min(CONCURRENCY_LIMIT, batch.length) }, () => worker());
    await Promise.all(workers);

    // Pequeña pausa entre lotes
    if (i + BATCH_SIZE < productsToSync.length) {
      await new Promise(resolve => setTimeout(resolve, 100));
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
    for (let i = 0; i < candidates.length; i++) {
      const wc = candidates[i];
      try {
        await updateWooProduct(wc.id, { manage_stock: true, stock_quantity: 0, in_stock: false, status: 'draft' });
        adjusted++;
        if ((i + 1) % 50 === 0) {
          console.log(`Ajuste progreso: ${i + 1}/${candidates.length}`);
        }
        await new Promise((r) => setTimeout(r, 100));
      } catch (err) {
        adjustErrors++;
        console.warn(`No se pudo ajustar producto WooCommerce id=${wc.id} sku=${wc.sku}:`, err?.message || err);
      }
    }
    console.log(`Ajuste de ausentes completado: ${adjusted}/${candidates.length} marcados como borrador con stock 0${adjustErrors ? `, ${adjustErrors} errores` : ''}.`);
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