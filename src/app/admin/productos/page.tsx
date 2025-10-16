"use client";

import { useEffect, useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RefreshCw, AlertCircle, Search, ChevronUp, ChevronDown, RotateCw, Plus } from "lucide-react";
import { apiService, Product, SyncResult } from "@/lib/api";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type SyncCacheEntry = {
  timestamp: number;
  existencia?: number;
  precio?: number;
  result: SyncResult;
};

export default function ProductosPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [filteredProducts, setFilteredProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [sortConfig, setSortConfig] = useState<{
    key: keyof Product | null;
    direction: 'asc' | 'desc';
  }>({
    key: null,
    direction: 'asc'
  });

  // Estados para verificación de existencia en WooCommerce
  const [verifyingProducts, setVerifyingProducts] = useState<Set<string>>(new Set());
  const [productExistence, setProductExistence] = useState<Map<string, boolean>>(new Map());
  // Estados para verificación de sincronización precio/stock
  const [productSyncStatus, setProductSyncStatus] = useState<Map<string, { exists: boolean; priceMatches: boolean; stockMatches: boolean; sincronizado: boolean }>>(new Map());
  
  // Estados para progreso de verificación en tiempo real
  const [verificationProgress, setVerificationProgress] = useState<{
    isActive: boolean;
    totalProducts: number;
    processedProducts: number;
    currentBatch: number;
    totalBatches: number;
    startTime: number;
    estimatedTimeRemaining: number;
    productsPerSecond: number;
  }>({
    isActive: false,
    totalProducts: 0,
    processedProducts: 0,
    currentBatch: 0,
    totalBatches: 0,
    startTime: 0,
    estimatedTimeRemaining: 0,
    productsPerSecond: 0
  });

  // Estados para el modal de sincronización
  const [syncModalOpen, setSyncModalOpen] = useState(false);
  const [syncingProduct, setSyncingProduct] = useState<Product | null>(null);
  const [syncStatus, setSyncStatus] = useState<'syncing' | 'success' | 'error'>('syncing');
  const [syncMessage, setSyncMessage] = useState('');
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);

  // Estados para creación de producto
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [creatingProduct, setCreatingProduct] = useState<Product | null>(null);
  const [createStatus, setCreateStatus] = useState<'creating' | 'success' | 'error'>('creating');
  const [createMessage, setCreateMessage] = useState('');
  const [createResult, setCreateResult] = useState<SyncResult | null>(null);

  // Estados para creación masiva
  const [bulkCreateModalOpen, setBulkCreateModalOpen] = useState(false);
  const [bulkCreateStatus, setBulkCreateStatus] = useState<'creating' | 'success' | 'error' | 'partial'>('creating');
  const [bulkCreateMessage, setBulkCreateMessage] = useState('');
  const [bulkCreateProgress, setBulkCreateProgress] = useState({ current: 0, total: 0 });
  const [bulkCreateResults, setBulkCreateResults] = useState<{ success: number; errors: number; details: Array<{product: string; success: boolean; message: string}> }>({ success: 0, errors: 0, details: [] });

  // Estados para sincronización masiva
  const [bulkSyncModalOpen, setBulkSyncModalOpen] = useState(false);
  const [bulkSyncStatus, setBulkSyncStatus] = useState<'syncing' | 'success' | 'error' | 'partial'>('success');
  const [bulkSyncMessage, setBulkSyncMessage] = useState('');
  const [bulkSyncProgress, setBulkSyncProgress] = useState({ current: 0, total: 0 });
  const [bulkSyncResults, setBulkSyncResults] = useState<{ success: number; errors: number; details: Array<{product: string; success: boolean; message: string}> }>({ success: 0, errors: 0, details: [] });

  // Estados para optimizaciones avanzadas
  const [syncCache, setSyncCache] = useState<Map<string, SyncCacheEntry>>(new Map());
  const [batchPerformance, setBatchPerformance] = useState<{
    currentBatchSize: number;
    successRate: number;
    avgResponseTime: number;
    errorCount: number;
  }>({
    currentBatchSize: 100,
    successRate: 100,
    avgResponseTime: 0,
    errorCount: 0
  });

  // Estados para métricas en tiempo real
  const [realTimeMetrics, setRealTimeMetrics] = useState<{
    startTime: number;
    elapsedTime: number;
    estimatedTimeRemaining: number;
    currentSpeed: number; // productos por minuto
    totalBatches: number;
    completedBatches: number;
  }>({
    startTime: 0,
    elapsedTime: 0,
    estimatedTimeRemaining: 0,
    currentSpeed: 0,
    totalBatches: 0,
    completedBatches: 0
  });

  const fetchProducts = async () => {
    setLoading(true);
    setError(null);

    try {
      console.log('Iniciando fetch de productos y precios...');
      
      // Obtener productos y precios en paralelo
      const [productsResponse, pricesResponse] = await Promise.all([
        apiService.getProducts(),
        apiService.getPrices()
      ]);
      
      console.log('Respuesta de productos:', productsResponse);
      console.log('Respuesta de precios:', pricesResponse);
      
      if (productsResponse.success && productsResponse.data) {
        let mergedProducts = productsResponse.data;
        
        // Si también obtuvimos precios exitosamente, combinar los datos
        if (pricesResponse.success && pricesResponse.data) {
          console.log('Combinando datos de productos con precios...');
          console.log('Datos de precios recibidos:', pricesResponse.data);
          console.log('Primer producto:', productsResponse.data[0]);
          
          // Crear un mapa de precios por código para búsqueda rápida
          const pricesMap = new Map();
          pricesResponse.data.forEach(price => {
            console.log('Agregando precio al mapa:', price.codigo, price);
            // Usar trim para limpiar espacios en blanco
            pricesMap.set(price.codigo.trim(), price);
          });
          
          console.log('Mapa de precios creado:', pricesMap);
          
          // Combinar productos con precios
          mergedProducts = productsResponse.data.map(product => {
            const productCode = product.cod_item?.trim();
            console.log('Buscando precio para producto:', productCode);
            const priceData = pricesMap.get(productCode);
            console.log('Precio encontrado:', priceData);
            if (priceData) {
              const merged = {
                ...product,
                precioAnterior: priceData.precioAnterior,
                precioActual: priceData.precioActual,
                // Mantener existencia del producto original, pero mostrar la de precios si está disponible
                existencia: priceData.existencia || product.existencia
              };
              console.log('Producto combinado:', merged);
              return merged;
            }
            return product;
          });
          
          console.log('Productos combinados finales:', mergedProducts);
        } else {
          console.warn('No se pudieron obtener precios:', pricesResponse.error);
        }
        
        setProducts(mergedProducts);
        setFilteredProducts(mergedProducts);
      } else {
        console.error('Error en la respuesta de productos:', productsResponse.error);
        setError(productsResponse.error || "Error al cargar productos");
      }
    } catch (err) {
      console.error('Error en catch:', err);
      setError("Error de conexión con el servidor");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, []);

  // Efecto para verificar automáticamente la existencia de productos después de cargarlos
  useEffect(() => {
    if (products.length > 0 && !loading) {
      // Solo verificar si hay productos con código y no se están verificando actualmente
      const productsWithCode = products.filter(p => p.cod_item && p.cod_item.trim() !== '');
      if (productsWithCode.length > 0 && verifyingProducts.size === 0) {
        verifyAllProducts();
      }
    }
  }, [products, loading]); // Se ejecuta cuando cambian los productos o el estado de carga

  // Efecto para filtrar y ordenar productos en tiempo real
  useEffect(() => {
    let filtered = products;

    // Filtro por término de búsqueda
    if (searchTerm.trim()) {
      filtered = filtered.filter(product => 
        product.cod_item?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        product.des_item?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        product.empresa?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        product.estado?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Ordenamiento
    if (sortConfig.key) {
      filtered.sort((a, b) => {
        const aValue = a[sortConfig.key!];
        const bValue = b[sortConfig.key!];
        
        // Manejar valores nulos/undefined
        if (aValue == null && bValue == null) return 0;
        if (aValue == null) return sortConfig.direction === 'asc' ? 1 : -1;
        if (bValue == null) return sortConfig.direction === 'asc' ? -1 : 1;
        
        // Comparación para números
        if (typeof aValue === 'number' && typeof bValue === 'number') {
          return sortConfig.direction === 'asc' ? aValue - bValue : bValue - aValue;
        }
        
        // Comparación para strings
        const aStr = String(aValue).toLowerCase();
        const bStr = String(bValue).toLowerCase();
        
        if (aStr < bStr) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aStr > bStr) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }

    setFilteredProducts(filtered);
  }, [searchTerm, products, sortConfig]);

  const handleSort = (key: keyof Product) => {
    setSortConfig(prevConfig => ({
      key,
      direction: prevConfig.key === key && prevConfig.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const getSortIcon = (columnKey: keyof Product) => {
    if (sortConfig.key !== columnKey) {
      return <ChevronUp className="h-4 w-4 text-gray-400" />;
    }
    return sortConfig.direction === 'asc' 
      ? <ChevronUp className="h-4 w-4 text-gray-600" />
      : <ChevronDown className="h-4 w-4 text-gray-600" />;
  };

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0,
    }).format(price);
  };

  const getEstadoBadge = (estado: string | undefined, product: Product) => {
    // Si tenemos información de existencia en WooCommerce, usarla
    if (product.cod_item) {
      const sku = product.cod_item.trim();
      if (sku && productExistence.has(sku)) {
        const exists = productExistence.get(sku);
        const isVerifying = verifyingProducts.has(sku);
        
        if (isVerifying) {
          return (
            <span className="px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 flex items-center gap-1">
              <RefreshCw className="h-3 w-3 animate-spin" />
              Verificando...
            </span>
          );
        }
        
        return (
          <span className={`px-2 py-1 rounded-full text-xs font-medium ${
            exists 
              ? 'bg-green-100 text-green-800' 
              : 'bg-red-100 text-red-800'
          }`}>
            {exists ? 'Existe' : 'No existe'}
          </span>
        );
      }
    }

    // Fallback al estado original si no hay información de WooCommerce
    const colors = {
      'sincronizado': 'bg-green-100 text-green-800',
      'no_sincronizado': 'bg-red-100 text-red-800',
      'pendiente': 'bg-yellow-100 text-yellow-800',
    };
    
    // Manejar casos donde estado es undefined, null o no es string
    const estadoSeguro = estado && typeof estado === 'string' ? estado : 'desconocido';
    
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${colors[estadoSeguro as keyof typeof colors] || 'bg-gray-100 text-gray-800'}`}>
        {estadoSeguro.replace('_', ' ')}
      </span>
    );
  };

  const getSincronizadoBadge = (product: Product) => {
    const sku = product.cod_item?.trim();
    if (!sku) {
      return (
        <span className="px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800">N/A</span>
      );
    }

    const isVerifying = verifyingProducts.has(sku);
    if (isVerifying) {
      return (
        <span className="px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 flex items-center gap-1">
          <RefreshCw className="h-3 w-3 animate-spin" />
          Verificando...
        </span>
      );
    }

    const status = productSyncStatus.get(sku);
    if (!status) {
      return (
        <span className="px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800">Desconocido</span>
      );
    }

    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
        status.sincronizado ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
      }`}>
        {status.sincronizado ? 'Si' : 'No'}
      </span>
    );
  };

  // Función para creación masiva de productos
  const handleBulkCreate = async () => {
    // Filtrar productos que NO existen en WooCommerce usando la misma lógica que el badge
    const nonExistentProducts = filteredProducts.filter(p => {
      if (p.cod_item) {
        const sku = p.cod_item.trim();
        if (sku && productExistence.has(sku)) {
          return !productExistence.get(sku); // No existe en WooCommerce
        }
      }
      return false;
    });
    
    if (nonExistentProducts.length === 0) {
      setBulkCreateModalOpen(true);
      setBulkCreateStatus('success');
      setBulkCreateMessage('No hay productos con estado "No existe" para crear.');
      setBulkCreateProgress({ current: 0, total: 0 });
      setBulkCreateResults({ success: 0, errors: 0, details: [] });
      return;
    }

    setBulkCreateModalOpen(true);
    setBulkCreateStatus('creating');
    setBulkCreateMessage(`Iniciando creación masiva de ${nonExistentProducts.length} productos como borradores...`);
    setBulkCreateProgress({ current: 0, total: nonExistentProducts.length });
    setBulkCreateResults({ success: 0, errors: 0, details: [] });

    try {
      const result = await apiService.createAllNonExistentProducts(
        nonExistentProducts,
        (progress) => {
          // Actualizar progreso en tiempo real
          setBulkCreateProgress({ 
            current: progress.current, 
            total: progress.total 
          });
          
          setBulkCreateMessage(
            `Procesando producto ${progress.current} de ${progress.total} (${progress.percentage}%): ${progress.currentProduct?.des_item || progress.currentProduct?.cod_item || 'Producto'}`
          );

          // Actualizar resultados acumulados
          if (progress.lastResult) {
            setBulkCreateResults(prev => {
              const newDetails = [...prev.details];
              newDetails.push({
                product: progress.currentProduct?.cod_item || 'Sin código',
                success: progress.lastResult!.success,
                message: progress.lastResult!.message
              });
              
              return {
                success: newDetails.filter(d => d.success).length,
                errors: newDetails.filter(d => !d.success).length,
                details: newDetails
              };
            });
          }
        }
      );

      // Determinar estado final
      if (result.summary.failed === 0) {
        setBulkCreateStatus('success');
        setBulkCreateMessage(`✅ Creación completada exitosamente. ${result.summary.successful} productos creados como borradores.`);
      } else if (result.summary.successful === 0) {
        setBulkCreateStatus('error');
        setBulkCreateMessage(`❌ Error en la creación. ${result.summary.failed} productos fallaron.`);
      } else {
        setBulkCreateStatus('partial');
        setBulkCreateMessage(`⚠️ Creación parcial completada. ${result.summary.successful} exitosos, ${result.summary.failed} errores.`);
      }

      // Actualizar el estado de existencia de productos después de la creación
      setTimeout(() => {
        verifyAllProducts();
      }, 1000);

    } catch (error) {
      setBulkCreateStatus('error');
      setBulkCreateMessage(`Error durante la creación masiva: ${error instanceof Error ? error.message : 'Error desconocido'}`);
    }
  };

  const closeBulkCreateModal = () => {
    setBulkCreateModalOpen(false);
    setBulkCreateStatus('creating');
    setBulkCreateMessage('');
    setBulkCreateProgress({ current: 0, total: 0 });
    setBulkCreateResults({ success: 0, errors: 0, details: [] });
  };

  // Función para verificar existencia y sincronización de un producto en WooCommerce
  const verifyProductExistence = async (product: Product) => {
    if (!product.cod_item) return;

    const sku = product.cod_item.trim();
    if (!sku) return;

    setVerifyingProducts(prev => new Set(prev).add(sku));

    try {
      const result = await apiService.verifySingleProductSync(product);
      setProductExistence(prev => new Map(prev).set(sku, result.exists));
      setProductSyncStatus(prev => new Map(prev).set(sku, result));
    } catch (error) {
      console.error('Error verificando producto:', error);
      setProductExistence(prev => new Map(prev).set(sku, false));
      setProductSyncStatus(prev => new Map(prev).set(sku, { exists: false, priceMatches: false, stockMatches: false, sincronizado: false }));
    } finally {
      setVerifyingProducts(prev => {
        const newSet = new Set(prev);
        newSet.delete(sku);
        return newSet;
      });
    }
  };

  // Función para verificar todos los productos visibles (existencia + sincronización)
  const verifyAllProducts = async () => {
    const productsToVerify = filteredProducts.filter(p => p.cod_item && p.cod_item.trim() !== '');
    
    if (productsToVerify.length === 0) {
      console.warn('No hay productos con códigos válidos para verificar');
      return;
    }

    // Marcar todos los productos como "verificando" al inicio
    const skusToVerify = productsToVerify.map(p => p.cod_item?.trim()).filter(Boolean) as string[];
    setVerifyingProducts(prev => new Set([...prev, ...skusToVerify]));
    
    // Configuración para procesamiento en lotes optimizado
    const BATCH_SIZE = 25; // Procesar hasta 25 productos por lote
    const MAX_CONCURRENT_BATCHES = 4; // Máximo 4 lotes simultáneos
    
    // Dividir productos en lotes
    const batches: Product[][] = [];
    for (let i = 0; i < productsToVerify.length; i += BATCH_SIZE) {
      batches.push(productsToVerify.slice(i, i + BATCH_SIZE));
    }
    
    // Inicializar progreso
    const startTime = Date.now();
    setVerificationProgress({
      isActive: true,
      totalProducts: productsToVerify.length,
      processedProducts: 0,
      currentBatch: 0,
      totalBatches: batches.length,
      startTime,
      estimatedTimeRemaining: 0,
      productsPerSecond: 0
    });
    
    try {
      console.log(`Iniciando verificación optimizada de ${productsToVerify.length} productos en ${batches.length} lotes`);
      
      let totalProcessedProducts = 0;
      
      // Función para actualizar progreso
      const updateProgress = (batchIndex: number, batchSize: number) => {
        totalProcessedProducts += batchSize;
        const elapsed = (Date.now() - startTime) / 1000; // segundos
        const productsPerSecond = elapsed > 0 ? totalProcessedProducts / elapsed : 0;
        const remainingProducts = productsToVerify.length - totalProcessedProducts;
        const estimatedTimeRemaining = productsPerSecond > 0 ? remainingProducts / productsPerSecond : 0;
        
        setVerificationProgress(prev => ({
          ...prev,
          processedProducts: totalProcessedProducts,
          currentBatch: batchIndex + 1,
          productsPerSecond,
          estimatedTimeRemaining: estimatedTimeRemaining * 1000 // convertir a ms
        }));
      };
      
      // Función para procesar un lote usando la nueva API de verificación de sincronización
      const processBatch = async (batch: Product[], batchIndex: number): Promise<void> => {
        try {
          console.log(`Procesando lote ${batchIndex + 1}/${batches.length} con ${batch.length} productos`);
          
          // Usar la nueva función para verificación completa de sincronización
          const results = await apiService.verifyProductsSyncStatus(batch);
          
          // Actualizar estados de productos en este lote
          results.forEach((result, sku) => {
            setProductExistence(prev => new Map(prev).set(sku, result.exists));
            setProductSyncStatus(prev => new Map(prev).set(sku, result));
          });
          
          // Actualizar progreso
          updateProgress(batchIndex, batch.length);
          
          console.log(`Lote ${batchIndex + 1} completado: ${results.size} productos verificados`);
          
        } catch (error) {
          console.error(`Error en lote ${batchIndex + 1}:`, error);
          
          // Marcar productos del lote como no sincronizados en caso de error
          batch.forEach(product => {
            const sku = product.cod_item?.trim();
            if (sku) {
              setProductExistence(prev => new Map(prev).set(sku, false));
              setProductSyncStatus(prev => new Map(prev).set(sku, { exists: false, priceMatches: false, stockMatches: false, sincronizado: false }));
            }
          });
          
          // Actualizar progreso incluso en caso de error
          updateProgress(batchIndex, batch.length);
        }
      };
      
      // Procesar lotes con paralelismo controlado
      for (let i = 0; i < batches.length; i += MAX_CONCURRENT_BATCHES) {
        const currentBatches = batches.slice(i, i + MAX_CONCURRENT_BATCHES);
        const batchPromises = currentBatches.map((batch, index) => 
          processBatch(batch, i + index)
        );
        
        await Promise.all(batchPromises);
      }
      
      const endTime = Date.now();
      const duration = (endTime - startTime) / 1000;
      
      console.log(`Verificación completada en ${duration.toFixed(2)} segundos`);
      
    } catch (error) {
      console.error('Error en verificación masiva:', error);
    } finally {
      // Limpiar el estado de "verificando" para todos los productos
      setVerifyingProducts(prev => {
        const newSet = new Set(prev);
        skusToVerify.forEach(sku => newSet.delete(sku));
        return newSet;
      });
      
      // Finalizar progreso
      setVerificationProgress(prev => ({
        ...prev,
        isActive: false
      }));
    }
  };

  // Función para sincronizar producto con WooCommerce
  const handleSyncProduct = async (product: Product) => {
    setSyncingProduct(product);
    setSyncStatus('syncing');
    setSyncMessage('Iniciando sincronización...');
    setSyncModalOpen(true);

    try {
      setSyncMessage('Buscando producto en WooCommerce...');
      const result = await apiService.syncProductWithWooCommerce(product);
      setSyncResult(result);

      if (result.success) {
        setSyncStatus('success');
        setSyncMessage(result.message);
        
        // Auto-cerrar el modal después de 2 segundos en caso de éxito
        setTimeout(() => {
          setSyncModalOpen(false);
          resetSyncState();
        }, 2000);
      } else {
        setSyncStatus('error');
        setSyncMessage(result.error || result.message);
      }
    } catch (error) {
      setSyncStatus('error');
      setSyncMessage('Error de conexión durante la sincronización');
      console.error('Error en sincronización:', error);
    }
  };

  const resetSyncState = () => {
    setSyncingProduct(null);
    setSyncStatus('syncing');
    setSyncMessage('');
    setSyncResult(null);
  };

  const closeSyncModal = () => {
    setSyncModalOpen(false);
    resetSyncState();
  };

  // Crear producto en WooCommerce
  const handleCreateProduct = async (product: Product) => {
    setCreatingProduct(product);
    setCreateStatus('creating');
    setCreateMessage('Creando producto en WooCommerce...');
    setCreateModalOpen(true);

    try {
      const result = await apiService.createProductInWooCommerce(product);
      setCreateResult(result);

      if (result.success) {
        setCreateStatus('success');
        setCreateMessage(result.message);
        const sku = product.cod_item?.trim();
        if (sku) {
          setProductExistence(prev => new Map(prev).set(sku, true));
        }

        setTimeout(() => {
          setCreateModalOpen(false);
          resetCreateState();
        }, 2000);
      } else {
        setCreateStatus('error');
        setCreateMessage(result.error || result.message);
      }
    } catch (error) {
      setCreateStatus('error');
      setCreateMessage('Error de conexión durante la creación');
      console.error('Error creando producto:', error);
    }
  };

  const resetCreateState = () => {
    setCreatingProduct(null);
    setCreateStatus('creating');
    setCreateMessage('');
    setCreateResult(null);
  };

  const closeCreateModal = () => {
    setCreateModalOpen(false);
    resetCreateState();
  };

  // Función para determinar si un producto necesita sincronización
  const needsSync = (product: Product): boolean => {
    // Verificar si el producto tiene cambios significativos
    if (!product.cod_item) return false;
    
    // Verificar cache para evitar sincronizaciones innecesarias
    const cacheKey = `${product.cod_item}_${product.precioActual}_${product.existencia}`;
    const cachedData = syncCache.get(cacheKey);
    
    if (cachedData && Date.now() - cachedData.timestamp < 300000) { // Cache válido por 5 minutos
      return false;
    }
    
    // Filtros inteligentes: sincronizar solo si hay cambios reales
    return (
      product.precioActual !== product.precioAnterior || // Precio cambió
      product.existencia !== cachedData?.existencia || // Stock cambió
      !cachedData // No hay datos en cache
    );
  };

  // Función para ajustar dinámicamente el tamaño del lote
  const adjustBatchSize = (performance: typeof batchPerformance): number => {
    // Lógica fija: siempre regresar 100 para lotes constantes
    return 100;
  };

  // Función para reintentar productos fallidos
  const retryFailedProduct = async (product: Product, attempt: number = 1): Promise<{product: string; success: boolean; message: string}> => {
    const maxRetries = 3;
    const retryDelay = attempt * 1000; // Incrementar delay con cada intento
    
    try {
      if (attempt > 1) {
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      }
      
      const result = await apiService.syncProductWithWooCommerce(product);
      
      if (result.success) {
        // Actualizar cache con datos exitosos
        const cacheKey = `${product.cod_item}_${product.precioActual}_${product.existencia}`;
        setSyncCache(prev => new Map(prev.set(cacheKey, {
          timestamp: Date.now(),
          existencia: product.existencia,
          precio: product.precioActual,
          result: result
        })));
        
        return {
          product: product.cod_item || 'Sin código',
          success: true,
          message: `${result.message} (intento ${attempt})`
        };
      } else if (attempt < maxRetries) {
        return await retryFailedProduct(product, attempt + 1);
      } else {
        return {
          product: product.cod_item || 'Sin código',
          success: false,
          message: `${result.error || result.message} (falló después de ${maxRetries} intentos)`
        };
      }
    } catch (error) {
      if (attempt < maxRetries) {
        return await retryFailedProduct(product, attempt + 1);
      } else {
        return {
          product: product.cod_item || 'Sin código',
          success: false,
          message: `Error de conexión (falló después de ${maxRetries} intentos)`
        };
      }
    }
  };

  // Función para sincronización masiva optimizada con todas las mejoras
  const handleBulkSync = async () => {
    // Filtrar productos que realmente necesitan sincronización
    const allProducts = filteredProducts.filter(p => p.cod_item);
    const productsToSync = allProducts.filter(needsSync);
    
    if (productsToSync.length === 0) {
      setBulkSyncModalOpen(true);
      setBulkSyncStatus('success');
      setBulkSyncMessage('Todos los productos están actualizados. No se requiere sincronización.');
      setBulkSyncProgress({ current: 0, total: 0 });
      setBulkSyncResults({ success: 0, errors: 0, details: [] });
      return;
    }

    // Inicializar métricas en tiempo real
    const startTime = Date.now();
    setRealTimeMetrics({
      startTime,
      elapsedTime: 0,
      estimatedTimeRemaining: 0,
      currentSpeed: 0,
      totalBatches: Math.ceil(productsToSync.length / 100),
      completedBatches: 0
    });

    setBulkSyncModalOpen(true);
    setBulkSyncStatus('syncing');
    setBulkSyncMessage('Iniciando sincronización masiva inteligente...');
    setBulkSyncProgress({ current: 0, total: productsToSync.length });
    setBulkSyncResults({ success: 0, errors: 0, details: [] });

    let successCount = 0;
    let errorCount = 0;
    let processedCount = 0;
    let totalResponseTime = 0;
    const details: Array<{product: string; success: boolean; message: string}> = [];
    const failedProducts: Product[] = [];

    // Configuración fija de lotes
    let currentBatchSize = 100;
    const BATCH_DELAY = 1000;

    setBulkSyncMessage(`Sincronización inteligente: ${productsToSync.length} de ${allProducts.length} productos requieren actualización`);

    // Dividir productos en lotes dinámicos
    let batchIndex = 0;
    let productIndex = 0;

    while (productIndex < productsToSync.length) {
      const batch = productsToSync.slice(productIndex, productIndex + currentBatchSize);
      const batchNumber = batchIndex + 1;
      const batchStartTime = Date.now();
      
      setBulkSyncMessage(`Procesando lote ${batchNumber} con ${batch.length} productos (lote fijo: ${currentBatchSize})...`);

      // Procesar lote con concurrencia limitada (máximo 10 procesos simultáneos)
      const CONCURRENCY_LIMIT = 10;
      const batchResults: Array<{ product: string; success: boolean; message: string; responseTime: number; productData: Product }> = [];
      let nextIndex = 0;

      const worker = async () => {
        while (true) {
          const idx = nextIndex++;
          if (idx >= batch.length) break;
          const product = batch[idx];
          const startTime = Date.now();
          try {
            const result = await apiService.syncProductWithWooCommerce(product);
            const responseTime = Date.now() - startTime;
            totalResponseTime += responseTime;

            if (result.success) {
              const cacheKey = `${product.cod_item}_${product.precioActual}_${product.existencia}`;
              setSyncCache(prev => new Map(prev.set(cacheKey, {
                timestamp: Date.now(),
                existencia: product.existencia,
                precio: product.precioActual,
                result
              })));
            }

            batchResults.push({
              product: product.cod_item || 'Sin código',
              success: result.success,
              message: result.success ? result.message : (result.error || result.message),
              responseTime,
              productData: product
            });
          } catch (error) {
            const responseTime = Date.now() - startTime;
            totalResponseTime += responseTime;
            batchResults.push({
              product: product.cod_item || 'Sin código',
              success: false,
              message: 'Error de conexión durante la sincronización',
              responseTime,
              productData: product
            });
          }
        }
      };

      const workers = Array.from({ length: Math.min(CONCURRENCY_LIMIT, batch.length) }, () => worker());
      await Promise.all(workers);
      const batchEndTime = Date.now();
      const batchDuration = batchEndTime - batchStartTime;

      // Procesar resultados y actualizar métricas
      let batchSuccessCount = 0;
      let batchErrorCount = 0;

      batchResults.forEach(({ product, success, message, productData }) => {
        if (success) {
          successCount++;
          batchSuccessCount++;
        } else {
          errorCount++;
          batchErrorCount++;
          failedProducts.push(productData);
        }
        
        details.push({ product, success, message });
        processedCount++;
        
        setBulkSyncProgress({ current: processedCount, total: productsToSync.length });
        setBulkSyncResults({ success: successCount, errors: errorCount, details: [...details] });
      });

      // Actualizar métricas de rendimiento
      const avgResponseTime = totalResponseTime / processedCount;
      const successRate = (batchSuccessCount / batch.length) * 100;
      
      setBatchPerformance({
        currentBatchSize,
        successRate,
        avgResponseTime,
        errorCount: batchErrorCount
      });

      // Actualizar métricas en tiempo real
      const totalBatches = Math.ceil(productsToSync.length / 100);
      updateRealTimeMetrics(processedCount, productsToSync.length, batchIndex + 1, totalBatches);

      // Mantener lote fijo de 100
      currentBatchSize = 100;

      productIndex += batch.length;
      batchIndex++;

      // Pausa entre lotes
      if (productIndex < productsToSync.length) {
        setBulkSyncMessage(`Lote ${batchNumber} completado (${batchSuccessCount}/${batch.length} exitosos). Pausa de ${BATCH_DELAY/1000}s antes del siguiente lote...`);
        await new Promise(resolve => setTimeout(resolve, BATCH_DELAY));
      }
    }

    // Procesar reintentos para productos fallidos
    if (failedProducts.length > 0) {
      setBulkSyncMessage(`Reintentando ${failedProducts.length} productos fallidos...`);
      
      const retryPromises = failedProducts.map(product => retryFailedProduct(product));
      const retryResults = await Promise.all(retryPromises);
      
      // Actualizar resultados con reintentos
      retryResults.forEach(({ product, success, message }) => {
        // Encontrar y actualizar el resultado original
        const originalIndex = details.findIndex(d => d.product === product && !d.success);
        if (originalIndex !== -1) {
          if (success) {
            successCount++;
            errorCount--;
            details[originalIndex] = { product, success: true, message };
          } else {
            details[originalIndex] = { product, success: false, message };
          }
        }
      });
      
      setBulkSyncResults({ success: successCount, errors: errorCount, details: [...details] });
    }

    // Paso adicional: productos en WooCommerce que NO existen en Novasoft -> stock 0 y estado "draft"
    try {
      setBulkSyncMessage('Ajustando productos ausentes en Novasoft: stock 0 y estado borrador...');
      const adjustResult = await apiService.markMissingWooProductsAsDraft(allProducts);
      const summaryMsg = `Ajuste completado: ${adjustResult.updated}/${adjustResult.totalCandidates} productos marcados como borrador con stock 0${adjustResult.failed ? `, ${adjustResult.failed} errores` : ''}.`;
      details.push({ product: 'Ajuste de ausentes', success: adjustResult.failed === 0, message: summaryMsg });
      setBulkSyncResults({ success: successCount, errors: errorCount + adjustResult.failed, details: [...details] });
    } catch (error) {
      const errMsg = 'Error ajustando productos ausentes en Novasoft';
      details.push({ product: 'Ajuste de ausentes', success: false, message: errMsg });
      setBulkSyncResults({ success: successCount, errors: errorCount + 1, details: [...details] });
    }

    // Determinar estado final
    if (errorCount === 0) {
      setBulkSyncStatus('success');
      setBulkSyncMessage(`✅ Sincronización completada exitosamente. ${successCount} productos actualizados y ausentes ajustados.`);
    } else if (successCount === 0) {
      setBulkSyncStatus('error');
      setBulkSyncMessage(`❌ Error en la sincronización. ${errorCount} productos fallaron incluso con reintentos.`);
    } else {
      setBulkSyncStatus('partial');
      setBulkSyncMessage(`⚠️ Sincronización parcial completada. ${successCount} exitosos, ${errorCount} errores persistentes (incluye ajustes de ausentes).`);
    }
  };

  const closeBulkSyncModal = () => {
    setBulkSyncModalOpen(false);
    setBulkSyncStatus('syncing');
    setBulkSyncMessage('');
    setBulkSyncProgress({ current: 0, total: 0 });
    setBulkSyncResults({ success: 0, errors: 0, details: [] });
  };

  // Función para calcular métricas en tiempo real
  const updateRealTimeMetrics = (processedCount: number, totalCount: number, batchesCompleted: number, totalBatches: number) => {
    const now = Date.now();
    const elapsed = now - realTimeMetrics.startTime;
    
    // Validar que elapsed sea un valor razonable (no más de 1 hora)
    if (elapsed < 0 || elapsed > 3600000) {
      console.warn('Tiempo transcurrido inválido:', elapsed);
      return;
    }
    
    const elapsedSeconds = elapsed / 1000; // Convertir a segundos
    
    // Calcular velocidad actual (productos por segundo)
    const currentSpeed = elapsedSeconds > 0 ? processedCount / elapsedSeconds : 0;
    
    // Calcular tiempo restante estimado en segundos
    const remainingProducts = totalCount - processedCount;
    const estimatedTimeRemainingSeconds = currentSpeed > 0 ? remainingProducts / currentSpeed : 0;
    
    // Validar que el tiempo estimado sea razonable (no más de 2 horas)
    const maxEstimatedTime = 7200000; // 2 horas en milisegundos
    const estimatedTimeRemaining = Math.min(estimatedTimeRemainingSeconds * 1000, maxEstimatedTime);
    
    setRealTimeMetrics({
      startTime: realTimeMetrics.startTime,
      elapsedTime: elapsed,
      estimatedTimeRemaining,
      currentSpeed: currentSpeed * 60, // Convertir a productos por minuto para mostrar
      totalBatches,
      completedBatches: batchesCompleted
    });
  };

  // Función para formatear tiempo en formato legible
  const formatTime = (milliseconds: number): string => {
    // Validar entrada
    if (!milliseconds || milliseconds < 0 || !isFinite(milliseconds)) {
      return '0s';
    }
    
    // Si es menos de 1 segundo, mostrar 0s
    if (milliseconds < 1000) {
      return '0s';
    }
    
    // Si es menos de 1 minuto, mostrar solo segundos
    if (milliseconds < 60000) {
      const seconds = Math.round(milliseconds / 1000);
      return `${seconds}s`;
    } 
    
    // Si es más de 1 minuto, mostrar minutos y segundos
    const minutes = Math.floor(milliseconds / 60000);
    const seconds = Math.round((milliseconds % 60000) / 1000);
    
    if (seconds === 0) {
      return `${minutes}m`;
    }
    
    return `${minutes}m ${seconds}s`;
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Productos en Novasoft</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button 
            onClick={verifyAllProducts} 
            disabled={loading || filteredProducts.length === 0 || filteredProducts.filter(p => p.cod_item).length === 0 || verifyingProducts.size > 0}
            className="flex items-center gap-2 cursor-pointer hover:bg-green-600 bg-green-500 text-white disabled:opacity-50"
            title={verifyingProducts.size > 0 ? `Verificando ${verifyingProducts.size} productos...` : `Verificar existencia en WooCommerce (${filteredProducts.filter(p => p.cod_item).length} productos con código)`}
          >
            <Search className={`h-4 w-4 ${verifyingProducts.size > 0 ? 'animate-spin' : ''}`} />
            {verificationProgress.isActive ? (
              <span className="flex items-center gap-1">
                Verificando... 
                <span className="text-xs bg-green-600 px-1 rounded">
                  {verificationProgress.processedProducts}/{verificationProgress.totalProducts}
                </span>
              </span>
            ) : (
              'Verificar Estado'
            )}
          </Button>
          
          {/* Indicador de progreso detallado */}
          {verificationProgress.isActive && (
            <div className="flex items-center gap-2 text-sm text-gray-600 bg-gray-100 px-3 py-1 rounded-lg">
              <div className="flex items-center gap-1">
                <span className="font-medium">Lote:</span>
                <span>{verificationProgress.currentBatch}/{verificationProgress.totalBatches}</span>
              </div>
              <div className="w-px h-4 bg-gray-300"></div>
              <div className="flex items-center gap-1">
                <span className="font-medium">Velocidad:</span>
                <span>{verificationProgress.productsPerSecond.toFixed(1)} prod/s</span>
              </div>
              {verificationProgress.estimatedTimeRemaining > 0 && (
                <>
                  <div className="w-px h-4 bg-gray-300"></div>
                  <div className="flex items-center gap-1">
                    <span className="font-medium">Tiempo restante:</span>
                    <span>{Math.ceil(verificationProgress.estimatedTimeRemaining / 1000)}s</span>
                  </div>
                </>
              )}
            </div>
          )}
          
          <Button 
            onClick={handleBulkSync} 
            disabled={loading || filteredProducts.length === 0 || filteredProducts.filter(p => p.cod_item).length === 0}
            className="flex items-center gap-2 cursor-pointer hover:bg-blue-600 bg-blue-500 text-white"
            title={`Sincronizar todos los productos (${filteredProducts.filter(p => p.cod_item).length} productos con código)`}
          >
            <RotateCw className="h-4 w-4" />
            Sync todo
          </Button>
          <Button 
            onClick={handleBulkCreate} 
            disabled={loading || filteredProducts.filter(p => p.cod_item && !productExistence.get(p.cod_item)).length === 0}
            className="flex items-center gap-2 cursor-pointer hover:bg-green-600 bg-green-500 text-white"
            title={`Crear todos los productos que no existen (${filteredProducts.filter(p => p.cod_item && !productExistence.get(p.cod_item)).length} productos)`}
          >
            <Plus className="h-4 w-4" />
            Crear Todos
          </Button>
          <Button onClick={fetchProducts} disabled={loading} className="flex items-center gap-2 cursor-pointer hover:bg-gray-500">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Actualizar
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Lista de Productos</CardTitle>
          <CardDescription>
            {filteredProducts.length} de {products.length} productos
            {filteredProducts.length > 0 && (
              <span className="ml-2 text-orange-600 font-medium">
                • {filteredProducts.filter(p => {
                  if (p.cod_item) {
                    const sku = p.cod_item.trim();
                    if (sku && productExistence.has(sku)) {
                      return !productExistence.get(sku); // No existe en WooCommerce
                    }
                  }
                  return false;
                }).length} no existen en WooCommerce
              </span>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Buscador en tiempo real */}
          <div className="mb-4 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
            <Input
              type="text"
              placeholder="Buscar por código, descripción, empresa o estado..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 cursor-text"
            />
          </div>

          {error && (
            <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-md flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-red-600" />
              <span className="text-red-700">{error}</span>
            </div>
          )}
          
          <div className="rounded-md border">
            <Table>
              <TableHeader>
              <TableRow>
                <TableHead className="w-[50px]">#</TableHead>
                  <TableHead 
                    className="cursor-pointer hover:bg-gray-50 select-none"
                    onClick={() => handleSort('cod_item')}
                  >
                    <div className="flex items-center gap-1">
                      Código
                      {getSortIcon('cod_item')}
                    </div>
                  </TableHead>
                  <TableHead 
                    className="cursor-pointer hover:bg-gray-50 select-none"
                    onClick={() => handleSort('des_item')}
                  >
                    <div className="flex items-center gap-1">
                      Descripción
                      {getSortIcon('des_item')}
                    </div>
                  </TableHead>
                  <TableHead 
                    className="text-right cursor-pointer hover:bg-gray-50 select-none"
                    onClick={() => handleSort('existencia')}
                  >
                    <div className="flex items-center justify-end gap-1">
                      Stock
                      {getSortIcon('existencia')}
                    </div>
                  </TableHead>
                  <TableHead 
                    className="text-right cursor-pointer hover:bg-gray-50 select-none"
                    onClick={() => handleSort('precioAnterior')}
                  >
                    <div className="flex items-center justify-end gap-1">
                      Precio Anterior
                      {getSortIcon('precioAnterior')}
                    </div>
                  </TableHead>
                  <TableHead 
                    className="text-right cursor-pointer hover:bg-gray-50 select-none"
                    onClick={() => handleSort('precioActual')}
                  >
                    <div className="flex items-center justify-end gap-1">
                      Precio Actual
                      {getSortIcon('precioActual')}
                    </div>
                </TableHead>
                <TableHead 
                  className="cursor-pointer hover:bg-gray-50 select-none"
                  onClick={() => handleSort('estado')}
                >
                  <div className="flex items-center gap-1">
                    Estado
                    {getSortIcon('estado')}
                  </div>
                </TableHead>
                <TableHead>
                  Sincronizado
                </TableHead>
                <TableHead className="text-center">
                  Acciones
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow key="loading">
                  <TableCell colSpan={9} className="h-24 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      Cargando productos...
                    </div>
                  </TableCell>
                </TableRow>
              ) : filteredProducts.length === 0 ? (
                <TableRow key="empty">
                  <TableCell colSpan={9} className="h-24 text-center text-muted-foreground">
                    {searchTerm ? 'No se encontraron productos que coincidan con la búsqueda' : 'No hay productos disponibles'}
                  </TableCell>
                </TableRow>
              ) : (
                filteredProducts.map((product, index) => (
                  <TableRow key={product.cod_item || `product-${index}`}>
                    <TableCell className="font-medium">{index + 1}</TableCell>
                    <TableCell className="font-mono">{product.cod_item?.trim()}</TableCell>
                    <TableCell>{product.des_item?.trim() || 'Sin descripción'}</TableCell>
                    <TableCell className="text-right">{product.existencia || 0}</TableCell>
                    <TableCell className="text-right">
                      {product.precioAnterior ? formatPrice(product.precioAnterior) : 'N/A'}
                    </TableCell>
                    <TableCell className="text-right">
                      {product.precioActual ? formatPrice(product.precioActual) : 'N/A'}
                    </TableCell>
                    <TableCell>{getEstadoBadge(product.estado, product)}</TableCell>
                    <TableCell>{getSincronizadoBadge(product)}</TableCell>
                    <TableCell className="text-center">
                      <div className="flex items-center gap-1 justify-center">
                        <Button
                           variant="outline"
                           size="sm"
                           onClick={() => verifyProductExistence(product)}
                           disabled={!product.cod_item || !product.cod_item.trim() || verifyingProducts.has(product.cod_item.trim())}
                           className="flex items-center gap-1 hover:bg-green-50"
                           title={product.cod_item && product.cod_item.trim() ? 'Verificar estado y sincronización en WooCommerce' : 'Producto sin código SKU'}
                         >
                           {product.cod_item && verifyingProducts.has(product.cod_item.trim()) ? (
                             <RefreshCw className="h-3 w-3 animate-spin" />
                           ) : (
                             <Search className="h-3 w-3" />
                           )}
                           Verificar
                         </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleSyncProduct(product)}
                            disabled={!product.cod_item}
                            className="flex items-center gap-1 hover:bg-blue-50"
                            title={product.cod_item ? 'Sincronizar con WooCommerce' : 'Producto sin código SKU'}
                          >
                            <RotateCw className="h-3 w-3" />
                            Sync
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleCreateProduct(product)}
                            disabled={(() => {
                              const sku = product.cod_item?.trim();
                              if (!sku) return true;
                              if (!productExistence.has(sku)) return true;
                              return productExistence.get(sku) !== false;
                            })()}
                            className="flex items-center gap-1 hover:bg-purple-50"
                            title={product.cod_item ? 'Crear producto en WooCommerce' : 'Producto sin código SKU'}
                          >
                            <Plus className="h-3 w-3" />
                            Crear
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Modal de sincronización */}
      <Dialog open={syncModalOpen} onOpenChange={closeSyncModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {syncStatus === 'syncing' && <RotateCw className="h-4 w-4 animate-spin" />}
              {syncStatus === 'success' && <div className="h-4 w-4 bg-green-500 rounded-full flex items-center justify-center">
                <div className="h-2 w-2 bg-white rounded-full"></div>
              </div>}
              {syncStatus === 'error' && <AlertCircle className="h-4 w-4 text-red-500" />}
              Sincronización con WooCommerce
            </DialogTitle>
            <DialogDescription>
              {syncingProduct && (
                <div className="space-y-2">
                  <div><strong>Producto:</strong> {syncingProduct.cod_item}</div>
                  <div><strong>Descripción:</strong> {syncingProduct.des_item}</div>
                </div>
              )}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              {syncStatus === 'syncing' && <RefreshCw className="h-4 w-4 animate-spin" />}
              <span className={`text-sm ${
                syncStatus === 'success' ? 'text-green-600' : 
                syncStatus === 'error' ? 'text-red-600' : 
                'text-blue-600'
              }`}>
                {syncMessage}
              </span>
            </div>

            {syncResult && syncResult.success && syncResult.productData && (
              <div className="bg-green-50 p-3 rounded-md text-sm">
                <div className="font-medium text-green-800 mb-2">Datos actualizados:</div>
                <div className="space-y-1 text-green-700">
                  <div>• Stock: {syncResult.productData.stock_quantity} unidades</div>
                  {syncResult.productData.regular_price && (
                    <div>• Precio normal: ${parseFloat(syncResult.productData.regular_price).toLocaleString()}</div>
                  )}
                  {syncResult.productData.sale_price && (
                    <div>• Precio rebajado: ${parseFloat(syncResult.productData.sale_price).toLocaleString()}</div>
                  )}
                </div>
              </div>
            )}

            {syncStatus === 'error' && (
              <div className="bg-red-50 p-3 rounded-md">
                <div className="text-red-800 text-sm font-medium">Error en la sincronización</div>
                <div className="text-red-600 text-sm mt-1">{syncMessage}</div>
              </div>
            )}
          </div>

          {syncStatus !== 'syncing' && (
            <div className="flex justify-end">
              <Button onClick={closeSyncModal} variant="outline">
                Cerrar
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Modal de creación de producto */}
      <Dialog open={createModalOpen} onOpenChange={closeCreateModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {createStatus === 'creating' && <Plus className="h-4 w-4" />}
              {createStatus === 'success' && <div className="h-4 w-4 bg-green-500 rounded-full flex items-center justify-center">
                <div className="h-2 w-2 bg-white rounded-full"></div>
              </div>}
              {createStatus === 'error' && <AlertCircle className="h-4 w-4 text-red-500" />}
              Crear producto en WooCommerce
            </DialogTitle>
            <DialogDescription>
              {creatingProduct && (
                <div className="space-y-2">
                  <div><strong>Producto:</strong> {creatingProduct.cod_item}</div>
                  <div><strong>Descripción:</strong> {creatingProduct.des_item}</div>
                </div>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="flex items-center gap-2">
              {createStatus === 'creating' && <RefreshCw className="h-4 w-4 animate-spin" />}
              <span className={`text-sm ${
                createStatus === 'success' ? 'text-green-600' : 
                createStatus === 'error' ? 'text-red-600' : 
                'text-blue-600'
              }`}>
                {createMessage}
              </span>
            </div>

            {createResult && createResult.success && createResult.productData && (
              <div className="bg-green-50 p-3 rounded-md text-sm">
                <div className="font-medium text-green-800 mb-2">Producto creado:</div>
                <div className="space-y-1 text-green-700">
                  <div>• ID: {createResult.productData.id}</div>
                  <div>• SKU: {createResult.productData.sku}</div>
                  <div>• Stock: {createResult.productData.stock_quantity} unidades</div>
                  {createResult.productData.regular_price && (
                    <div>• Precio normal: ${parseFloat(createResult.productData.regular_price).toLocaleString()}</div>
                  )}
                  {createResult.productData.sale_price && (
                    <div>• Precio rebajado: ${parseFloat(createResult.productData.sale_price).toLocaleString()}</div>
                  )}
                </div>
              </div>
            )}

            {createStatus === 'error' && (
              <div className="bg-red-50 p-3 rounded-md">
                <div className="text-red-800 text-sm font-medium">Error en la creación</div>
                <div className="text-red-600 text-sm mt-1">{createMessage}</div>
              </div>
            )}
          </div>

          {createStatus !== 'creating' && (
            <div className="flex justify-end">
              <Button onClick={closeCreateModal} variant="outline">
                Cerrar
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

       {/* Modal de creación masiva */}
       <Dialog open={bulkCreateModalOpen} onOpenChange={closeBulkCreateModal}>
         <DialogContent className="sm:max-w-2xl">
           <DialogHeader>
             <DialogTitle className="flex items-center gap-2">
               {bulkCreateStatus === 'creating' && <Plus className="h-4 w-4 animate-spin" />}
               {bulkCreateStatus === 'success' && <div className="h-4 w-4 bg-green-500 rounded-full flex items-center justify-center">
                 <div className="h-2 w-2 bg-white rounded-full"></div>
               </div>}
               {bulkCreateStatus === 'partial' && <div className="h-4 w-4 bg-yellow-500 rounded-full flex items-center justify-center">
                 <div className="h-2 w-2 bg-white rounded-full"></div>
               </div>}
               {bulkCreateStatus === 'error' && <AlertCircle className="h-4 w-4 text-red-500" />}
               Creación Masiva de Productos
             </DialogTitle>
             <DialogDescription>
               Creando productos como borradores en WooCommerce
             </DialogDescription>
           </DialogHeader>
           
           <div className="space-y-4">
             {/* Progreso */}
             {bulkCreateProgress.total > 0 && (
               <div className="space-y-2">
                 <div className="flex justify-between text-sm">
                   <span>Progreso total</span>
                   <span>{bulkCreateProgress.current} de {bulkCreateProgress.total} productos</span>
                 </div>
                 <div className="w-full bg-gray-200 rounded-full h-3">
                   <div 
                     className="bg-green-600 h-3 rounded-full transition-all duration-300 flex items-center justify-end pr-2" 
                     style={{ width: `${(bulkCreateProgress.current / bulkCreateProgress.total) * 100}%` }}
                   >
                     <span className="text-xs text-white font-medium">
                       {Math.round((bulkCreateProgress.current / bulkCreateProgress.total) * 100)}%
                     </span>
                   </div>
                 </div>
               </div>
             )}

             {/* Mensaje de estado */}
             <div className="flex items-center gap-2">
               {bulkCreateStatus === 'creating' && <RefreshCw className="h-4 w-4 animate-spin" />}
               <span className={`text-sm ${
                 bulkCreateStatus === 'success' ? 'text-green-600' : 
                 bulkCreateStatus === 'error' ? 'text-red-600' : 
                 bulkCreateStatus === 'partial' ? 'text-yellow-600' :
                 'text-blue-600'
               }`}>
                 {bulkCreateMessage}
               </span>
             </div>

             {/* Resumen de resultados */}
             {bulkCreateStatus !== 'creating' && bulkCreateResults.success + bulkCreateResults.errors > 0 && (
               <div className="bg-gray-50 p-4 rounded-md">
                 <div className="font-medium text-gray-800 mb-3">Resumen de creación:</div>
                 <div className="grid grid-cols-3 gap-4 text-sm">
                   <div className="flex items-center gap-2">
                     <div className="h-3 w-3 bg-green-500 rounded-full"></div>
                     <span>Creados: {bulkCreateResults.success}</span>
                   </div>
                   <div className="flex items-center gap-2">
                     <div className="h-3 w-3 bg-red-500 rounded-full"></div>
                     <span>Errores: {bulkCreateResults.errors}</span>
                   </div>
                   <div className="flex items-center gap-2">
                     <div className="h-3 w-3 bg-blue-500 rounded-full"></div>
                     <span>Total: {bulkCreateResults.success + bulkCreateResults.errors}</span>
                   </div>
                 </div>
               </div>
             )}

             {/* Detalles de errores */}
             {bulkCreateStatus !== 'creating' && bulkCreateResults.details.length > 0 && bulkCreateResults.errors > 0 && (
               <div className="max-h-60 overflow-y-auto">
                 <div className="font-medium text-gray-800 mb-2">Detalles de errores ({bulkCreateResults.errors} productos):</div>
                 <div className="space-y-2">
                   {bulkCreateResults.details
                     .filter(detail => !detail.success)
                     .map((detail, index) => (
                       <div key={index} className="bg-red-50 p-2 rounded text-sm">
                         <div className="font-medium text-red-800">{detail.product}</div>
                         <div className="text-red-600">{detail.message}</div>
                       </div>
                     ))}
                 </div>
               </div>
             )}

             {/* Detalles de éxitos */}
             {bulkCreateStatus !== 'creating' && bulkCreateResults.details.length > 0 && bulkCreateResults.success > 0 && (
               <div className="max-h-40 overflow-y-auto">
                 <div className="font-medium text-gray-800 mb-2">Productos creados exitosamente ({bulkCreateResults.success}):</div>
                 <div className="space-y-1">
                   {bulkCreateResults.details
                     .filter(detail => detail.success)
                     .map((detail, index) => (
                       <div key={index} className="bg-green-50 p-2 rounded text-sm">
                         <div className="font-medium text-green-800">{detail.product}</div>
                         <div className="text-green-600 text-xs">{detail.message}</div>
                       </div>
                     ))}
                 </div>
               </div>
             )}
           </div>

           {bulkCreateStatus !== 'creating' && (
             <div className="flex justify-end">
               <Button onClick={closeBulkCreateModal} variant="outline">
                 Cerrar
               </Button>
             </div>
           )}
         </DialogContent>
       </Dialog>

       {/* Modal de sincronización masiva */}
       <Dialog open={bulkSyncModalOpen} onOpenChange={closeBulkSyncModal}>
         <DialogContent className="sm:max-w-2xl">
           <DialogHeader>
             <DialogTitle className="flex items-center gap-2">
               {bulkSyncStatus === 'syncing' && <RotateCw className="h-4 w-4 animate-spin" />}
               {bulkSyncStatus === 'success' && <div className="h-4 w-4 bg-green-500 rounded-full flex items-center justify-center">
                 <div className="h-2 w-2 bg-white rounded-full"></div>
               </div>}
               {bulkSyncStatus === 'partial' && <div className="h-4 w-4 bg-yellow-500 rounded-full flex items-center justify-center">
                 <div className="h-2 w-2 bg-white rounded-full"></div>
               </div>}
               {bulkSyncStatus === 'error' && <AlertCircle className="h-4 w-4 text-red-500" />}
               Sincronización Masiva Optimizada
             </DialogTitle>
             <DialogDescription>
               Procesamiento en lotes paralelos para mayor velocidad
             </DialogDescription>
           </DialogHeader>
           
           <div className="space-y-4">
             {/* Métricas de tiempo en tiempo real */}
             {bulkSyncStatus === 'syncing' && bulkSyncProgress.total > 0 && (
               <div className="bg-green-50 p-3 rounded-md text-sm">
                 <div className="font-medium text-green-800 mb-1">Configuración optimizada:</div>
                 <div className="text-green-700 space-y-1">
                   <div>• Procesamiento en lotes de {batchPerformance.currentBatchSize} productos en paralelo</div>
                   <div>• Pausa de 1 segundo entre lotes para estabilidad</div>
                   {realTimeMetrics.elapsedTime > 0 && (
                     <>
                       <div className="flex justify-between">
                         <span>• Tiempo transcurrido:</span>
                         <span className="font-medium">{formatTime(realTimeMetrics.elapsedTime)}</span>
                       </div>
                       <div className="flex justify-between">
                         <span>• Tiempo estimado restante:</span>
                         <span className="font-medium">{formatTime(realTimeMetrics.estimatedTimeRemaining)}</span>
                       </div>
                       <div className="flex justify-between">
                         <span>• Lotes completados:</span>
                         <span className="font-medium">{realTimeMetrics.completedBatches} de {realTimeMetrics.totalBatches}</span>
                       </div>
                     </>
                   )}
                 </div>
               </div>
             )}

             {/* Progreso */}
             {bulkSyncProgress.total > 0 && (
               <div className="space-y-2">
                 <div className="flex justify-between text-sm">
                   <span>Progreso total</span>
                   <span>{bulkSyncProgress.current} de {bulkSyncProgress.total} productos</span>
                 </div>
                 <div className="w-full bg-gray-200 rounded-full h-3">
                   <div 
                     className="bg-blue-600 h-3 rounded-full transition-all duration-300 flex items-center justify-end pr-2" 
                     style={{ width: `${(bulkSyncProgress.current / bulkSyncProgress.total) * 100}%` }}
                   >
                     <span className="text-xs text-white font-medium">
                       {Math.round((bulkSyncProgress.current / bulkSyncProgress.total) * 100)}%
                     </span>
                   </div>
                 </div>
               </div>
             )}

             {/* Mensaje de estado */}
             <div className="flex items-center gap-2">
               {bulkSyncStatus === 'syncing' && <RefreshCw className="h-4 w-4 animate-spin" />}
               <span className={`text-sm ${
                 bulkSyncStatus === 'success' ? 'text-green-600' : 
                 bulkSyncStatus === 'error' ? 'text-red-600' : 
                 bulkSyncStatus === 'partial' ? 'text-yellow-600' :
                 'text-blue-600'
               }`}>
                 {bulkSyncMessage}
               </span>
             </div>

             {/* Resumen de resultados mejorado */}
             {bulkSyncStatus !== 'syncing' && bulkSyncResults.success + bulkSyncResults.errors > 0 && (
               <div className="bg-gray-50 p-4 rounded-md">
                 <div className="font-medium text-gray-800 mb-3">Resumen de sincronización optimizada:</div>
                 <div className="grid grid-cols-3 gap-4 text-sm">
                   <div className="flex items-center gap-2">
                     <div className="h-3 w-3 bg-green-500 rounded-full"></div>
                     <span>Exitosos: {bulkSyncResults.success}</span>
                   </div>
                   <div className="flex items-center gap-2">
                     <div className="h-3 w-3 bg-red-500 rounded-full"></div>
                     <span>Errores: {bulkSyncResults.errors}</span>
                   </div>
                   <div className="flex items-center gap-2">
                     <div className="h-3 w-3 bg-blue-500 rounded-full"></div>
                     <span>Total: {bulkSyncResults.success + bulkSyncResults.errors}</span>
                   </div>
                 </div>
                 
                 {/* Estadísticas de rendimiento */}
                 <div className="mt-3 pt-3 border-t border-gray-200">
                   <div className="text-xs text-gray-600 space-y-1">
                     <div>⚡ Procesamiento completado en {formatTime(realTimeMetrics.elapsedTime)}</div>
                     <div>📊 Velocidad promedio: {realTimeMetrics.currentSpeed.toFixed(1)} productos/minuto</div>
                     <div>🔄 Lotes procesados: {realTimeMetrics.completedBatches} con tamaño dinámico</div>
                   </div>
                 </div>
               </div>
             )}

             {/* Detalles de errores */}
             {bulkSyncStatus !== 'syncing' && bulkSyncResults.details.length > 0 && bulkSyncResults.errors > 0 && (
               <div className="max-h-60 overflow-y-auto">
                 <div className="font-medium text-gray-800 mb-2">Detalles de errores ({bulkSyncResults.errors} productos):</div>
                 <div className="space-y-2">
                   {bulkSyncResults.details
                     .filter(detail => !detail.success)
                     .map((detail, index) => (
                       <div key={index} className="bg-red-50 p-2 rounded text-sm">
                         <div className="font-medium text-red-800">{detail.product}</div>
                         <div className="text-red-600">{detail.message}</div>
                       </div>
                     ))}
                 </div>
               </div>
             )}
           </div>

           {bulkSyncStatus !== 'syncing' && (
             <div className="flex justify-end">
               <Button onClick={closeBulkSyncModal} variant="outline">
                 Cerrar
               </Button>
             </div>
           )}
         </DialogContent>
       </Dialog>
     </div>
   );
 }