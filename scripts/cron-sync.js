const cron = require('node-cron');
const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const mysql = require('mysql2/promise');

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

// WooCommerce DB configuration (direct MySQL access)
const MYSQL_CONFIG = {
  host: process.env.WC_DB_HOST,
  port: Number(process.env.WC_DB_PORT || 3306),
  user: process.env.WC_DB_USER,
  password: process.env.WC_DB_PASSWORD,
  database: process.env.WC_DB_NAME,
};
const TABLE_PREFIX = process.env.WC_TABLE_PREFIX || 'wp_';
let mysqlPool;
function getMysqlPool() {
  if (!mysqlPool) {
    if (!MYSQL_CONFIG.host || !MYSQL_CONFIG.user || !MYSQL_CONFIG.password || !MYSQL_CONFIG.database) {
      throw new Error('Config MySQL incompleta: WC_DB_HOST, WC_DB_USER, WC_DB_PASSWORD, WC_DB_NAME son requeridas');
    }
    mysqlPool = mysql.createPool({
      ...MYSQL_CONFIG,
      waitForConnections: true,
      connectionLimit: Number(process.env.CRON_DB_POOL_SIZE || 100),
      queueLimit: 0,
    });
  }
  return mysqlPool;
}

// Verificación/creación de índices críticos para acelerar joins y filtros
async function ensureIndexes() {
  const pool = getMysqlPool();
  const conn = await pool.getConnection();
  try {
    const dbName = MYSQL_CONFIG.database;
    async function indexExists(table, index) {
      const [rows] = await conn.query(
        `SELECT 1 FROM information_schema.statistics WHERE table_schema=? AND table_name=? AND index_name=? LIMIT 1`,
        [dbName, `${TABLE_PREFIX}${table}`, index]
      );
      return Array.isArray(rows) && rows.length > 0;
    }

    if (!(await indexExists('postmeta', 'post_id_meta_key'))) {
      await conn.execute(`ALTER TABLE \`${TABLE_PREFIX}postmeta\` ADD INDEX post_id_meta_key (post_id, meta_key)`);
      console.log('Índice post_id_meta_key creado en postmeta');
    }
    if (!(await indexExists('postmeta', 'meta_key'))) {
      await conn.execute(`ALTER TABLE \`${TABLE_PREFIX}postmeta\` ADD INDEX meta_key (meta_key)`);
      console.log('Índice meta_key creado en postmeta');
    }
    if (!(await indexExists('wc_product_meta_lookup', 'idx_product_id'))) {
      await conn.execute(`ALTER TABLE \`${TABLE_PREFIX}wc_product_meta_lookup\` ADD INDEX idx_product_id (product_id)`);
      console.log('Índice idx_product_id creado en wc_product_meta_lookup');
    }
    if (!(await indexExists('posts', 'post_type_id'))) {
      await conn.execute(`ALTER TABLE \`${TABLE_PREFIX}posts\` ADD INDEX post_type_id (post_type, ID)`);
      console.log('Índice post_type_id creado en posts');
    }
  } finally {
    conn.release();
  }
}

// Novasoft API endpoints (can be overridden via environment variables)
const NS_AUTH_URL = process.env.NS_AUTH_URL || process.env.NEXT_PUBLIC_API_BASE_URL || 'http://190.85.4.139:3000/api/auth';
const NS_PRODUCTS_URL = process.env.NS_PRODUCTS_URL || process.env.NEXT_PUBLIC_NS_PRODUCTS_URL || 'http://190.85.4.139:3000/api/productos/novasoft';
const NS_PRICES_URL = process.env.NS_PRICES_URL || process.env.NEXT_PUBLIC_NS_PRICES_URL || 'http://190.85.4.139:3000/api/con-precios';

// Utilidades de metadatos en WordPress (wp_postmeta)
async function upsertMeta(conn, postId, key, value) {
  const [rows] = await conn.execute(
    `SELECT meta_id FROM \`${TABLE_PREFIX}postmeta\` WHERE post_id = ? AND meta_key = ? LIMIT 1`,
    [postId, key]
  );
  if (Array.isArray(rows) && rows.length > 0) {
    const metaId = rows[0].meta_id;
    await conn.execute(
      `UPDATE \`${TABLE_PREFIX}postmeta\` SET meta_value = ? WHERE meta_id = ?`,
      [value, metaId]
    );
  } else {
    await conn.execute(
      `INSERT INTO \`${TABLE_PREFIX}postmeta\` (post_id, meta_key, meta_value) VALUES (?, ?, ?)`,
      [postId, key, value]
    );
  }
}

