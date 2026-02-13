const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const mysql = require('mysql2/promise');

// Cargar variables desde .env si existe (útil cuando se ejecuta como script independiente)
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
      // console.log(`Variables de entorno cargadas desde .env (${envPath}).`);
    }
  } catch (err) {
    console.warn('No se pudo cargar .env:', err?.message || err);
  }
}

// Constantes de configuración
const STOCK_THRESHOLD = 3;
const PRODUCT_STATUS = {
  DRAFT: 'draft',
  PUBLISH: 'publish'
};

// Configuración MySQL
let mysqlPool;
let MYSQL_CONFIG;
let TABLE_PREFIX;

function initMysqlConfig() {
  MYSQL_CONFIG = {
    host: process.env.WC_DB_HOST,
    port: Number(process.env.WC_DB_PORT || 3306),
    user: process.env.WC_DB_USER,
    password: process.env.WC_DB_PASSWORD,
    database: process.env.WC_DB_NAME,
  };

  // Soporte básico para SSL
  if (process.env.WC_DB_SSL === 'true' || process.env.WC_DB_SSL_CA || process.env.WC_DB_SSL_REJECT_UNAUTHORIZED === 'false') {
    MYSQL_CONFIG.ssl = {};
    if (process.env.WC_DB_SSL_REJECT_UNAUTHORIZED === 'false') {
      MYSQL_CONFIG.ssl.rejectUnauthorized = false;
    }
    if (process.env.WC_DB_SSL_CA) {
      MYSQL_CONFIG.ssl.ca = process.env.WC_DB_SSL_CA;
    }
  }

  TABLE_PREFIX = process.env.WC_TABLE_PREFIX || 'wp_';
}

async function checkDbConnection() {
  try {
    const pool = getMysqlPool();
    // Intentar obtener una conexión y hacer un ping simple
    const conn = await pool.getConnection();
    await conn.ping();
    conn.release();
    // console.log('Conexión a BD exitosa');
    return true;
  } catch (err) {
    console.error('Error verificando conexión a BD:', err.message);
    // Lanzar error descriptivo para que se muestre en el log/UI
    throw new Error(`Fallo de conexión a BD (${MYSQL_CONFIG?.host}): ${err.message}`);
  }
}


function getMysqlPool() {
  if (!MYSQL_CONFIG) initMysqlConfig();
  
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
    }
    if (!(await indexExists('postmeta', 'meta_key'))) {
      await conn.execute(`ALTER TABLE \`${TABLE_PREFIX}postmeta\` ADD INDEX meta_key (meta_key)`);
    }
    if (!(await indexExists('wc_product_meta_lookup', 'idx_product_id'))) {
      await conn.execute(`ALTER TABLE \`${TABLE_PREFIX}wc_product_meta_lookup\` ADD INDEX idx_product_id (product_id)`);
    }
    if (!(await indexExists('posts', 'post_type_id'))) {
      await conn.execute(`ALTER TABLE \`${TABLE_PREFIX}posts\` ADD INDEX post_type_id (post_type, ID)`);
    }
  } finally {
    conn.release();
  }
}

// Configuración API Novasoft
function getNovasoftUrls() {
  return {
    AUTH_URL: process.env.NS_AUTH_URL || 'http://192.168.1.32:8082/api/Authenticate',
    PRODUCTS_URL: process.env.NS_PRODUCTS_URL || 'http://192.168.1.32:8082/api/consultas/bodega-existencia',
    PRICES_URL: process.env.NS_PRICES_URL || 'http://192.168.1.32:8082/api/consultas/listas'
  };
}

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

