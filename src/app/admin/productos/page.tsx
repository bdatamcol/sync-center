"use client"

import { useEffect, useState } from "react"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { RefreshCw, AlertCircle, Search, ChevronUp, ChevronDown, RotateCw, Plus } from "lucide-react"
import { apiService, type Product, type SyncResult, type IndividualSyncResult } from "@/lib/api"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"

type SyncCacheEntry = {
  timestamp: number
  existencia?: number
  precio?: number
  result: IndividualSyncResult
}

export default function ProductosPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [filteredProducts, setFilteredProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [diagnostics, setDiagnostics] = useState<{ ok: boolean; results: Array<{ name: string; ok: boolean; status?: number; message?: string }> } | null>(null)
  const [diagnosing, setDiagnosing] = useState(false)
  const [searchTerm, setSearchTerm] = useState("")
  const [sortConfig, setSortConfig] = useState<{
    key: keyof Product | null
    direction: "asc" | "desc"
  }>({
    key: null,
    direction: "asc",
  })

  const [verifyingProducts, setVerifyingProducts] = useState<Set<string>>(new Set())
  const [productExistence, setProductExistence] = useState<Map<string, boolean>>(new Map())
  const [productSyncStatus, setProductSyncStatus] = useState<
    Map<string, { exists: boolean; priceMatches: boolean; stockMatches: boolean; sincronizado: boolean }>
  >(new Map())

  const [verificationProgress, setVerificationProgress] = useState<{
    isActive: boolean
    totalProducts: number
    processedProducts: number
    currentBatch: number
    totalBatches: number
    startTime: number
    estimatedTimeRemaining: number
    productsPerSecond: number
  }>({
    isActive: false,
    totalProducts: 0,
    processedProducts: 0,
    currentBatch: 0,
    totalBatches: 0,
    startTime: 0,
    estimatedTimeRemaining: 0,
    productsPerSecond: 0,
  })

  const [syncModalOpen, setSyncModalOpen] = useState(false)
  const [syncingProduct, setSyncingProduct] = useState<Product | null>(null)
  const [syncStatus, setSyncStatus] = useState<"syncing" | "success" | "error">("syncing")
  const [syncMessage, setSyncMessage] = useState("")
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null)

  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [creatingProduct, setCreatingProduct] = useState<Product | null>(null)
  const [createStatus, setCreateStatus] = useState<"creating" | "success" | "error">("creating")
  const [createMessage, setCreateMessage] = useState("")
  const [createResult, setCreateResult] = useState<SyncResult | null>(null)

  const [bulkCreateModalOpen, setBulkCreateModalOpen] = useState(false)
  const [bulkCreateStatus, setBulkCreateStatus] = useState<"creating" | "success" | "error" | "partial">("creating")
  const [bulkCreateMessage, setBulkCreateMessage] = useState("")
  const [bulkCreateProgress, setBulkCreateProgress] = useState({ current: 0, total: 0 })
  const [bulkCreateResults, setBulkCreateResults] = useState<{
    success: number
    errors: number
    details: Array<{ product: string; success: boolean; message: string }>
  }>({ success: 0, errors: 0, details: [] })

  const [bulkSyncModalOpen, setBulkSyncModalOpen] = useState(false)
  const [bulkSyncStatus, setBulkSyncStatus] = useState<"syncing" | "success" | "error" | "partial">("success")
  const [bulkSyncMessage, setBulkSyncMessage] = useState("")
  const [bulkSyncProgress, setBulkSyncProgress] = useState({ current: 0, total: 0 })
  const [bulkSyncResults, setBulkSyncResults] = useState<{
    success: number
    errors: number
    details: Array<{ product: string; success: boolean; message: string }>
  }>({ success: 0, errors: 0, details: [] })

  const [syncCache, setSyncCache] = useState<Map<string, SyncCacheEntry>>(new Map())
  const [batchPerformance, setBatchPerformance] = useState<{
    currentBatchSize: number
    successRate: number
    avgResponseTime: number
    errorCount: number
  }>({
    currentBatchSize: 100,
    successRate: 100,
    avgResponseTime: 0,
    errorCount: 0,
  })

  const [realTimeMetrics, setRealTimeMetrics] = useState<{
    startTime: number
    elapsedTime: number
    estimatedTimeRemaining: number
    currentSpeed: number
    totalBatches: number
    completedBatches: number
  }>({
    startTime: 0,
    elapsedTime: 0,
    estimatedTimeRemaining: 0,
    currentSpeed: 0,
    totalBatches: 0,
    completedBatches: 0,
  })

  const fetchProducts = async () => {
    setLoading(true)
    setError(null)

    try {
      console.log("Iniciando fetch de productos y precios...")

      const [productsResponse, pricesResponse] = await Promise.all([apiService.getProducts(), apiService.getPrices()])

      console.log("Respuesta de productos:", productsResponse)
      console.log("Respuesta de precios:", pricesResponse)

      if (productsResponse.success && productsResponse.data) {
        let mergedProducts = productsResponse.data

        if (pricesResponse.success && pricesResponse.data) {
          console.log("Combinando datos de productos con precios...")
          console.log("Datos de precios recibidos:", pricesResponse.data)
          console.log("Primer producto:", productsResponse.data[0])

          const pricesMap = new Map()
          pricesResponse.data.forEach((price) => {
            console.log("Agregando precio al mapa:", price.codigo, price)
            pricesMap.set(price.codigo.trim(), price)
          })

          console.log("Mapa de precios creado:", pricesMap)

          mergedProducts = productsResponse.data.map((product) => {
            const productCode = product.cod_item?.trim()
            console.log("Buscando precio para producto:", productCode)
            const priceData = pricesMap.get(productCode)
            console.log("Precio encontrado:", priceData)
            if (priceData) {
              const merged = {
                ...product,
                precioAnterior: priceData.precioAnterior,
                precioActual: priceData.precioActual,
                existencia: priceData.existencia || product.existencia,
              }
              console.log("Producto combinado:", merged)
              return merged
            }
            return product
          })

          console.log("Productos combinados finales:", mergedProducts)
        } else {
          console.warn("No se pudieron obtener precios:", pricesResponse.error)
        }

        setProducts(mergedProducts)
        setFilteredProducts(mergedProducts)
      } else {
        console.error("Error en la respuesta de productos:", productsResponse.error)
        setError(productsResponse.error || "Error al cargar productos")
      }
    } catch (err) {
      console.error("Error en catch:", err)
      setError("Error de conexión con el servidor")
    } finally {
      setLoading(false)
    }
  }

  const runDiagnostics = async () => {
    setDiagnosing(true)
    setDiagnostics(null)
    try {
      const res = await fetch('/api/diagnostics/novasoft')
      const data = await res.json()
      setDiagnostics(data)
    } catch (e) {
      setDiagnostics({ ok: false, results: [{ name: 'client.fetch', ok: false, message: e instanceof Error ? e.message : 'Error desconocido' }] })
    } finally {
      setDiagnosing(false)
    }
  }

  useEffect(() => {
    fetchProducts()
  }, [])

  useEffect(() => {
    if (products.length > 0 && !loading) {
      const productsWithCode = products.filter((p) => p.cod_item && p.cod_item.trim() !== "")
      if (productsWithCode.length > 0 && verifyingProducts.size === 0) {
        verifyAllProducts()
      }
    }
  }, [products, loading])

  useEffect(() => {
    let filtered = products

    if (searchTerm.trim()) {
      filtered = filtered.filter(
        (product) =>
          product.cod_item?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          product.des_item?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          product.empresa?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          product.estado?.toLowerCase().includes(searchTerm.toLowerCase()),
      )
    }

    if (sortConfig.key) {
      filtered.sort((a, b) => {
        const aValue = a[sortConfig.key!]
        const bValue = b[sortConfig.key!]

        if (aValue == null && bValue == null) return 0
        if (aValue == null) return sortConfig.direction === "asc" ? 1 : -1
        if (bValue == null) return sortConfig.direction === "asc" ? -1 : 1

        if (typeof aValue === "number" && typeof bValue === "number") {
          return sortConfig.direction === "asc" ? aValue - bValue : bValue - aValue
        }

        const aStr = String(aValue).toLowerCase()
        const bStr = String(bValue).toLowerCase()

        if (aStr < bStr) return sortConfig.direction === "asc" ? -1 : 1
        if (aStr > bStr) return sortConfig.direction === "asc" ? 1 : -1
        return 0
      })
    }

    setFilteredProducts(filtered)
  }, [searchTerm, products, sortConfig])

  const handleSort = (key: keyof Product) => {
    setSortConfig((prevConfig) => ({
      key,
      direction: prevConfig.key === key && prevConfig.direction === "asc" ? "desc" : "asc",
    }))
  }

  const getSortIcon = (columnKey: keyof Product) => {
    if (sortConfig.key !== columnKey) {
      return <ChevronUp className="h-4 w-4 text-muted-foreground" />
    }
    return sortConfig.direction === "asc" ? (
      <ChevronUp className="h-4 w-4 text-primary" />
    ) : (
      <ChevronDown className="h-4 w-4 text-primary" />
    )
  }

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat("es-CO", {
      style: "currency",
      currency: "COP",
      minimumFractionDigits: 0,
    }).format(price)
  }

  const getEstadoBadge = (estado: string | undefined, product: Product) => {
    if (product.cod_item) {
      const sku = product.cod_item.trim()
      if (sku && productExistence.has(sku)) {
        const exists = productExistence.get(sku)
        const isVerifying = verifyingProducts.has(sku)

        if (isVerifying) {
          return (
            <span className="px-3 py-1.5 rounded-full text-xs font-medium bg-primary/10 text-primary flex items-center gap-1.5 border border-primary/20">
              <RefreshCw className="h-3 w-3 animate-spin" />
              Verificando...
            </span>
          )
        }

        return (
          <span
            className={`px-3 py-1.5 rounded-full text-xs font-medium border ${
              exists ? "bg-green-50 text-green-700 border-green-200" : "bg-red-50 text-red-700 border-red-200"
            }`}
          >
            {exists ? "Existe" : "No existe"}
          </span>
        )
      }
    }

    const colors = {
      sincronizado: "bg-green-50 text-green-700 border-green-200",
      no_sincronizado: "bg-red-50 text-red-700 border-red-200",
      pendiente: "bg-yellow-50 text-yellow-700 border-yellow-200",
    }

    const estadoSeguro = estado && typeof estado === "string" ? estado : "desconocido"

    return (
      <span
        className={`px-3 py-1.5 rounded-full text-xs font-medium border ${colors[estadoSeguro as keyof typeof colors] || "bg-gray-50 text-gray-700 border-gray-200"}`}
      >
        {estadoSeguro.replace("_", " ")}
      </span>
    )
  }

  const getSincronizadoBadge = (product: Product) => {
    const sku = product.cod_item?.trim()
    if (!sku) {
      return (
        <span className="px-3 py-1.5 rounded-full text-xs font-medium bg-gray-50 text-gray-700 border border-gray-200">
          N/A
        </span>
      )
    }

    const isVerifying = verifyingProducts.has(sku)
    if (isVerifying) {
      return (
        <span className="px-3 py-1.5 rounded-full text-xs font-medium bg-primary/10 text-primary flex items-center gap-1.5 border border-primary/20">
          <RefreshCw className="h-3 w-3 animate-spin" />
          Verificando...
        </span>
      )
    }

    const status = productSyncStatus.get(sku)
    if (!status) {
      return (
        <span className="px-3 py-1.5 rounded-full text-xs font-medium bg-gray-50 text-gray-700 border border-gray-200">
          Desconocido
        </span>
      )
    }

    return (
      <span
        className={`px-3 py-1.5 rounded-full text-xs font-medium border ${
          status.sincronizado ? "bg-green-50 text-green-700 border-green-200" : "bg-red-50 text-red-700 border-red-200"
        }`}
      >
        {status.sincronizado ? "Si" : "No"}
      </span>
    )
  }

  const handleBulkCreate = async () => {
    const nonExistentProducts = filteredProducts.filter((p) => {
      if (p.cod_item) {
        const sku = p.cod_item.trim()
        if (sku && productExistence.has(sku)) {
          return !productExistence.get(sku)
        }
      }
      return false
    })

    if (nonExistentProducts.length === 0) {
      setBulkCreateModalOpen(true)
      setBulkCreateStatus("success")
      setBulkCreateMessage('No hay productos con estado "No existe" para crear.')
      setBulkCreateProgress({ current: 0, total: 0 })
      setBulkCreateResults({ success: 0, errors: 0, details: [] })
      return
    }

    setBulkCreateModalOpen(true)
    setBulkCreateStatus("creating")
    setBulkCreateMessage(`Iniciando creación masiva de ${nonExistentProducts.length} productos como borradores...`)
    setBulkCreateProgress({ current: 0, total: nonExistentProducts.length })
    setBulkCreateResults({ success: 0, errors: 0, details: [] })

    try {
      const result = await apiService.createAllNonExistentProducts(nonExistentProducts, (progress) => {
        setBulkCreateProgress({
          current: progress.current,
          total: progress.total,
        })

        setBulkCreateMessage(
          `Procesando producto ${progress.current} de ${progress.total} (${progress.percentage}%): ${progress.currentProduct?.des_item || progress.currentProduct?.cod_item || "Producto"}`,
        )

        if (progress.lastResult) {
          setBulkCreateResults((prev) => {
            const newDetails = [...prev.details]
            newDetails.push({
              product: progress.currentProduct?.cod_item || "Sin código",
              success: progress.lastResult!.success,
              message: progress.lastResult!.message,
            })

            return {
              success: newDetails.filter((d) => d.success).length,
              errors: newDetails.filter((d) => !d.success).length,
              details: newDetails,
            }
          })
        }
      })

      if (result.summary.failed === 0) {
        setBulkCreateStatus("success")
        setBulkCreateMessage(
          `✅ Creación completada exitosamente. ${result.summary.successful} productos creados como borradores.`,
        )
      } else if (result.summary.successful === 0) {
        setBulkCreateStatus("error")
        setBulkCreateMessage(`❌ Error en la creación. ${result.summary.failed} productos fallaron.`)
      } else {
        setBulkCreateStatus("partial")
        setBulkCreateMessage(
          `⚠️ Creación parcial completada. ${result.summary.successful} exitosos, ${result.summary.failed} errores.`,
        )
      }

      setTimeout(() => {
        verifyAllProducts()
      }, 1000)
    } catch (error) {
      setBulkCreateStatus("error")
      setBulkCreateMessage(
        `Error durante la creación masiva: ${error instanceof Error ? error.message : "Error desconocido"}`,
      )
    }
  }

  const closeBulkCreateModal = () => {
    setBulkCreateModalOpen(false)
    setBulkCreateStatus("creating")
    setBulkCreateMessage("")
    setBulkCreateProgress({ current: 0, total: 0 })
    setBulkCreateResults({ success: 0, errors: 0, details: [] })
  }

  const verifyProductExistence = async (product: Product) => {
    if (!product.cod_item) return

    const sku = product.cod_item.trim()
    if (!sku) return

    setVerifyingProducts((prev) => new Set(prev).add(sku))

    try {
      const result = await apiService.verifySingleProductSync(product)
      setProductExistence((prev) => new Map(prev).set(sku, result.exists))
      setProductSyncStatus((prev) => new Map(prev).set(sku, result))
    } catch (error) {
      console.error("Error verificando producto:", error)
      setProductExistence((prev) => new Map(prev).set(sku, false))
      setProductSyncStatus((prev) =>
        new Map(prev).set(sku, { exists: false, priceMatches: false, stockMatches: false, sincronizado: false }),
      )
    } finally {
      setVerifyingProducts((prev) => {
        const newSet = new Set(prev)
        newSet.delete(sku)
        return newSet
      })
    }
  }

  const verifyAllProducts = async () => {
    const productsToVerify = filteredProducts.filter((p) => p.cod_item && p.cod_item.trim() !== "")

    if (productsToVerify.length === 0) {
      console.warn("No hay productos con códigos válidos para verificar")
      return
    }

    const skusToVerify = productsToVerify.map((p) => p.cod_item?.trim()).filter(Boolean) as string[]
    setVerifyingProducts((prev) => new Set([...prev, ...skusToVerify]))

    const BATCH_SIZE = 25
    const MAX_CONCURRENT_BATCHES = 4

    const batches: Product[][] = []
    for (let i = 0; i < productsToVerify.length; i += BATCH_SIZE) {
      batches.push(productsToVerify.slice(i, i + BATCH_SIZE))
    }

    const startTime = Date.now()
    setVerificationProgress({
      isActive: true,
      totalProducts: productsToVerify.length,
      processedProducts: 0,
      currentBatch: 0,
      totalBatches: batches.length,
      startTime,
      estimatedTimeRemaining: 0,
      productsPerSecond: 0,
    })

    try {
      console.log(
        `Iniciando verificación optimizada de ${productsToVerify.length} productos en ${batches.length} lotes`,
      )

      let totalProcessedProducts = 0

      const updateProgress = (batchIndex: number, batchSize: number) => {
        totalProcessedProducts += batchSize
        const elapsed = (Date.now() - startTime) / 1000
        const productsPerSecond = elapsed > 0 ? totalProcessedProducts / elapsed : 0
        const remainingProducts = productsToVerify.length - totalProcessedProducts
        const estimatedTimeRemaining = productsPerSecond > 0 ? remainingProducts / productsPerSecond : 0

        setVerificationProgress((prev) => ({
          ...prev,
          processedProducts: totalProcessedProducts,
          currentBatch: batchIndex + 1,
          productsPerSecond,
          estimatedTimeRemaining: estimatedTimeRemaining * 1000,
        }))
      }

      const processBatch = async (batch: Product[], batchIndex: number): Promise<void> => {
        try {
          console.log(`Procesando lote ${batchIndex + 1}/${batches.length} con ${batch.length} productos`)

          const results = await apiService.verifyProductsSyncStatus(batch)

          results.forEach((result, sku) => {
            setProductExistence((prev) => new Map(prev).set(sku, result.exists))
            setProductSyncStatus((prev) => new Map(prev).set(sku, result))
          })

          updateProgress(batchIndex, batch.length)

          console.log(`Lote ${batchIndex + 1} completado: ${results.size} productos verificados`)
        } catch (error) {
          console.error(`Error en lote ${batchIndex + 1}:`, error)

          batch.forEach((product) => {
            const sku = product.cod_item?.trim()
            if (sku) {
              setProductExistence((prev) => new Map(prev).set(sku, false))
              setProductSyncStatus((prev) =>
                new Map(prev).set(sku, {
                  exists: false,
                  priceMatches: false,
                  stockMatches: false,
                  sincronizado: false,
                }),
              )
            }
          })

          updateProgress(batchIndex, batch.length)
        }
      }

      for (let i = 0; i < batches.length; i += MAX_CONCURRENT_BATCHES) {
        const currentBatches = batches.slice(i, i + MAX_CONCURRENT_BATCHES)
        const batchPromises = currentBatches.map((batch, index) => processBatch(batch, i + index))

        await Promise.all(batchPromises)
      }

      const endTime = Date.now()
      const duration = (endTime - startTime) / 1000

      console.log(`Verificación completada en ${duration.toFixed(2)} segundos`)
    } catch (error) {
      console.error("Error en verificación masiva:", error)
    } finally {
      setVerifyingProducts((prev) => {
        const newSet = new Set(prev)
        skusToVerify.forEach((sku) => newSet.delete(sku))
        return newSet
      })

      setVerificationProgress((prev) => ({
        ...prev,
        isActive: false,
      }))
    }
  }

  const handleSyncProduct = async (product: Product) => {
    setSyncingProduct(product)
    setSyncStatus("syncing")
    setSyncMessage("Iniciando sincronización...")
    setSyncModalOpen(true)

    try {
      setSyncMessage("Buscando producto en WooCommerce...")
      const result = await apiService.syncProductWithWooCommerce(product)
      setSyncResult(result)

      if (result.success) {
        setSyncStatus("success")
        setSyncMessage(result.message)

        setTimeout(() => {
          setSyncModalOpen(false)
          resetSyncState()
        }, 2000)
      } else {
        setSyncStatus("error")
        setSyncMessage(result.error || result.message)
      }
    } catch (error) {
      setSyncStatus("error")
      setSyncMessage("Error de conexión durante la sincronización")
      console.error("Error en sincronización:", error)
    }
  }

  const resetSyncState = () => {
    setSyncingProduct(null)
    setSyncStatus("syncing")
    setSyncMessage("")
    setSyncResult(null)
  }

  const closeSyncModal = () => {
    setSyncModalOpen(false)
    resetSyncState()
  }

  const handleCreateProduct = async (product: Product) => {
    setCreatingProduct(product)
    setCreateStatus("creating")
    setCreateMessage("Creando producto en WooCommerce...")
    setCreateModalOpen(true)

    try {
      const result = await apiService.createProductInWooCommerce(product)
      setCreateResult(result)

      if (result.success) {
        setCreateStatus("success")
        setCreateMessage(result.message)
        const sku = product.cod_item?.trim()
        if (sku) {
          setProductExistence((prev) => new Map(prev).set(sku, true))
        }

        setTimeout(() => {
          setCreateModalOpen(false)
          resetCreateState()
        }, 2000)
      } else {
        setCreateStatus("error")
        setCreateMessage(result.error || result.message)
      }
    } catch (error) {
      setCreateStatus("error")
      setCreateMessage("Error de conexión durante la creación")
      console.error("Error creando producto:", error)
    }
  }

  const resetCreateState = () => {
    setCreatingProduct(null)
    setCreateStatus("creating")
    setCreateMessage("")
    setCreateResult(null)
  }

  const closeCreateModal = () => {
    setCreateModalOpen(false)
    resetCreateState()
  }

  const needsSync = (product: Product): boolean => {
    if (!product.cod_item) return false

    const cacheKey = `${product.cod_item}_${product.precioActual}_${product.existencia}`
    const cachedData = syncCache.get(cacheKey)

    if (cachedData && Date.now() - cachedData.timestamp < 300000) {
      return false
    }

    return (
      product.precioActual !== product.precioAnterior || product.existencia !== cachedData?.existencia || !cachedData
    )
  }

  const adjustBatchSize = (performance: typeof batchPerformance): number => {
    return 100
  }

  const retryFailedProduct = async (
    product: Product,
    attempt = 1,
  ): Promise<{ product: string; success: boolean; message: string }> => {
    const maxRetries = 3
    const retryDelay = attempt * 1000

    try {
      if (attempt > 1) {
        await new Promise((resolve) => setTimeout(resolve, retryDelay))
      }

      const result = await apiService.syncProductWithWooCommerce(product)

      if (result.success) {
        const cacheKey = `${product.cod_item}_${product.precioActual}_${product.existencia}`
        setSyncCache(
          (prev) =>
            new Map(
              prev.set(cacheKey, {
                timestamp: Date.now(),
                existencia: product.existencia,
                precio: product.precioActual,
                result: {
                  success: result.success,
                  message: result.message,
                  productId: result.productData?.id || 0,
                  product: product.cod_item || "Sin código",
                },
              }),
            ),
        )

        return {
          product: product.cod_item || "Sin código",
          success: true,
          message: `${result.message} (intento ${attempt})`,
        }
      } else if (attempt < maxRetries) {
        return await retryFailedProduct(product, attempt + 1)
      } else {
        return {
          product: product.cod_item || "Sin código",
          success: false,
          message: `${result.error || result.message} (falló después de ${maxRetries} intentos)`,
        }
      }
    } catch (error) {
      if (attempt < maxRetries) {
        return await retryFailedProduct(product, attempt + 1)
      } else {
        return {
          product: product.cod_item || "Sin código",
          success: false,
          message: `Error de conexión (falló después de ${maxRetries} intentos)`,
        }
      }
    }
  }

  const handleBulkSync = async () => {
    const allProducts = filteredProducts.filter((p) => p.cod_item)
    const productsToSync = allProducts.filter(needsSync)

    if (productsToSync.length === 0) {
      setBulkSyncModalOpen(true)
      setBulkSyncStatus("success")
      setBulkSyncMessage("Todos los productos están actualizados. No se requiere sincronización.")
      setBulkSyncProgress({ current: 0, total: 0 })
      setBulkSyncResults({ success: 0, errors: 0, details: [] })
      return
    }

    const startTime = Date.now()
    setRealTimeMetrics({
      startTime,
      elapsedTime: 0,
      estimatedTimeRemaining: 0,
      currentSpeed: 0,
      totalBatches: Math.ceil(productsToSync.length / 100),
      completedBatches: 0,
    })

    setBulkSyncModalOpen(true)
    setBulkSyncStatus("syncing")
    setBulkSyncMessage("Iniciando sincronización masiva optimizada...")
    setBulkSyncProgress({ current: 0, total: productsToSync.length })
    setBulkSyncResults({ success: 0, errors: 0, details: [] })

    try {
      const result = await apiService.syncAllProductsOptimized(productsToSync, {
        onProgress: (current, total, message) => {
          setBulkSyncProgress({ current, total })
          setBulkSyncMessage(message)

          const totalBatches = Math.ceil(total / 100)
          const completedBatches = Math.floor(current / 100)
          updateRealTimeMetrics(current, total, completedBatches, totalBatches)
        },
        onBatchComplete: (batchResults) => {
          const details = batchResults.map((r) => ({
            product: r.product,
            success: r.success,
            message: r.message,
          }))

          const successCount = batchResults.filter((r) => r.success).length
          const errorCount = batchResults.filter((r) => !r.success).length

          setBulkSyncResults((prev) => ({
            success: prev.success + successCount,
            errors: prev.errors + errorCount,
            details: [...prev.details, ...details],
          }))

          const avgResponseTime = batchResults.reduce((sum, r) => sum + (r.responseTime || 0), 0) / batchResults.length
          const successRate = (successCount / batchResults.length) * 100

          setBatchPerformance({
            currentBatchSize: batchResults.length,
            successRate,
            avgResponseTime,
            errorCount,
          })
        },
      })

      result.results.forEach((syncResult) => {
        if (syncResult.success && syncResult.productData) {
          const product = syncResult.productData
          const cacheKey = `${product.cod_item}_${product.precioActual}_${product.existencia}`
          setSyncCache(
            (prev) =>
              new Map(
                prev.set(cacheKey, {
                  timestamp: Date.now(),
                  existencia: product.existencia,
                  precio: product.precioActual,
                  result: {
                    success: true,
                    message: syncResult.message,
                    productId: syncResult.productId,
                    product: syncResult.product,
                  },
                }),
              ),
          )
        }
      })

      try {
        setBulkSyncMessage("Ajustando productos ausentes en Novasoft: stock 0 y estado borrador...")
        const adjustResult = await apiService.markMissingWooProductsAsDraft(allProducts)
        const summaryMsg = `Ajuste completado: ${adjustResult.updated}/${adjustResult.totalCandidates} productos marcados como borrador con stock 0${adjustResult.failed ? `, ${adjustResult.failed} errores` : ""}.`

        setBulkSyncResults((prev) => ({
          ...prev,
          errors: prev.errors + adjustResult.failed,
          details: [
            ...prev.details,
            { product: "Ajuste de ausentes", success: adjustResult.failed === 0, message: summaryMsg },
          ],
        }))
      } catch (error) {
        const errMsg = "Error ajustando productos ausentes en Novasoft"
        setBulkSyncResults((prev) => ({
          ...prev,
          errors: prev.errors + 1,
          details: [...prev.details, { product: "Ajuste de ausentes", success: false, message: errMsg }],
        }))
      }

      const finalResults = result.results
      const successCount = finalResults.filter((r) => r.success).length
      const errorCount = finalResults.filter((r) => !r.success).length

      if (errorCount === 0) {
        setBulkSyncStatus("success")
        setBulkSyncMessage(
          `✅ Sincronización optimizada completada exitosamente. ${successCount} productos actualizados (solo productos existentes en WooCommerce).`,
        )
      } else if (successCount === 0) {
        setBulkSyncStatus("error")
        setBulkSyncMessage(`❌ Error en la sincronización optimizada. ${errorCount} productos fallaron.`)
      } else {
        setBulkSyncStatus("partial")
        setBulkSyncMessage(
          `⚠️ Sincronización optimizada parcial completada. ${successCount} exitosos, ${errorCount} errores.`,
        )
      }
    } catch (error) {
      console.error("Error en sincronización optimizada:", error)
      setBulkSyncStatus("error")
      setBulkSyncMessage(
        `❌ Error crítico en la sincronización optimizada: ${error instanceof Error ? error.message : "Error desconocido"}`,
      )
      setBulkSyncResults({
        success: 0,
        errors: 1,
        details: [{ product: "Sistema", success: false, message: "Error crítico en la sincronización" }],
      })
    }
  }

  const closeBulkSyncModal = () => {
    setBulkSyncModalOpen(false)
    setBulkSyncStatus("syncing")
    setBulkSyncMessage("")
    setBulkSyncProgress({ current: 0, total: 0 })
    setBulkSyncResults({ success: 0, errors: 0, details: [] })
  }

  const updateRealTimeMetrics = (
    processedCount: number,
    totalCount: number,
    batchesCompleted: number,
    totalBatches: number,
  ) => {
    const now = Date.now()
    const elapsed = now - realTimeMetrics.startTime

    if (elapsed < 0 || elapsed > 3600000) {
      console.warn("Tiempo transcurrido inválido:", elapsed)
      return
    }

    const elapsedSeconds = elapsed / 1000

    const currentSpeed = elapsedSeconds > 0 ? processedCount / elapsedSeconds : 0

    const remainingProducts = totalCount - processedCount
    const estimatedTimeRemainingSeconds = currentSpeed > 0 ? remainingProducts / currentSpeed : 0

    const maxEstimatedTime = 7200000
    const estimatedTimeRemaining = Math.min(estimatedTimeRemainingSeconds * 1000, maxEstimatedTime)

    setRealTimeMetrics({
      startTime: realTimeMetrics.startTime,
      elapsedTime: elapsed,
      estimatedTimeRemaining,
      currentSpeed: currentSpeed * 60,
      totalBatches,
      completedBatches: batchesCompleted,
    })
  }

  const formatTime = (milliseconds: number): string => {
    if (!milliseconds || milliseconds < 0 || !isFinite(milliseconds)) {
      return "0s"
    }

    if (milliseconds < 1000) {
      return "0s"
    }

    if (milliseconds < 60000) {
      const seconds = Math.round(milliseconds / 1000)
      return `${seconds}s`
    }

    const minutes = Math.floor(milliseconds / 60000)
    const seconds = Math.round((milliseconds % 60000) / 1000)

    if (seconds === 0) {
      return `${minutes}m`
    }

    return `${minutes}m ${seconds}s`
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center bg-gradient-to-r from-primary/10 via-secondary/10 to-primary/5 p-6 rounded-xl border border-primary/20">
        <div>
          <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r  bg-clip-text text-black">
            Productos en Novasoft
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Gestiona y sincroniza tu inventario</p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            onClick={verifyAllProducts}
            disabled={
              loading ||
              filteredProducts.length === 0 ||
              filteredProducts.filter((p) => p.cod_item).length === 0 ||
              verifyingProducts.size > 0
            }
            className="flex items-center gap-2 cursor-pointer bg-green-600 hover:bg-green-700 text-white shadow-lg shadow-green-600/20 disabled:opacity-50 transition-all duration-200"
            title={
              verifyingProducts.size > 0
                ? `Verificando ${verifyingProducts.size} productos...`
                : `Verificar existencia en WooCommerce (${filteredProducts.filter((p) => p.cod_item).length} productos con código)`
            }
          >
            <Search className={`h-4 w-4 ${verifyingProducts.size > 0 ? "animate-spin" : ""}`} />
            {verificationProgress.isActive ? (
              <span className="flex items-center gap-1">
                Verificando...
                <span className="text-xs bg-green-700 px-2 py-0.5 rounded-full">
                  {verificationProgress.processedProducts}/{verificationProgress.totalProducts}
                </span>
              </span>
            ) : (
              "Verificar Estado"
            )}
          </Button>

          <Button
            onClick={runDiagnostics}
            disabled={diagnosing}
            className="flex items-center gap-2 cursor-pointer bg-slate-600 hover:bg-slate-700 text-white shadow-lg shadow-slate-600/20 disabled:opacity-50 transition-all duration-200"
            title="Ejecutar diagnóstico de conectividad y configuración"
          >
            <Search className={`h-4 w-4 ${diagnosing ? 'animate-spin' : ''}`} />
            {diagnosing ? 'Diagnosticando...' : 'Diagnosticar'}
          </Button>

          {verificationProgress.isActive && (
            <div className="flex items-center gap-3 text-sm text-foreground bg-card/80 backdrop-blur-sm px-4 py-2 rounded-lg border border-border/50 shadow-sm">
              <div className="flex items-center gap-1.5">
                <span className="font-medium text-primary">Lote:</span>
                <span>
                  {verificationProgress.currentBatch}/{verificationProgress.totalBatches}
                </span>
              </div>
              <div className="w-px h-4 bg-border"></div>
              <div className="flex items-center gap-1.5">
                <span className="font-medium text-primary">Velocidad:</span>
                <span>{verificationProgress.productsPerSecond.toFixed(1)} prod/s</span>
              </div>
              {verificationProgress.estimatedTimeRemaining > 0 && (
                <>
                  <div className="w-px h-4 bg-border"></div>
                  <div className="flex items-center gap-1.5">
                    <span className="font-medium text-primary">Restante:</span>
                    <span>{Math.ceil(verificationProgress.estimatedTimeRemaining / 1000)}s</span>
                  </div>
                </>
              )}
            </div>
          )}

          <Button
            onClick={handleBulkSync}
            disabled={
              loading || filteredProducts.length === 0 || filteredProducts.filter((p) => p.cod_item).length === 0
            }
            className="flex items-center gap-2 cursor-pointer bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/20 transition-all duration-200"
            title={`Sincronizar todos los productos (${filteredProducts.filter((p) => p.cod_item).length} productos con código)`}
          >
            <RotateCw className="h-4 w-4" />
            Sync todo
          </Button>
          <Button
            onClick={handleBulkCreate}
            disabled={
              loading || filteredProducts.filter((p) => p.cod_item && !productExistence.get(p.cod_item)).length === 0
            }
            className="flex items-center gap-2 cursor-pointer bg-secondary hover:bg-secondary/90 text-secondary-foreground shadow-lg shadow-secondary/20 transition-all duration-200"
            title={`Crear todos los productos que no existen (${filteredProducts.filter((p) => p.cod_item && !productExistence.get(p.cod_item)).length} productos)`}
          >
            <Plus className="h-4 w-4" />
            Crear Todos
          </Button>
          <Button
            onClick={fetchProducts}
            disabled={loading}
            className="flex items-center gap-2 cursor-pointer hover:bg-muted transition-all duration-200 bg-transparent"
            variant="outline"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Actualizar
          </Button>
        </div>
      </div>

      <Card className="border-border/50 shadow-lg bg-card/80 backdrop-blur-sm p-0">
        <CardHeader className="border-b border-border/50 bg-gradient-to-r from-primary/5 to-secondary/5 py-6">
          <CardTitle className="text-xl">Lista de Productos</CardTitle>
          <CardDescription className="flex items-center gap-2">
            <span className="font-medium text-foreground">{filteredProducts.length}</span> de{" "}
            <span className="font-medium text-foreground">{products.length}</span> productos
            {filteredProducts.length > 0 && (
              <span className="ml-2 text-orange-600 font-medium flex items-center gap-1">
                •{" "}
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-orange-100 text-orange-700 border border-orange-200">
                  {
                    filteredProducts.filter((p) => {
                      if (p.cod_item) {
                        const sku = p.cod_item.trim()
                        if (sku && productExistence.has(sku)) {
                          return !productExistence.get(sku)
                        }
                      }
                      return false
                    }).length
                  }{" "}
                  no existen en WooCommerce
                </span>
              </span>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-1">
          <div className="mb-6 relative">
            <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-muted-foreground h-5 w-5" />
            <Input
              type="text"
              placeholder="Buscar por código, descripción, empresa o estado..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-12 h-12 cursor-text border-border/50 focus:border-primary/50 focus:ring-primary/20 bg-background/50"
            />
          </div>

          {error && (
            <div className="mb-6 p-4 bg-destructive/10 border border-destructive/20 rounded-lg flex items-center gap-3">
              <AlertCircle className="h-5 w-5 text-destructive flex-shrink-0" />
              <div className="flex flex-col gap-1">
                <span className="text-destructive font-medium">{error}</span>
                {/(404)/.test(error) && (
                  <span className="text-sm text-muted-foreground">Verifica que la aplicación esté usando las rutas locales del proxy y que el backend esté corriendo.</span>
                )}
                {/(401|No autorizado)/.test(error) && (
                  <span className="text-sm text-muted-foreground">Revisa las credenciales de Novasoft en el archivo env.</span>
                )}
                {/Timeout/.test(error) && (
                  <span className="text-sm text-muted-foreground">El servidor tardó demasiado en responder. Intenta nuevamente o valida la conectividad.</span>
                )}
              </div>
            </div>
          )}

          {diagnostics && (
            <div className="mb-6 p-4 bg-muted border border-border rounded-lg">
              <div className="flex justify-between items-center mb-2">
                <span className="font-medium">Diagnóstico de Novasoft</span>
                <span className={`text-xs px-2 py-0.5 rounded-full ${diagnostics.ok ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{diagnostics.ok ? 'OK' : 'Problemas detectados'}</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {diagnostics.results.map((r, idx) => (
                  <div key={idx} className={`text-sm flex items-center gap-2 p-2 rounded border ${r.ok ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'}`}>
                    <span className="font-mono">{r.name}</span>
                    <span className="opacity-70">{typeof r.status === 'number' ? `(${r.status})` : ''}</span>
                    <span className="ml-auto">{r.message || (r.ok ? 'OK' : 'Error')}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="rounded-lg border border-border/50 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50 hover:bg-muted/70">
                  <TableHead className="w-[50px] font-semibold">#</TableHead>
                  <TableHead
                    className="cursor-pointer hover:bg-muted/70 select-none font-semibold transition-colors"
                    onClick={() => handleSort("cod_item")}
                  >
                    <div className="flex items-center gap-2">
                      Código
                      {getSortIcon("cod_item")}
                    </div>
                  </TableHead>
                  <TableHead
                    className="cursor-pointer hover:bg-muted/70 select-none font-semibold transition-colors"
                    onClick={() => handleSort("des_item")}
                  >
                    <div className="flex items-center gap-2">
                      Descripción
                      {getSortIcon("des_item")}
                    </div>
                  </TableHead>
                  <TableHead
                    className="text-right cursor-pointer hover:bg-muted/70 select-none font-semibold transition-colors"
                    onClick={() => handleSort("existencia")}
                  >
                    <div className="flex items-center justify-end gap-2">
                      Stock
                      {getSortIcon("existencia")}
                    </div>
                  </TableHead>
                  <TableHead
                    className="text-right cursor-pointer hover:bg-muted/70 select-none font-semibold transition-colors"
                    onClick={() => handleSort("precioAnterior")}
                  >
                    <div className="flex items-center justify-end gap-2">
                      Precio Anterior
                      {getSortIcon("precioAnterior")}
                    </div>
                  </TableHead>
                  <TableHead
                    className="text-right cursor-pointer hover:bg-muted/70 select-none font-semibold transition-colors"
                    onClick={() => handleSort("precioActual")}
                  >
                    <div className="flex items-center justify-end gap-2">
                      Precio Actual
                      {getSortIcon("precioActual")}
                    </div>
                  </TableHead>
                  <TableHead
                    className="cursor-pointer hover:bg-muted/70 select-none font-semibold transition-colors"
                    onClick={() => handleSort("estado")}
                  >
                    <div className="flex items-center gap-2">
                      Estado
                      {getSortIcon("estado")}
                    </div>
                  </TableHead>
                  <TableHead className="font-semibold">Sincronizado</TableHead>
                  <TableHead className="text-center font-semibold">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow key="loading">
                    <TableCell colSpan={9} className="h-32 text-center">
                      <div className="flex flex-col items-center justify-center gap-3">
                        <div className="h-10 w-10 rounded-full border-4 border-primary/20 border-t-primary animate-spin"></div>
                        <span className="text-muted-foreground font-medium">Cargando productos...</span>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : filteredProducts.length === 0 ? (
                  <TableRow key="empty">
                    <TableCell colSpan={9} className="h-32 text-center text-muted-foreground">
                      {searchTerm
                        ? "No se encontraron productos que coincidan con la búsqueda"
                        : "No hay productos disponibles"}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredProducts.map((product, index) => (
                    <TableRow
                      key={product.cod_item || `product-${index}`}
                      className="hover:bg-muted/30 transition-colors"
                    >
                      <TableCell className="font-medium text-muted-foreground">{index + 1}</TableCell>
                      <TableCell className="font-mono font-medium">{product.cod_item?.trim()}</TableCell>
                      <TableCell className="max-w-xs truncate">
                        {product.des_item?.trim() || "Sin descripción"}
                      </TableCell>
                      <TableCell className="text-right font-medium">{product.existencia || 0}</TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {product.precioAnterior ? formatPrice(product.precioAnterior) : "N/A"}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {product.precioActual ? formatPrice(product.precioActual) : "N/A"}
                      </TableCell>
                      <TableCell>{getEstadoBadge(product.estado, product)}</TableCell>
                      <TableCell>{getSincronizadoBadge(product)}</TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center gap-2 justify-center">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => verifyProductExistence(product)}
                            disabled={
                              !product.cod_item ||
                              !product.cod_item.trim() ||
                              verifyingProducts.has(product.cod_item.trim())
                            }
                            className="flex items-center gap-1.5 hover:bg-green-50 hover:text-green-700 hover:border-green-300 transition-all duration-200"
                            title={
                              product.cod_item && product.cod_item.trim()
                                ? "Verificar estado y sincronización en WooCommerce"
                                : "Producto sin código SKU"
                            }
                          >
                            {product.cod_item && verifyingProducts.has(product.cod_item.trim()) ? (
                              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Search className="h-3.5 w-3.5" />
                            )}
                            Verificar
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleSyncProduct(product)}
                            disabled={!product.cod_item}
                            className="flex items-center gap-1.5 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-300 transition-all duration-200"
                            title={product.cod_item ? "Sincronizar con WooCommerce" : "Producto sin código SKU"}
                          >
                            <RotateCw className="h-3.5 w-3.5" />
                            Sync
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleCreateProduct(product)}
                            disabled={(() => {
                              const sku = product.cod_item?.trim()
                              if (!sku) return true
                              if (!productExistence.has(sku)) return true
                              return productExistence.get(sku) !== false
                            })()}
                            className="flex items-center gap-1.5 hover:bg-purple-50 hover:text-purple-700 hover:border-purple-300 transition-all duration-200"
                            title={product.cod_item ? "Crear producto en WooCommerce" : "Producto sin código SKU"}
                          >
                            <Plus className="h-3.5 w-3.5" />
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

      <Dialog open={syncModalOpen} onOpenChange={closeSyncModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {syncStatus === "syncing" && <RotateCw className="h-4 w-4 animate-spin" />}
              {syncStatus === "success" && (
                <div className="h-4 w-4 bg-green-500 rounded-full flex items-center justify-center">
                  <div className="h-2 w-2 bg-white rounded-full"></div>
                </div>
              )}
              {syncStatus === "error" && <AlertCircle className="h-4 w-4 text-red-500" />}
              Sincronización con WooCommerce
            </DialogTitle>
            <DialogDescription>
              {syncingProduct && (
                <div className="space-y-2">
                  <div>
                    <strong>Producto:</strong> {syncingProduct.cod_item}
                  </div>
                  <div>
                    <strong>Descripción:</strong> {syncingProduct.des_item}
                  </div>
                </div>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="flex items-center gap-2">
              {syncStatus === "syncing" && <RefreshCw className="h-4 w-4 animate-spin" />}
              <span
                className={`text-sm ${
                  syncStatus === "success"
                    ? "text-green-600"
                    : syncStatus === "error"
                      ? "text-red-600"
                      : "text-blue-600"
                }`}
              >
                {syncMessage}
              </span>
            </div>

            {syncResult && syncResult.success && syncResult.productData && (
              <div className="bg-green-50 p-3 rounded-md text-sm">
                <div className="font-medium text-green-800 mb-2">Datos actualizados:</div>
                <div className="space-y-1 text-green-700">
                  <div>• Stock: {syncResult.productData.stock_quantity} unidades</div>
                  {syncResult.productData.regular_price && (
                    <div>
                      • Precio normal: ${Number.parseFloat(syncResult.productData.regular_price).toLocaleString()}
                    </div>
                  )}
                  {syncResult.productData.sale_price && (
                    <div>
                      • Precio rebajado: ${Number.parseFloat(syncResult.productData.sale_price).toLocaleString()}
                    </div>
                  )}
                </div>
              </div>
            )}

            {syncStatus === "error" && (
              <div className="bg-red-50 p-3 rounded-md">
                <div className="text-red-800 text-sm font-medium">Error en la sincronización</div>
                <div className="text-red-600 text-sm mt-1">{syncMessage}</div>
              </div>
            )}
          </div>

          {syncStatus !== "syncing" && (
            <div className="flex justify-end">
              <Button onClick={closeSyncModal} variant="outline">
                Cerrar
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={createModalOpen} onOpenChange={closeCreateModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {createStatus === "creating" && <Plus className="h-4 w-4" />}
              {createStatus === "success" && (
                <div className="h-4 w-4 bg-green-500 rounded-full flex items-center justify-center">
                  <div className="h-2 w-2 bg-white rounded-full"></div>
                </div>
              )}
              {createStatus === "error" && <AlertCircle className="h-4 w-4 text-red-500" />}
              Crear producto en WooCommerce
            </DialogTitle>
            <DialogDescription>
              {creatingProduct && (
                <div className="space-y-2">
                  <div>
                    <strong>Producto:</strong> {creatingProduct.cod_item}
                  </div>
                  <div>
                    <strong>Descripción:</strong> {creatingProduct.des_item}
                  </div>
                </div>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="flex items-center gap-2">
              {createStatus === "creating" && <RefreshCw className="h-4 w-4 animate-spin" />}
              <span
                className={`text-sm ${
                  createStatus === "success"
                    ? "text-green-600"
                    : createStatus === "error"
                      ? "text-red-600"
                      : "text-blue-600"
                }`}
              >
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
                    <div>
                      • Precio normal: ${Number.parseFloat(createResult.productData.regular_price).toLocaleString()}
                    </div>
                  )}
                  {createResult.productData.sale_price && (
                    <div>
                      • Precio rebajado: ${Number.parseFloat(createResult.productData.sale_price).toLocaleString()}
                    </div>
                  )}
                </div>
              </div>
            )}

            {createStatus === "error" && (
              <div className="bg-red-50 p-3 rounded-md">
                <div className="text-red-800 text-sm font-medium">Error en la creación</div>
                <div className="text-red-600 text-sm mt-1">{createMessage}</div>
              </div>
            )}
          </div>

          {createStatus !== "creating" && (
            <div className="flex justify-end">
              <Button onClick={closeCreateModal} variant="outline">
                Cerrar
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={bulkCreateModalOpen} onOpenChange={closeBulkCreateModal}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {bulkCreateStatus === "creating" && <Plus className="h-4 w-4 animate-spin" />}
              {bulkCreateStatus === "success" && (
                <div className="h-4 w-4 bg-green-500 rounded-full flex items-center justify-center">
                  <div className="h-2 w-2 bg-white rounded-full"></div>
                </div>
              )}
              {bulkCreateStatus === "partial" && (
                <div className="h-4 w-4 bg-yellow-500 rounded-full flex items-center justify-center">
                  <div className="h-2 w-2 bg-white rounded-full"></div>
                </div>
              )}
              {bulkCreateStatus === "error" && <AlertCircle className="h-4 w-4 text-red-500" />}
              Creación Masiva de Productos
            </DialogTitle>
            <DialogDescription>Creando productos como borradores en WooCommerce</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {bulkCreateProgress.total > 0 && (
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Progreso total</span>
                  <span>
                    {bulkCreateProgress.current} de {bulkCreateProgress.total} productos
                  </span>
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

            <div className="flex items-center gap-2">
              {bulkCreateStatus === "creating" && <RefreshCw className="h-4 w-4 animate-spin" />}
              <span
                className={`text-sm ${
                  bulkCreateStatus === "success"
                    ? "text-green-600"
                    : bulkCreateStatus === "error"
                      ? "text-red-600"
                      : bulkCreateStatus === "partial"
                        ? "text-yellow-600"
                        : "text-blue-600"
                }`}
              >
                {bulkCreateMessage}
              </span>
            </div>

            {bulkCreateStatus !== "creating" && bulkCreateResults.success + bulkCreateResults.errors > 0 && (
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

            {bulkCreateStatus !== "creating" &&
              bulkCreateResults.details.length > 0 &&
              bulkCreateResults.errors > 0 && (
                <div className="max-h-60 overflow-y-auto">
                  <div className="font-medium text-gray-800 mb-2">
                    Detalles de errores ({bulkCreateResults.errors} productos):
                  </div>
                  <div className="space-y-2">
                    {bulkCreateResults.details
                      .filter((detail) => !detail.success)
                      .map((detail, index) => (
                        <div key={index} className="bg-red-50 p-2 rounded text-sm">
                          <div className="font-medium text-red-800">{detail.product}</div>
                          <div className="text-red-600">{detail.message}</div>
                        </div>
                      ))}
                  </div>
                </div>
              )}

            {bulkCreateStatus !== "creating" &&
              bulkCreateResults.details.length > 0 &&
              bulkCreateResults.success > 0 && (
                <div className="max-h-40 overflow-y-auto">
                  <div className="font-medium text-gray-800 mb-2">
                    Productos creados exitosamente ({bulkCreateResults.success}):
                  </div>
                  <div className="space-y-1">
                    {bulkCreateResults.details
                      .filter((detail) => detail.success)
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

          {bulkCreateStatus !== "creating" && (
            <div className="flex justify-end">
              <Button onClick={closeBulkCreateModal} variant="outline">
                Cerrar
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={bulkSyncModalOpen} onOpenChange={closeBulkSyncModal}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {bulkSyncStatus === "syncing" && <RotateCw className="h-4 w-4 animate-spin" />}
              {bulkSyncStatus === "success" && (
                <div className="h-4 w-4 bg-green-500 rounded-full flex items-center justify-center">
                  <div className="h-2 w-2 bg-white rounded-full"></div>
                </div>
              )}
              {bulkSyncStatus === "partial" && (
                <div className="h-4 w-4 bg-yellow-500 rounded-full flex items-center justify-center">
                  <div className="h-2 w-2 bg-white rounded-full"></div>
                </div>
              )}
              {bulkSyncStatus === "error" && <AlertCircle className="h-4 w-4 text-red-500" />}
              Sincronización Masiva Optimizada
            </DialogTitle>
            <DialogDescription>Procesamiento en lotes paralelos para mayor velocidad</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {bulkSyncStatus === "syncing" && bulkSyncProgress.total > 0 && (
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
                        <span className="font-medium">
                          {realTimeMetrics.completedBatches} de {realTimeMetrics.totalBatches}
                        </span>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}

            {bulkSyncProgress.total > 0 && (
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Progreso total</span>
                  <span>
                    {bulkSyncProgress.current} de {bulkSyncProgress.total} productos
                  </span>
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

            <div className="flex items-center gap-2">
              {bulkSyncStatus === "syncing" && <RefreshCw className="h-4 w-4 animate-spin" />}
              <span
                className={`text-sm ${
                  bulkSyncStatus === "success"
                    ? "text-green-600"
                    : bulkSyncStatus === "error"
                      ? "text-red-600"
                      : bulkSyncStatus === "partial"
                        ? "text-yellow-600"
                        : "text-blue-600"
                }`}
              >
                {bulkSyncMessage}
              </span>
            </div>

            {bulkSyncStatus !== "syncing" && bulkSyncResults.success + bulkSyncResults.errors > 0 && (
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

                <div className="mt-3 pt-3 border-t border-gray-200">
                  <div className="text-xs text-gray-600 space-y-1">
                    <div>⚡ Procesamiento completado en {formatTime(realTimeMetrics.elapsedTime)}</div>
                    <div>📊 Velocidad promedio: {realTimeMetrics.currentSpeed.toFixed(1)} productos/minuto</div>
                    <div>🔄 Lotes procesados: {realTimeMetrics.completedBatches} con tamaño dinámico</div>
                  </div>
                </div>
              </div>
            )}

            {bulkSyncStatus !== "syncing" && bulkSyncResults.details.length > 0 && bulkSyncResults.errors > 0 && (
              <div className="max-h-60 overflow-y-auto">
                <div className="font-medium text-gray-800 mb-2">
                  Detalles de errores ({bulkSyncResults.errors} productos):
                </div>
                <div className="space-y-2">
                  {bulkSyncResults.details
                    .filter((detail) => !detail.success)
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

          {bulkSyncStatus !== "syncing" && (
            <div className="flex justify-end">
              <Button onClick={closeBulkSyncModal} variant="outline">
                Cerrar
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
