"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Package, TrendingUp, AlertTriangle, DollarSign, RefreshCw } from "lucide-react";
import { apiService, Product } from "@/lib/api";

interface ProductStats {
  totalProducts: number;
  totalStock: number;
  lowStockProducts: number;
  totalInventoryValue: number;
}

export default function EscritorioPage() {
  const [stats, setStats] = useState<ProductStats>({
    totalProducts: 0,
    totalStock: 0,
    lowStockProducts: 0,
    totalInventoryValue: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const calculateStats = (products: Product[]): ProductStats => {
    const lowStockThreshold = 10; // Umbral para stock bajo
    
    console.log('Calculando estadísticas para', products.length, 'productos');
    
    const initial: ProductStats = { totalProducts: 0, totalStock: 0, lowStockProducts: 0, totalInventoryValue: 0 };
    const result = products.reduce(
      (acc: ProductStats, product, index) => {
        const stock = product.existencia || 0;
        const price = product.precioActual || 0;
        
        // Debug para los primeros 5 productos
        if (index < 5) {
          console.log(`Producto ${index + 1}:`, {
            cod_item: product.cod_item,
            des_item: product.des_item,
            existencia: product.existencia,
            precioActual: product.precioActual,
            stock,
            price,
            valor: stock * price
          });
        }
        
        return {
          totalProducts: acc.totalProducts + 1,
          totalStock: acc.totalStock + stock,
          lowStockProducts: acc.lowStockProducts + (stock < lowStockThreshold ? 1 : 0),
          totalInventoryValue: acc.totalInventoryValue + (stock * price),
        };
      },
      initial
    );
    
    console.log('Estadísticas calculadas:', result);
    return result;
  };

  const fetchStats = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const [productsResponse, pricesResponse] = await Promise.all([
        apiService.getProducts(),
        apiService.getPrices()
      ]);

      console.log('Respuesta de productos:', productsResponse);
      console.log('Respuesta de precios:', pricesResponse);

      if (productsResponse.success && productsResponse.data) {
        let products = productsResponse.data;
        
        console.log('Productos antes de combinar:', products.slice(0, 3));
        
        // Combinar con datos de precios si están disponibles
        if (pricesResponse.success && pricesResponse.data) {
          const pricesMap = new Map(
            pricesResponse.data.map(price => [price.codigo, price])
          );
          
          console.log('Mapa de precios:', Array.from(pricesMap.entries()).slice(0, 3));
          console.log('Códigos de productos:', products.slice(0, 5).map(p => p.cod_item));
          
          products = products.map(product => {
            const priceData = pricesMap.get(product.cod_item || '');
            console.log(`Buscando precio para ${product.cod_item}:`, priceData);
            
            return {
              ...product,
              precioAnterior: priceData?.precioAnterior || product.precioAnterior || 0,
              precioActual: priceData?.precioActual || product.precioActual || 0,
            };
          });
          
          console.log('Productos después de combinar:', products.slice(0, 3));
        } else {
          // Si no hay datos de precios, usar valores por defecto o existentes
          console.log('No hay datos de precios disponibles, usando precios existentes en productos');
          products = products.map(product => ({
            ...product,
            precioAnterior: product.precioAnterior || 0,
            precioActual: product.precioActual || product.precio || product.precio_venta || 0,
          }));
        }
        
        const calculatedStats = calculateStats(products);
        setStats(calculatedStats);
      } else {
        setError(productsResponse.error || 'Error al cargar los productos');
      }
    } catch (err) {
      console.error('Error al cargar estadísticas:', err);
      setError('Error de conexión al cargar las estadísticas');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const formatNumber = (value: number) => {
    return new Intl.NumberFormat('es-CO').format(value);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Escritorio</h1>
        <p className="text-muted-foreground">
          Panel principal de administración
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="flex items-center gap-2">
            <RefreshCw className="h-6 w-6 animate-spin" />
            <span className="text-lg">Cargando estadísticas...</span>
          </div>
        </div>
      ) : error ? (
        <div className="flex items-center justify-center h-48">
          <div className="text-center">
            <AlertTriangle className="h-12 w-12 text-red-500 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              Error al cargar estadísticas
            </h3>
            <p className="text-gray-500">{error}</p>
          </div>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Total de Productos
              </CardTitle>
              <Package className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatNumber(stats.totalProducts)}</div>
              <p className="text-xs text-muted-foreground">
                Productos registrados en el sistema
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Stock Total
              </CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatNumber(stats.totalStock)}</div>
              <p className="text-xs text-muted-foreground">
                Unidades totales en inventario
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Stock Bajo
              </CardTitle>
              <AlertTriangle className="h-4 w-4 text-orange-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-orange-600">{formatNumber(stats.lowStockProducts)}</div>
              <p className="text-xs text-muted-foreground">
                Productos con menos de 10 unidades
              </p>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}