async function getWpProductsCursorBatch(afterId, limit) {
  const pool = getMysqlPool();
  const conn = await pool.getConnection();
  try {
    const sql = `
      SELECT 
        p.ID AS id,
        p.post_status AS status,
        sku.meta_value AS sku,
        thumb.meta_value AS thumbnail_id,
        reg.meta_value AS regular_price,
        sale.meta_value AS sale_price,
        stk.meta_value AS stock_quantity
      FROM \`${TABLE_PREFIX}posts\` p
      LEFT JOIN \`${TABLE_PREFIX}postmeta\` sku ON sku.post_id = p.ID AND sku.meta_key = '_sku'
      LEFT JOIN \`${TABLE_PREFIX}postmeta\` thumb ON thumb.post_id = p.ID AND thumb.meta_key = '_thumbnail_id'
      LEFT JOIN \`${TABLE_PREFIX}postmeta\` reg ON reg.post_id = p.ID AND reg.meta_key = '_regular_price'
      LEFT JOIN \`${TABLE_PREFIX}postmeta\` sale ON sale.post_id = p.ID AND sale.meta_key = '_sale_price'
      LEFT JOIN \`${TABLE_PREFIX}postmeta\` stk ON stk.post_id = p.ID AND stk.meta_key = '_stock'
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
      regular_price: r.regular_price,
      sale_price: r.sale_price,
      stock_quantity: r.stock_quantity
    })).filter(p => p.sku);
  } finally {
    conn.release();
  }
}

function normalizeStock(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || Number.isNaN(n)) return 0;
  return n < 0 ? 0 : Math.floor(n);
}

function determineProductStatus(stockQuantity) {
  const normalizedStock = normalizeStock(stockQuantity);
  return normalizedStock > STOCK_THRESHOLD ? PRODUCT_STATUS.PUBLISH : PRODUCT_STATUS.DRAFT;
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

        // Update post status AND modify date to ensure caches are invalidated
        if (typeof desiredStatus === 'string') {
          await conn.execute(
            `UPDATE \`${TABLE_PREFIX}posts\` SET post_status = ?, post_modified = NOW(), post_modified_gmt = UTC_TIMESTAMP() WHERE ID = ?`,
            [desiredStatus, productId]
          );
        } else {
          // Even if status didn't change, we must update modified date because price/stock changed
          await conn.execute(
            `UPDATE \`${TABLE_PREFIX}posts\` SET post_modified = NOW(), post_modified_gmt = UTC_TIMESTAMP() WHERE ID = ?`,
            [productId]
          );
        }

        // Meta en bloque
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

        lookupRows.push([productId, nsStock, stockStatus, minPrice, maxPrice, onsale]);
        updated += 1;
      }
      
      if (lookupRows.length > 0) {
        const placeholders = lookupRows.map(() => '(?, ?, ?, ?, ?, ?)').join(',');
        const flatValues = lookupRows.flat();
        const sql = `INSERT INTO \`${TABLE_PREFIX}wc_product_meta_lookup\` (product_id, stock_quantity, stock_status, min_price, max_price, onsale)
          VALUES ${placeholders}
          ON DUPLICATE KEY UPDATE stock_quantity=VALUES(stock_quantity), stock_status=VALUES(stock_status), min_price=VALUES(min_price), max_price=VALUES(max_price), onsale=VALUES(onsale)`;
        await conn.execute(sql, flatValues);
      }
      await conn.commit();
      break;
    } catch (err) {
      await conn.rollback();
      const msg = err?.code || err?.message || String(err);
      const retriable = /ER_LOCK_DEADLOCK|ER_LOCK_WAIT_TIMEOUT/i.test(msg);
      if (!retriable || attempt === attemptMax) {
        failed += updates.length - updated;
        console.warn('Transacción fallida al aplicar actualizaciones:', err?.message || err);
        break;
      }
      await new Promise(r => setTimeout(r, 200 * attempt));
    } finally {
      conn.release();
    }
  }
  return { updated, failed };
}

