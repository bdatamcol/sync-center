"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { RefreshCw, Copy } from "lucide-react";
import { apiService, Product, WooCommerceProduct } from "@/lib/api";

export default function ProductosSinRelacionarPage() {
  const [nsProducts, setNsProducts] = useState<Product[]>([]);
  const [wooProducts, setWooProducts] = useState<WooCommerceProduct[]>([]);
  const [mismatched, setMismatched] = useState<WooCommerceProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);

      const [nsRes, wooList] = await Promise.all([
        apiService.getProducts(),
        apiService.getAllWooProducts(),
      ]);

      const nsData = nsRes.success ? (nsRes.data ?? []) : [];
      setNsProducts(nsData);
      setWooProducts(wooList);

      const nsSkuSet = new Set(
        nsData
          .map((p) => (p.cod_item || "").trim())
          .filter((s) => s !== "")
      );

      const notRelated = wooList.filter((p) => {
        const sku = (p.sku || "").trim();
        // Incluir productos sin SKU o con SKU no presente en Novasoft
        return sku === "" || !nsSkuSet.has(sku);
      });

      setMismatched(notRelated);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return mismatched;
    return mismatched.filter((p) => {
      const sku = (p.sku || "").toLowerCase();
      const name = (p.name || "").toLowerCase();
      const idStr = String(p.id);
      return sku.includes(term) || name.includes(term) || idStr.includes(term);
    });
  }, [search, mismatched]);

  const copySku = async (sku: string) => {
    try {
      if (!sku) return;
      await navigator.clipboard.writeText(sku);
    } catch {}
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Productos sin relacionar</CardTitle>
          <CardDescription>
            Lista de productos existentes en WooCommerce que no tienen correspondencia en Novasoft.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <Input
              placeholder="Buscar por SKU, nombre o ID"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-sm"
            />
            <Button onClick={fetchData} disabled={loading} variant="outline" className="gap-2">
              <RefreshCw className="h-4 w-4" />
              Actualizar
            </Button>
            {loading && <span className="text-sm text-gray-500">Cargando...</span>}
            {error && <span className="text-sm text-red-600">{error}</span>}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div className="p-3 rounded border">
              <div className="text-sm text-gray-500">Productos en Novasoft</div>
              <div className="text-xl font-semibold">{nsProducts.length}</div>
            </div>
            <div className="p-3 rounded border">
              <div className="text-sm text-gray-500">Productos en WooCommerce</div>
              <div className="text-xl font-semibold">{wooProducts.length}</div>
            </div>
            <div className="p-3 rounded border">
              <div className="text-sm text-gray-500">Sin relacionar</div>
              <div className="text-xl font-semibold">{mismatched.length}</div>
            </div>
          </div>

          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Stock</TableHead>
                  <TableHead>Precio Regular</TableHead>
                  <TableHead>Precio Oferta</TableHead>
                  <TableHead>Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="whitespace-nowrap">{p.id}</TableCell>
                    <TableCell className="whitespace-nowrap">{p.sku || <span className="text-gray-500">(sin SKU)</span>}</TableCell>
                    <TableCell>{p.name}</TableCell>
                    <TableCell className="whitespace-nowrap">{p.status || ""}</TableCell>
                    <TableCell className="whitespace-nowrap">{p.manage_stock ? p.stock_quantity ?? 0 : "N/A"}</TableCell>
                    <TableCell className="whitespace-nowrap">{p.regular_price || ""}</TableCell>
                    <TableCell className="whitespace-nowrap">{p.sale_price || ""}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-2"
                          onClick={() => copySku(p.sku)}
                          disabled={!p.sku}
                          title={p.sku ? "Copiar SKU" : "Sin SKU"}
                        >
                          <Copy className="h-3 w-3" />
                          Copiar SKU
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8}>
                      <div className="py-6 text-center text-sm text-gray-500">
                        No se encontraron productos sin relacionar.
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}