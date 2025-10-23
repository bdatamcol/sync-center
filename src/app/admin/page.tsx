"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Package, TrendingUp, AlertTriangle, DollarSign, RefreshCw, LayoutDashboard } from "lucide-react"
import { apiService, type Product } from "@/lib/api"

interface ProductStats {
  totalProducts: number
  totalStock: number
  lowStockProducts: number
  totalInventoryValue: number
}

export default function EscritorioPage() {
  const [stats, setStats] = useState<ProductStats>({
    totalProducts: 0,
    totalStock: 0,
    lowStockProducts: 0,
    totalInventoryValue: 0,
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const calculateStats = (products: Product[]): ProductStats => {
    const lowStockThreshold = 10 // Umbral para stock bajo

    console.log("Calculando estadísticas para", products.length, "productos")

    const initial: ProductStats = { totalProducts: 0, totalStock: 0, lowStockProducts: 0, totalInventoryValue: 0 }
    const result = products.reduce((acc: ProductStats, product, index) => {
      const stock = product.existencia || 0
      const price = product.precioActual || 0

      // Debug para los primeros 5 productos
      if (index < 5) {
        console.log(`Producto ${index + 1}:`, {
          cod_item: product.cod_item,
          des_item: product.des_item,
          existencia: product.existencia,
          precioActual: product.precioActual,
          stock,
          price,
          valor: stock * price,
        })
      }

      return {
        totalProducts: acc.totalProducts + 1,
        totalStock: acc.totalStock + stock,
        lowStockProducts: acc.lowStockProducts + (stock < lowStockThreshold ? 1 : 0),
        totalInventoryValue: acc.totalInventoryValue + stock * price,
      }
    }, initial)

    console.log("Estadísticas calculadas:", result)
    return result
  }

  const fetchStats = async () => {
    setLoading(true)
    setError(null)

    try {
      const [productsResponse, pricesResponse] = await Promise.all([apiService.getProducts(), apiService.getPrices()])

      console.log("Respuesta de productos:", productsResponse)
      console.log("Respuesta de precios:", pricesResponse)

      if (productsResponse.success && productsResponse.data) {
        let products = productsResponse.data

        console.log("Productos antes de combinar:", products.slice(0, 3))

        // Combinar con datos de precios si están disponibles
        if (pricesResponse.success && pricesResponse.data) {
          const pricesMap = new Map(pricesResponse.data.map((price) => [price.codigo, price]))

          console.log("Mapa de precios:", Array.from(pricesMap.entries()).slice(0, 3))
          console.log(
            "Códigos de productos:",
            products.slice(0, 5).map((p) => p.cod_item),
          )

          products = products.map((product) => {
            const priceData = pricesMap.get(product.cod_item || "")
            console.log(`Buscando precio para ${product.cod_item}:`, priceData)

            return {
              ...product,
              precioAnterior: priceData?.precioAnterior || product.precioAnterior || 0,
              precioActual: priceData?.precioActual || product.precioActual || 0,
            }
          })

          console.log("Productos después de combinar:", products.slice(0, 3))
        } else {
          // Si no hay datos de precios, usar valores por defecto o existentes
          console.log("No hay datos de precios disponibles, usando precios existentes en productos")
          products = products.map((product) => ({
            ...product,
            precioAnterior: product.precioAnterior || 0,
            precioActual: product.precioActual || product.precio || product.precio_venta || 0,
          }))
        }

        const calculatedStats = calculateStats(products)
        setStats(calculatedStats)
      } else {
        setError(productsResponse.error || "Error al cargar los productos")
      }
    } catch (err) {
      console.error("Error al cargar estadísticas:", err)
      setError("Error de conexión al cargar las estadísticas")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchStats()
  }, [])

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("es-CO", {
      style: "currency",
      currency: "COP",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value)
  }

  const formatNumber = (value: number) => {
    return new Intl.NumberFormat("es-CO").format(value)
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center bg-gradient-to-r from-primary/10 via-secondary/10 to-primary/5 p-6 rounded-xl border border-primary/20">
        <div>
          <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
            Escritorio
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Panel principal de administración</p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64 bg-gradient-to-br from-blue-50 to-white rounded-lg border border-blue-100">
          <div className="flex flex-col items-center gap-4">
            <div className="relative">
              <div className="h-16 w-16 rounded-full border-4 border-blue-200 border-t-primary animate-spin" />
              <RefreshCw className="h-6 w-6 text-primary absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
            </div>
            <span className="text-lg font-medium text-gray-700">Cargando estadísticas...</span>
          </div>
        </div>
      ) : error ? (
        <div className="flex items-center justify-center h-64 bg-gradient-to-br from-red-50 to-white rounded-lg border border-red-200">
          <div className="text-center">
            <div className="bg-red-100 rounded-full p-4 inline-block mb-4">
              <AlertTriangle className="h-12 w-12 text-red-600" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Error al cargar estadísticas</h3>
            <p className="text-gray-600">{error}</p>
          </div>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card className="border-blue-200 shadow-md hover:shadow-lg transition-shadow duration-300 bg-gradient-to-br from-blue-50 to-white">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-gray-700">Total de Productos</CardTitle>
              <div className="bg-blue-100 p-2 rounded-lg">
                <Package className="h-5 w-5 text-primary" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-primary">{formatNumber(stats.totalProducts)}</div>
              <p className="text-xs text-gray-600 mt-1">Productos registrados en el sistema</p>
            </CardContent>
          </Card>

          <Card className="border-green-200 shadow-md hover:shadow-lg transition-shadow duration-300 bg-gradient-to-br from-green-50 to-white">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-gray-700">Stock Total</CardTitle>
              <div className="bg-green-100 p-2 rounded-lg">
                <TrendingUp className="h-5 w-5 text-green-600" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-green-600">{formatNumber(stats.totalStock)}</div>
              <p className="text-xs text-gray-600 mt-1">Unidades totales en inventario</p>
            </CardContent>
          </Card>

          <Card className="border-orange-200 shadow-md hover:shadow-lg transition-shadow duration-300 bg-gradient-to-br from-orange-50 to-white">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-gray-700">Stock Bajo</CardTitle>
              <div className="bg-orange-100 p-2 rounded-lg">
                <AlertTriangle className="h-5 w-5 text-orange-600" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-orange-600">{formatNumber(stats.lowStockProducts)}</div>
              <p className="text-xs text-gray-600 mt-1">Productos con menos de 10 unidades</p>
            </CardContent>
          </Card>

          <Card className="border-yellow-200 shadow-md hover:shadow-lg transition-shadow duration-300 bg-gradient-to-br from-yellow-50 to-white">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-gray-700">Valor del Inventario</CardTitle>
              <div className="bg-yellow-100 p-2 rounded-lg">
                <DollarSign className="h-5 w-5 text-yellow-600" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-yellow-600">{formatCurrency(stats.totalInventoryValue)}</div>
              <p className="text-xs text-gray-600 mt-1">Valor total del inventario</p>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