async function syncAllProductsOptimized(products) {
  const validProducts = products.filter((p) => p.cod_item && String(p.cod_item).trim());
  
  if (validProducts.length === 0) {
    return {
      success: true,
      summary: { total: 0, successful: 0, failed: 0, existingInWoo: 0, totalNovasoft: products.length, statusChanges: { toDraft: 0, toPublish: 0 } }
    };
  }

  const nsInfoMap = new Map();
  for (const p of validProducts) {
    const sku = String(p.cod_item).trim().toLowerCase();
    nsInfoMap.set(sku, {
      existencia: normalizeStock(p.existencia),
      precioAnterior: p.precioAnterior,
      precioActual: p.precioActual,
    });
  }

  const PAGE_SIZE = Number(process.env.CRON_PAGE_SIZE || 500);
  const CONCURRENCY = Number(process.env.CRON_CONCURRENCY || 4);
  const TX_BATCH_SIZE = Number(process.env.CRON_TX_BATCH_SIZE || 250);
  let afterId = 0;
  let statusChanges = { toDraft: 0, toPublish: 0 };
  let successful = 0;
  let failed = 0;
  let batches = 0;
  const pendingChunks = [];

  while (true) {
    const batch = await getWpProductsCursorBatch(afterId, PAGE_SIZE);
    if (batch.length === 0) break;
    afterId = batch[batch.length - 1].id;

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

        const nsAnterior = Number(ns.precioAnterior || 0);
        const nsActual = Number(ns.precioActual || 0);
        let expectedRegular = 0;
        let expectedSale = undefined;
        
        const hasAnterior = nsAnterior > 0;
        const hasActual = nsActual > 0;

        if (hasAnterior && hasActual) {
            expectedRegular = nsAnterior;
            expectedSale = nsActual;
        } else if (hasActual) {
            expectedRegular = nsActual;
        } else if (hasAnterior) {
            expectedRegular = nsAnterior;
        }

        const fmt = (n) => String(Math.round(n));
        const newRegular = expectedRegular > 0 ? fmt(expectedRegular) : undefined;
        const newSale = expectedSale !== undefined ? fmt(expectedSale) : '';

        const currentRegular = wp.regular_price || '';
        const currentSale = wp.sale_price || '';

        const isDifferent = (a, b) => {
            if (!a && !b) return false;
            if (!a || !b) return true;
            return Math.round(Number(a)) !== Math.round(Number(b));
        };

        let priceChanged = false;
        if (newRegular !== undefined && isDifferent(currentRegular, newRegular)) priceChanged = true;
        if (newSale === '') {
            if (currentSale !== '') priceChanged = true;
        } else {
            if (isDifferent(currentSale, newSale)) priceChanged = true;
        }

        const currentStock = Number(wp.stock_quantity || 0);
        const stockChanged = currentStock !== nsStock;
        const statusChanged = currentStatus !== newStatus;

        if (stockChanged || statusChanged || priceChanged) {
            const finalRegular = newRegular !== undefined ? newRegular : currentRegular;
            const update = {
                id: wp.id,
                nsStock,
                regular_price: finalRegular,
                sale_price: newSale,
                status: statusChanged ? newStatus : undefined,
            };
            if (update.status === PRODUCT_STATUS.DRAFT) statusChanges.toDraft++;
            else if (update.status === PRODUCT_STATUS.PUBLISH) statusChanges.toPublish++;
            updatesBatch.push(update);
        }
      } else {
        // Producto en WooCommerce pero no en Novasoft (o no en la lista pasada)
        // En modo "full sync", esto significa que no existe en bodega/lista, poner a draft y stock 0
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
      for (let i = 0; i < updatesBatch.length; i += TX_BATCH_SIZE) {
        pendingChunks.push(updatesBatch.slice(i, i + TX_BATCH_SIZE));
      }
      if (pendingChunks.length >= CONCURRENCY) {
        const results = await Promise.all(pendingChunks.map(chunk => applyBatchUpdatesTransactional(chunk)));
        for (const r of results) { successful += r.updated; failed += r.failed; }
        batches += pendingChunks.length;
        pendingChunks.length = 0;
      }
    }
  }
  
  if (pendingChunks.length > 0) {
    const results = await Promise.all(pendingChunks.map(chunk => applyBatchUpdatesTransactional(chunk)));
    for (const r of results) { successful += r.updated; failed += r.failed; }
    batches += pendingChunks.length;
  }

  return {
    success: failed === 0,
    summary: {
      total: successful + failed,
      successful,
      failed,
      existingInWoo: successful + failed,
      totalNovasoft: products.length,
      statusChanges,
      perf: { batches }
    }
  };
}