async function getAllWpProductsFromDb() {
  const pool = getMysqlPool();
  const conn = await pool.getConnection();
  try {
    const sql = `
      SELECT 
        p.ID AS id,
        p.post_status AS status,
        sku.meta_value AS sku,
        manage.meta_value AS manage_stock,
        stock.meta_value AS stock,
        stock_status.meta_value AS stock_status,
        regular.meta_value AS regular_price,
        sale.meta_value AS sale_price,
        price.meta_value AS price,
        thumb.meta_value AS thumbnail_id,
        lookup.stock_quantity AS lookup_stock_quantity,
        lookup.stock_status AS lookup_stock_status,
        lookup.min_price AS lookup_min_price,
        lookup.max_price AS lookup_max_price,
        lookup.onsale AS lookup_onsale
      FROM \`${TABLE_PREFIX}posts\` p
      LEFT JOIN \`${TABLE_PREFIX}postmeta\` sku ON sku.post_id = p.ID AND sku.meta_key = '_sku'
      LEFT JOIN \`${TABLE_PREFIX}postmeta\` manage ON manage.post_id = p.ID AND manage.meta_key = '_manage_stock'
      LEFT JOIN \`${TABLE_PREFIX}postmeta\` stock ON stock.post_id = p.ID AND stock.meta_key = '_stock'
      LEFT JOIN \`${TABLE_PREFIX}postmeta\` stock_status ON stock_status.post_id = p.ID AND stock_status.meta_key = '_stock_status'
      LEFT JOIN \`${TABLE_PREFIX}postmeta\` regular ON regular.post_id = p.ID AND regular.meta_key = '_regular_price'
      LEFT JOIN \`${TABLE_PREFIX}postmeta\` sale ON sale.post_id = p.ID AND sale.meta_key = '_sale_price'
      LEFT JOIN \`${TABLE_PREFIX}postmeta\` price ON price.post_id = p.ID AND price.meta_key = '_price'
      LEFT JOIN \`${TABLE_PREFIX}postmeta\` thumb ON thumb.post_id = p.ID AND thumb.meta_key = '_thumbnail_id'
      LEFT JOIN \`${TABLE_PREFIX}wc_product_meta_lookup\` lookup ON lookup.product_id = p.ID
      WHERE p.post_type = 'product'
    `;
    const [rows] = await conn.query(sql);
    return rows.map(r => ({
      id: r.id,
      status: r.status,
      sku: r.sku ? String(r.sku).trim() : null,
      manage_stock: r.manage_stock,
      stock_quantity: r.stock ? Number(r.stock) : (r.lookup_stock_quantity ?? 0),
      stock_status: r.stock_status || r.lookup_stock_status,
      regular_price: r.regular_price,
      sale_price: r.sale_price,
      price: r.price,
      has_image: !!r.thumbnail_id,
    })).filter(p => p.sku);
  } finally {
    conn.release();
  }
}

