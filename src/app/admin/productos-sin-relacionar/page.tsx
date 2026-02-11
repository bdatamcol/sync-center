"use client"

import { useEffect, useMemo, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { RefreshCw, Copy, Package, ShoppingCart, AlertCircle } from "lucide-react"
import { apiService, type Product, type WooCommerceProduct } from "@/lib/api"

export default function ProductosSinRelacionarPage() {
  const [nsProducts, setNsProducts] = useState<Product[]>([])
  const [wooProducts, setWooProducts] = useState<WooCommerceProduct[]>([])
  const [mismatched, setMismatched] = useState<WooCommerceProduct[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [copiedSku, setCopiedSku] = useState<string | null>(null)

  const fetchData = async () => {
    try {
      setLoading(true)
      setError(null)

      const [nsRes, wooList] = await Promise.all([apiService.getProducts(), apiService.getAllWooProducts()])

      const nsData = nsRes.success ? (nsRes.data ?? []) : []
      setNsProducts(nsData)
      setWooProducts(wooList)

      const nsSkuSet = new Set(nsData.map((p) => (p.cod_item || "").trim()).filter((s) => s !== ""))

      const notRelated = wooList.filter((p) => {
        const sku = (p.sku || "").trim()
        return sku === "" || !nsSkuSet.has(sku)
      })

      setMismatched(notRelated)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return mismatched
    return mismatched.filter((p) => {
      const sku = (p.sku || "").toLowerCase()
      const name = (p.name || "").toLowerCase()
      const idStr = String(p.id)
      return sku.includes(term) || name.includes(term) || idStr.includes(term)
    })
  }, [search, mismatched])

  const copySku = async (sku: string) => {
    try {
      if (!sku) return
      await navigator.clipboard.writeText(sku)
      setCopiedSku(sku)
      setTimeout(() => setCopiedSku(null), 2000)
    } catch {}
  }

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-primary/10 via-primary/5 to-transparent rounded-lg p-6 border border-primary/20">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 bg-primary/10 rounded-lg">
            <AlertCircle className="h-6 w-6 text-primary" />
          </div>
          <h1 className="text-3xl font-bold text-foreground">Productos sin relacionar</h1>
        </div>
        <p className="text-muted-foreground ml-14">
          Lista de productos existentes en WooCommerce que no tienen correspondencia en Novasoft
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-primary/20 shadow-sm hover:shadow-md transition-shadow">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-1">Productos en Novasoft</p>
                <p className="text-3xl font-bold text-foreground">{nsProducts.length}</p>
              </div>
              <div className="p-3 bg-gradient-to-br from-primary/20 to-primary/10 rounded-lg">
                <Package className="h-6 w-6 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-primary/20 shadow-sm hover:shadow-md transition-shadow">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-1">Productos en WooCommerce</p>
                <p className="text-3xl font-bold text-foreground">{wooProducts.length}</p>
              </div>
              <div className="p-3 bg-gradient-to-br from-accent/20 to-accent/10 rounded-lg">
                <ShoppingCart className="h-6 w-6 text-accent" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-destructive/20 shadow-sm hover:shadow-md transition-shadow">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-1">Sin relacionar</p>
                <p className="text-3xl font-bold text-destructive">{mismatched.length}</p>
              </div>
              <div className="p-3 bg-gradient-to-br from-destructive/20 to-destructive/10 rounded-lg">
                <AlertCircle className="h-6 w-6 text-destructive" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-primary/20 shadow-lg">
        <CardHeader className="border-b bg-gradient-to-r from-primary/5 to-transparent">
          <CardTitle className="text-xl">Lista de productos</CardTitle>
          <CardDescription>
            Gestiona los productos de WooCommerce que no están sincronizados con Novasoft
          </CardDescription>
        </CardHeader>
        <CardContent className="p-6">
          <div className="flex flex-wrap items-center gap-3 mb-6">
            <Input
              placeholder="Buscar por SKU, nombre o ID..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-sm border-primary/20 focus-visible:ring-primary/30"
            />
            <Button
              onClick={handleExportCSV}
              disabled={filtered.length === 0}
              variant="outline"
              className="gap-2 border-primary/20 hover:bg-primary/5 hover:border-primary/30 transition-all bg-transparent"
            >
              <Download className="h-4 w-4" />
              Exportar
            </Button>
            <Button
              onClick={fetchData}
              disabled={loading}
              variant="outline"
              className="gap-2 border-primary/20 hover:bg-primary/5 hover:border-primary/30 transition-all bg-transparent"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              Actualizar
            </Button>
            {loading && (
              <span className="text-sm text-muted-foreground flex items-center gap-2">
                <div className="h-4 w-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                Cargando...
              </span>
            )}
            {error && (
              <span className="text-sm text-destructive flex items-center gap-2">
                <AlertCircle className="h-4 w-4" />
                {error}
              </span>
            )}
          </div>

          <div className="rounded-lg border border-primary/20 overflow-hidden">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-gradient-to-r from-primary/5 to-transparent hover:from-primary/10 hover:to-transparent">
                    <TableHead className="font-semibold">ID</TableHead>
                    <TableHead className="font-semibold">SKU</TableHead>
                    <TableHead className="font-semibold">Nombre</TableHead>
                    <TableHead className="font-semibold">Estado</TableHead>
                    <TableHead className="font-semibold">Stock</TableHead>
                    <TableHead className="font-semibold">Precio Regular</TableHead>
                    <TableHead className="font-semibold">Precio Oferta</TableHead>
                    <TableHead className="font-semibold">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((p) => (
                    <TableRow key={p.id} className="hover:bg-primary/5 transition-colors">
                      <TableCell className="whitespace-nowrap font-medium">{p.id}</TableCell>
                      <TableCell className="whitespace-nowrap">
                        {p.sku ? (
                          <span className="px-2 py-1 bg-primary/10 text-primary rounded text-sm font-mono">
                            {p.sku}
                          </span>
                        ) : (
                          <span className="text-muted-foreground italic text-sm">(sin SKU)</span>
                        )}
                      </TableCell>
                      <TableCell className="max-w-xs truncate">{p.name}</TableCell>
                      <TableCell className="whitespace-nowrap">
                        <span
                          className={`px-2 py-1 rounded-full text-xs font-medium border ${
                            p.status === "publish"
                              ? "bg-green-50 text-green-700 border-green-200"
                              : p.status === "draft"
                                ? "bg-yellow-50 text-yellow-700 border-yellow-200"
                                : "bg-gray-50 text-gray-700 border-gray-200"
                          }`}
                        >
                          {p.status || "N/A"}
                        </span>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {p.manage_stock ? (
                          <span className="font-medium">{p.stock_quantity ?? 0}</span>
                        ) : (
                          <span className="text-muted-foreground">N/A</span>
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap font-medium">
                        {p.regular_price ? `$${p.regular_price}` : "-"}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {p.sale_price ? (
                          <span className="text-accent font-medium">${p.sale_price}</span>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        <Button
                          variant="outline"
                          size="sm"
                          className={`gap-2 transition-all ${
                            copiedSku === p.sku
                              ? "bg-green-50 border-green-200 text-green-700"
                              : "border-primary/20 hover:bg-primary/5 hover:border-primary/30"
                          }`}
                          onClick={() => copySku(p.sku)}
                          disabled={!p.sku}
                          title={p.sku ? "Copiar SKU" : "Sin SKU"}
                        >
                          <Copy className="h-3 w-3" />
                          {copiedSku === p.sku ? "Copiado" : "Copiar SKU"}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {filtered.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={8}>
                        <div className="py-12 text-center">
                          <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-3 opacity-50" />
                          <p className="text-sm text-muted-foreground">
                            {search
                              ? "No se encontraron productos que coincidan con tu búsqueda"
                              : "No se encontraron productos sin relacionar"}
                          </p>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