let cachedToken = null;
let tokenExpiresAt = 0;

async function getJsonOrText(res) {
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return await res.json();
  } else {
    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch (e) {
      if (res.ok && text.length > 20) return text; 
      return { error: text };
    }
  }
}

function parseAndCacheToken(data) {
  let token = null;
  if (typeof data === 'string') token = data;
  else if (data.token) token = data.token;
  else if (data.accessToken) token = data.accessToken;
  else if (data.access_token) token = data.access_token;
  
  if (!token) throw new Error(data.message || data.error || 'No se recibió token de autenticación');
  
  cachedToken = token;
  let expiresAt = Date.now() + 3600 * 1000;
  
  if (data.expires_at) {
    const parsed = Date.parse(data.expires_at);
    if (!isNaN(parsed)) expiresAt = parsed;
  } else if (typeof data.expiresIn === 'number') {
    expiresAt = Date.now() + data.expiresIn * 1000;
  }
  
  tokenExpiresAt = expiresAt;
  return token;
}

async function loginNovasoft(forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && cachedToken && tokenExpiresAt > now + 300000) return cachedToken;
  
  const { AUTH_URL } = getNovasoftUrls();
  const username = process.env.NOVASOFT_USER;
  const password = process.env.NOVASOFT_PASS;
  
  if (!username || !password) throw new Error('Credenciales NOVASOFT no configuradas');
  
  const res = await fetch(`${AUTH_URL}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Login NOVASOFT falló: ${res.status} ${res.statusText}`);
  }
  
  const data = await getJsonOrText(res);
  return parseAndCacheToken(data);
}

async function getProducts(token) {
  let allProducts = [];
  let page = 1;
  let totalPages = 1;
  const { PRODUCTS_URL } = getNovasoftUrls();
  const url = new URL(PRODUCTS_URL);
  
  url.searchParams.append('sucursal', 'cuc');
  url.searchParams.append('bodega', '080');
  url.searchParams.append('empresa', 'cbb sas');

  do {
    url.searchParams.set('page', page.toString());
    const res = await fetch(url.toString(), {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    });

    if (!res.ok) {
      if (res.status === 401) throw new Error('401 Unauthorized');
      throw new Error(`Error obteniendo productos página ${page}: ${res.status} ${res.statusText}`);
    }

    const data = await res.json();
    let pageProducts = [];
    
    if (data && typeof data === 'object') {
       if (data.data && Array.isArray(data.data)) pageProducts = data.data;
       else if (Array.isArray(data)) pageProducts = data;
       else if (data.productos && Array.isArray(data.productos)) pageProducts = data.productos;
       if (data.total_pages && typeof data.total_pages === 'number') totalPages = data.total_pages;
    }
    allProducts = allProducts.concat(pageProducts);
    page++;
  } while (page <= totalPages);
  return allProducts;
}

async function getPrices(token) {
  let allPrices = [];
  let page = 1;
  let totalPages = 1;
  const { PRICES_URL } = getNovasoftUrls();
  const url = new URL(PRICES_URL);
  
  url.searchParams.append('sucursal', 'cuc');
  url.searchParams.append('bodega', '080');

  do {
    url.searchParams.set('page', page.toString());
    const res = await fetch(url.toString(), {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    });

    if (!res.ok) {
      if (res.status === 401) throw new Error('401 Unauthorized');
      throw new Error(`Error obteniendo precios página ${page}: ${res.status} ${res.statusText}`);
    }

    const data = await res.json();
    let pagePrices = [];
    
    if (data && typeof data === 'object') {
      if (Array.isArray(data.data)) pagePrices = data.data;
      else if (Array.isArray(data)) pagePrices = data;
      if (data.total_pages && typeof data.total_pages === 'number') totalPages = data.total_pages;
    }
    allPrices = allPrices.concat(pagePrices);
    page++;
  } while (page <= totalPages);
  return allPrices;
}