async function applyBatchUpdatesTransactional(updates) {
  if (!updates || updates.length === 0) return { updated: 0, failed: 0 };
  const pool = getMysqlPool();
  const attemptMax = 3;
  let updated = 0;
  let failed = 0;

  for (let attempt = 1; attempt <= attemptMax; attempt++) {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const lookupRows = [];
      for (const upd of updates) {
        const productId = upd.id;
        const nsStock = normalizeStock(upd.nsStock);
        const desiredStatus = upd.status;
        const manageValue = 'yes';
        const inStock = nsStock > 0;
        const stockStatus = inStock ? 'instock' : 'outofstock';

        // Update post status
        if (typeof desiredStatus === 'string') {
          await conn.execute(
            `UPDATE \`${TABLE_PREFIX}posts\` SET post_status = ? WHERE ID = ?`,
            [desiredStatus, productId]
          );
        }

        // Meta en bloque (DELETE + INSERT) para reducir I/O
        let reg = upd.regular_price ? String(upd.regular_price) : null;
        let sale = (upd.sale_price !== undefined && upd.sale_price !== null) ? String(upd.sale_price) : null;
        const hasSale = !!sale && sale.trim() !== '' && Number(sale) > 0;
        const effPrice = hasSale ? sale : (reg || '0');
        const entries = [
          { key: '_manage_stock', value: manageValue },
          { key: '_stock', value: String(nsStock) },
          { key: '_stock_status', value: stockStatus },
          { key: '_price', value: effPrice },
        ];
        if (reg !== null) entries.push({ key: '_regular_price', value: reg });
        if (sale !== null) entries.push({ key: '_sale_price', value: sale });
        await setMetaBulk(conn, productId, entries);

        const minPrice = Number(effPrice || 0);
        const maxPrice = minPrice;
        const onsale = hasSale && Number(sale) > 0 && (reg ? Number(sale) < Number(reg) : true) ? 1 : 0;

        // Acumular fila para upsert bulk en wc_product_meta_lookup
        lookupRows.push([productId, nsStock, stockStatus, minPrice, maxPrice, onsale]);

        updated += 1;
      }
      // Ejecutar upsert bulk si hay filas acumuladas
      if (lookupRows.length > 0) {
        const placeholders = lookupRows.map(() => '(?, ?, ?, ?, ?, ?)').join(',');
        const flatValues = lookupRows.flat();
        const sql = `INSERT INTO \`${TABLE_PREFIX}wc_product_meta_lookup\` (product_id, stock_quantity, stock_status, min_price, max_price, onsale)
          VALUES ${placeholders}
          ON DUPLICATE KEY UPDATE stock_quantity=VALUES(stock_quantity), stock_status=VALUES(stock_status), min_price=VALUES(min_price), max_price=VALUES(max_price), onsale=VALUES(onsale)`;
        await conn.execute(sql, flatValues);
      }
      await conn.commit();
      break; // exit attempts loop if commit succeeded
    } catch (err) {
      await conn.rollback();
      const msg = err?.code || err?.message || String(err);
      const retriable = /ER_LOCK_DEADLOCK|ER_LOCK_WAIT_TIMEOUT/i.test(msg);
      if (!retriable || attempt === attemptMax) {
        failed += updates.length - updated;
        console.warn('Transacción fallida al aplicar actualizaciones:', err?.message || err);
        break;
      }
      // backoff antes de reintentar
      await new Promise(r => setTimeout(r, 200 * attempt));
    } finally {
      conn.release();
    }
  }
  return { updated, failed };
}