function mergeProductsWithPrices(products, prices) {
  const mergedMap = new Map();

  for (const prod of products) {
    const code = prod.cod_item ? String(prod.cod_item).trim() : null;
    if (!code) continue;
    mergedMap.set(code, {
      ...prod,
      cod_item: code,
      existencia: prod.existencia,
      precioAnterior: 0,
      precioActual: 0
    });
  }

  for (const p of prices) {
    const code = p.cod_item ? String(p.cod_item).trim() : null;
    if (!code) continue;

    let entry = mergedMap.get(code);
    if (!entry) {
        entry = {
            cod_item: code,
            des_item: p.des_item || '',
            existencia: 0, 
            precioAnterior: 0,
            precioActual: 0
        };
        mergedMap.set(code, entry);
    }

    const codLis = String(p.cod_lis || '').trim();
    const precio = Number(p.precioiva);

    if (!isNaN(precio)) {
      if (codLis === "05" || codLis === "5") {
        entry.precioActual = precio;
      } 
      else if (codLis === "22") {
        entry.precioAnterior = precio;
      }
    }
  }

  return Array.from(mergedMap.values());
}

async function invalidateWooTransients() {
  const pool = getMysqlPool();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.execute(`DELETE FROM \`${TABLE_PREFIX}options\` WHERE option_name LIKE '_transient_wc_%'`);
    await conn.execute(`DELETE FROM \`${TABLE_PREFIX}options\` WHERE option_name LIKE '_transient_timeout_wc_%'`);
    await conn.execute(`DELETE FROM \`${TABLE_PREFIX}options\` WHERE option_name LIKE '_transient_woocommerce_%'`);
    await conn.execute(`DELETE FROM \`${TABLE_PREFIX}options\` WHERE option_name LIKE '_transient_timeout_woocommerce_%'`);
    await conn.commit();
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

async function runSyncEngine() {
  loadDotEnv(); // Asegurar carga de variables
  const startTime = Date.now();
  const startedAt = new Date(startTime).toISOString();
  
  let db;
  let executionId = null;

  try {
    // Inicializar MySQL
    initMysqlConfig();
    
    // Verificar conexión a BD antes de empezar
    await checkDbConnection();

    await ensureIndexes();
    
    // SQLite History
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

    const r = await db.run(
      `INSERT INTO cron_executions (start_time, status) VALUES (?, 'running')`,
      startedAt
    );
    executionId = r?.lastID || null;

    // Login y Fetch
    let token = await loginNovasoft();
    let products, prices;
    
    try {
      [products, prices] = await Promise.all([getProducts(token), getPrices(token)]);
    } catch (err) {
      if (err.message && err.message.includes('401')) {
        console.warn('Token Novasoft expirado (401), reintentando con nuevo login...');
        token = await loginNovasoft(true);
        [products, prices] = await Promise.all([getProducts(token), getPrices(token)]);
      } else {
        throw err;
      }
    }

    const merged = mergeProductsWithPrices(products, prices);
    
    // Sync
    const syncResult = await syncAllProductsOptimized(merged);

    // Finalizar
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

    await invalidateWooTransients();

    return {
      success: true,
      summary: syncResult.summary,
      duration: durationMs
    };

  } catch (err) {
    console.error('Error en SyncEngine:', err);
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
    throw err;
  }
}

// Exportamos también las funciones individuales para poder recomponer la lógica si es necesario (ej. fallback a API)
module.exports = {
  runSyncEngine,
  invalidateWooTransients,
  loadDotEnv,
  loginNovasoft,
  getProducts,
  getPrices,
  mergeProductsWithPrices,
  checkDbConnection,
  initMysqlConfig
};