// Lectura paginada con cursor por ID para evitar cargar todo en memoria
async function getWpProductsCursorBatch(afterId, limit) {
  const pool = getMysqlPool();
  const conn = await pool.getConnection();
  try {
    const sql = `
      SELECT 
        p.ID AS id,
        p.post_status AS status,
        sku.meta_value AS sku,
        thumb.meta_value AS thumbnail_id
      FROM \`${TABLE_PREFIX}posts\` p
      LEFT JOIN \`${TABLE_PREFIX}postmeta\` sku ON sku.post_id = p.ID AND sku.meta_key = '_sku'
      LEFT JOIN \`${TABLE_PREFIX}postmeta\` thumb ON thumb.post_id = p.ID AND thumb.meta_key = '_thumbnail_id'
      WHERE p.post_type = 'product' AND p.ID > ?
      ORDER BY p.ID ASC
      LIMIT ?
    `;
    const [rows] = await conn.query(sql, [afterId, limit]);
    return rows.map(r => ({
      id: r.id,
      status: r.status,
      sku: r.sku ? String(r.sku).trim() : null,
      has_image: !!r.thumbnail_id,
    })).filter(p => p.sku);
  } finally {
    conn.release();
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
  const token = data.token || data.accessToken || data.access_token;
  if (!token) throw new Error(data.message || data.error || 'No se recibió token de autenticación');
  return token;
}

async function fetchPage(url, token, params = {}) {
  const targetUrl = new URL(url);
  Object.keys(params).forEach(key => targetUrl.searchParams.append(key, params[key]));
  
  const res = await fetch(targetUrl.toString(), {
    method: 'GET',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Error obteniendo datos de ${url}: ${res.status} ${res.statusText} - ${text}`);
  }

  const contentType = res.headers.get('content-type') || '';
  return contentType.includes('application/json') ? await res.json() : JSON.parse(await res.text());
}

async function getProducts(token) {
  let allProducts = [];
  let page = 1;
  let totalPages = 1;

  do {
    const params = {
      sucursal: 'cuc',
      bodega: '080',
      empresa: 'cbb sas',
      page: String(page)
    };

    const data = await fetchPage(NS_PRODUCTS_URL, token, params);
    
    let pageItems = [];
    if (Array.isArray(data)) pageItems = data;
    else if (Array.isArray(data?.data)) pageItems = data.data;
    else if (Array.isArray(data?.productos)) pageItems = data.productos;
    
    if (data.total_pages && typeof data.total_pages === 'number') {
      totalPages = data.total_pages;
    }

    allProducts = allProducts.concat(pageItems);
    page++;
  } while (page <= totalPages);

  return allProducts;
}

async function getPrices(token) {
  let allPrices = [];
  let page = 1;
  let totalPages = 1;

  do {
    const params = {
      sucursal: 'cuc',
      bodega: '080',
      page: String(page)
    };

    const data = await fetchPage(NS_PRICES_URL, token, params);
    
    let pageItems = [];
    if (data?.success && Array.isArray(data?.data)) pageItems = data.data;
    else if (Array.isArray(data)) pageItems = data;
    else if (Array.isArray(data?.data)) pageItems = data.data;

    if (data.total_pages && typeof data.total_pages === 'number') {
      totalPages = data.total_pages;
    }

    allPrices = allPrices.concat(pageItems);
    page++;
  } while (page <= totalPages);

  return allPrices;
}

function mergeProductsWithPrices(products, prices) {
  // Transformation logic: Group by cod_item and pivot prices
  const pricesMap = new Map();
  
  // First pass: aggregate raw prices by product code
  for (const item of prices) {
    const code = item.cod_item ? String(item.cod_item).trim() : '';
    if (!code) continue;

    if (!pricesMap.has(code)) {
      pricesMap.set(code, {
        precioAnterior: 0,
        precioActual: 0,
        existencia: 0 // API de precios no trae existencia
      });
    }
    
    const entry = pricesMap.get(code);
    // Usar precioiva como precio final
    const precio = Number(item.precioiva || 0);
    const codLis = String(item.cod_lis || '').trim();

    if (codLis === '05' || codLis === '5') {
      entry.precioActual = precio;
    } else if (codLis === '22') {
      entry.precioAnterior = precio;
    }
  }

  // Second pass: merge with products
  return products.map((product) => {
    const code = product.cod_item?.trim();
    const priceData = code ? pricesMap.get(code) : null;
    if (priceData) {
      return {
        ...product,
        precioAnterior: priceData.precioAnterior,
        precioActual: priceData.precioActual,
        // Existencia viene del producto (stock endpoint), no de precios
        existencia: product.existencia,
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
        statusChanges: { toDraft: 0, toPublish: 0 },
        perf: { nsMapMs: 0, wpReadMs: 0, applyMs: 0, pageSize: Number(process.env.CRON_PAGE_SIZE || 500), concurrency: Number(process.env.CRON_CONCURRENCY || 4), poolSize: Number(process.env.CRON_DB_POOL_SIZE || 100), batches: 0, processed: 0 }
      }
    };
  }

  // Fase 1 y 2: construir mapa de Novasoft y paginar lectura de WP para evitar picos de memoria
  console.log('Construyendo referencia de Novasoft y activando lectura paginada de WP...');
  const tMapStart = Date.now();
  const nsInfoMap = new Map();
  for (const p of validProducts) {
    const sku = String(p.cod_item).trim().toLowerCase();
    nsInfoMap.set(sku, {
      existencia: normalizeStock(p.existencia),
      precioAnterior: p.precioAnterior,
      precioActual: p.precioActual,
    });
  }
  const tMapEnd = Date.now();
  const PAGE_SIZE = Number(process.env.CRON_PAGE_SIZE || 500);
  const CONCURRENCY = Number(process.env.CRON_CONCURRENCY || 4);
  const TX_BATCH_SIZE = Number(process.env.CRON_TX_BATCH_SIZE || 250);
  let afterId = 0;
  let statusChanges = { toDraft: 0, toPublish: 0 };
  let successful = 0;
  let failed = 0;
  let wpReadMs = 0;
  let applyMs = 0;
  let batches = 0;
  let processed = 0;
  const pendingChunks = [];
  while (true) {
    const tReadStart = Date.now();
    const batch = await getWpProductsCursorBatch(afterId, PAGE_SIZE);
    wpReadMs += Date.now() - tReadStart;
    if (batch.length === 0) break;
    afterId = batch[batch.length - 1].id;
    processed += batch.length;

    const updatesBatch = [];
    for (const wp of batch) {
      const sku = wp.sku ? String(wp.sku).trim().toLowerCase() : null;
      if (!sku) continue;
      const ns = nsInfoMap.get(sku);
      if (ns) {
        const nsStock = ns.existencia;
        const currentStatus = wp.status || PRODUCT_STATUS.DRAFT;
        let newStatus = determineProductStatus(nsStock);
        if (!wp.has_image) newStatus = PRODUCT_STATUS.DRAFT;
        const update = {
          id: wp.id,
          nsStock,
          regular_price: (ns.precioAnterior && ns.precioAnterior > 0) ? String(ns.precioAnterior) : undefined,
          sale_price: (ns.precioActual && ns.precioActual > 0) ? String(ns.precioActual) : undefined,
          status: currentStatus !== newStatus ? newStatus : undefined,
        };
        if (update.status === PRODUCT_STATUS.DRAFT) statusChanges.toDraft++;
        else if (update.status === PRODUCT_STATUS.PUBLISH) statusChanges.toPublish++;
        updatesBatch.push(update);
      } else {
        updatesBatch.push({
          id: wp.id,
          nsStock: 0,
          status: PRODUCT_STATUS.DRAFT,
          regular_price: undefined,
          sale_price: undefined,
        });
        statusChanges.toDraft++;
      }
    }

    if (updatesBatch.length > 0) {
      // Dividir en sublotes para transacciones más cortas y mayor paralelización
      for (let i = 0; i < updatesBatch.length; i += TX_BATCH_SIZE) {
        pendingChunks.push(updatesBatch.slice(i, i + TX_BATCH_SIZE));
      }
      if (pendingChunks.length >= CONCURRENCY) {
        const tApplyStart = Date.now();
        const results = await Promise.all(pendingChunks.map(chunk => applyBatchUpdatesTransactional(chunk)));
        applyMs += Date.now() - tApplyStart;
        for (const r of results) { successful += r.updated; failed += r.failed; }
        batches += pendingChunks.length;
        pendingChunks.length = 0;
      }
    }
  }
  if (pendingChunks.length > 0) {
    const tApplyStart = Date.now();
    const results = await Promise.all(pendingChunks.map(chunk => applyBatchUpdatesTransactional(chunk)));
    applyMs += Date.now() - tApplyStart;
    for (const r of results) { successful += r.updated; failed += r.failed; }
    batches += pendingChunks.length;
  }

  return {
    success: failed === 0,
    results,
    summary: {
      total: successful + failed,
      successful,
      failed,
      skipped: 0,
      existingInWoo: successful + failed,
      totalNovasoft: products.length,
      statusChanges,
      perf: {
        nsMapMs: tMapEnd - tMapStart,
        wpReadMs,
        applyMs,
        pageSize: PAGE_SIZE,
        concurrency: CONCURRENCY,
        poolSize: Number(process.env.CRON_DB_POOL_SIZE || 100),
        batches,
        processed,
      }
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
    // Asegurar índices críticos antes de tocar tablas grandes
    await ensureIndexes();
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
         error_message = NULL,
         details = ?
         WHERE id = ?`,
        finishedAt,
        syncResult.summary.total,
        syncResult.summary.successful,
        syncResult.summary.failed,
        JSON.stringify(syncResult.summary.statusChanges),
        durationMs,
        JSON.stringify(syncResult.summary.perf || {}),
        executionId
      );
    }

    // Invalidar transients de WooCommerce para evitar caches desfasados
    try {
      await invalidateWooTransients();
      console.log('Transients de WooCommerce eliminados en wp_options.');
    } catch (e) {
      console.warn('No se pudo invalidar transients de WooCommerce:', e?.message || e);
    }

    console.log(`Sincronización completada en ${Math.round(durationMs / 1000)}s`);
    console.log(`Resumen: ${syncResult.summary.successful} éxitos, ${syncResult.summary.failed} fallos`);
    console.log(`Cambios de estado: ${syncResult.summary.statusChanges.toDraft} a borrador, ${syncResult.summary.statusChanges.toPublish} a público`);
    if (syncResult.summary.perf) {
      const perf = syncResult.summary.perf;
      console.log(`Métricas: nsMap=${perf.nsMapMs}ms, wpRead=${perf.wpReadMs}ms, apply=${perf.applyMs}ms, batches=${perf.batches}, processed=${perf.processed}, pageSize=${perf.pageSize}, concurrency=${perf.concurrency}, poolSize=${perf.poolSize}`);
    }

    // Estadísticas históricas de duración (últimas 10 ejecuciones)
    try {
      if (db) {
        const rows = await db.all(`SELECT duration FROM cron_executions WHERE status='completed' AND duration IS NOT NULL ORDER BY id DESC LIMIT 10`);
        const durs = rows.map(r => Number(r.duration || 0)).filter(v => Number.isFinite(v) && v > 0);
        if (durs.length > 0) {
          const avg = Math.round(durs.reduce((a, b) => a + b, 0) / durs.length);
          const sorted = [...durs].sort((a, b) => a - b);
          const med = sorted[Math.floor(sorted.length / 2)];
          const p90 = sorted[Math.floor(sorted.length * 0.9)];
          console.log(`Histórico últimas ${durs.length}: avg=${Math.round(avg/1000)}s, med=${Math.round(med/1000)}s, p90=${Math.round(p90/1000)}s`);
        }
      }
    } catch (e) {
      console.warn('No se pudieron calcular estadísticas históricas:', e?.message || e);
    }

    // Recursos del proceso
    try {
      const mem = process.memoryUsage();
      const toMB = (n) => Math.round(n / 1024 / 1024);
      console.log(`Recursos: rss=${toMB(mem.rss)}MB, heapUsed=${toMB(mem.heapUsed)}MB, external=${toMB(mem.external)}MB`);
    } catch {}

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

// Utilidad: invalidar transients de WooCommerce eliminando filas (más seguro que poner NULL)
async function invalidateWooTransients() {
  const pool = getMysqlPool();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    // WordPress guarda transients en dos filas: valor y timeout
    await conn.execute(`DELETE FROM \`${TABLE_PREFIX}options\` WHERE option_name LIKE '_transient_wc_%'`);
    await conn.execute(`DELETE FROM \`${TABLE_PREFIX}options\` WHERE option_name LIKE '_transient_timeout_wc_%'`);
    await conn.commit();
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

// Modo CLI para solo invalidar transients y salir
if (process.argv.includes('--invalidate-transients')) {
  (async () => {
    try {
      await invalidateWooTransients();
      console.log('Transients de WooCommerce eliminados.');
      process.exit(0);
    } catch (e) {
      console.error('Error eliminando transients:', e?.message || e);
      process.exit(1);
    }
  })();
}

// Escritura de metadatos en bloque: elimina claves objetivo y reinserta
async function setMetaBulk(conn, postId, entries) {
  if (!entries || entries.length === 0) return;
  const keys = entries.map(e => e.key);
  const placeholders = keys.map(() => '?').join(',');
  await conn.execute(
    `DELETE FROM \`${TABLE_PREFIX}postmeta\` WHERE post_id = ? AND meta_key IN (${placeholders})`,
    [postId, ...keys]
  );
  const values = [];
  const tuples = entries.map(e => {
    values.push(postId, e.key, e.value);
    return '(?, ?, ?)';
  }).join(',');
  await conn.execute(
    `INSERT INTO \`${TABLE_PREFIX}postmeta\` (post_id, meta_key, meta_value) VALUES ${tuples}`,
    values
  );
}