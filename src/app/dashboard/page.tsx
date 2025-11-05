'use client';

import { useState } from 'react';
import { useInventory } from '@/hooks/use-inventory';
import { useFilterOptions } from '@/hooks/use-filter-options';
import { Button } from '@/components/ui/button';
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardHeader, 
  CardTitle 
} from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { 
  Filter, 
  RefreshCw, 
  Package, 
  DollarSign, 
  Building2, 
  MapPin,
  ChevronLeft,
  ChevronRight,
  Download
} from 'lucide-react';

export default function DashboardPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [currentFilters, setCurrentFilters] = useState({
    empresa: '',
    ciudad: '',
    nom_gru: '',
    page: 1,
    limit: 10,
  });

  const { data, loading, error, refetch } = useInventory(currentFilters);
  const { options, loading: optionsLoading } = useFilterOptions();

  const handleFilterChange = (key: string, value: string) => {
    // Convertir 'all' a string vacío para la API
    const apiValue = value === 'all' ? '' : value;
    const newFilters = {
      ...currentFilters,
      [key]: apiValue,
      page: 1, // Reset to first page when filtering
    };
    setCurrentFilters(newFilters);
    refetch(newFilters);
  };

  const handlePageChange = (newPage: number) => {
    const newFilters = { ...currentFilters, page: newPage };
    setCurrentFilters(newFilters);
    refetch(newFilters);
  };

  const handleRefresh = () => {
    refetch(currentFilters);
  };

  const clearFilters = () => {
    const clearedFilters = {
      empresa: '',
      ciudad: '',
      nom_gru: '',
      page: 1,
      limit: 10,
    };
    setCurrentFilters(clearedFilters);
    setSearchTerm('');
    refetch(clearedFilters);
  };

  // Filter data based on search term
  const filteredData = data?.data?.filter(item =>
    item.DES_ITEM.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.COD_ITEM.toLowerCase().includes(searchTerm.toLowerCase())
  ) || [];

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0,
    }).format(value);
  };

  const formatNumber = (value: number) => {
    return new Intl.NumberFormat('es-CO').format(value);
  };

  return (
    <div className="px-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-3xl font-bold text-gray-900">Dashboard de Inventario</h2>
          <p className="mt-1 text-sm text-gray-500">
            Gestiona y visualiza tu inventario en tiempo real
          </p>
        </div>
        <div className="mt-4 sm:mt-0 flex space-x-2">
          <Button onClick={handleRefresh} variant="outline" size="sm">
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Actualizar
          </Button>
          <Button variant="outline" size="sm">
            <Download className="h-4 w-4 mr-2" />
            Exportar
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      {data?.summary && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Existencia</CardTitle>
              <Package className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {formatNumber(data.summary.total_existencia)}
              </div>
              <p className="text-xs text-muted-foreground">
                unidades en inventario
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Valor Total</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {formatCurrency(data.summary.total_valor)}
              </div>
              <p className="text-xs text-muted-foreground">
                valor del inventario
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Ciudades</CardTitle>
              <MapPin className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {data.summary.total_ciudades}
              </div>
              <p className="text-xs text-muted-foreground">
                ubicaciones activas
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Empresas</CardTitle>
              <Building2 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {data.summary.total_empresas}
              </div>
              <p className="text-xs text-muted-foreground">
                empresas registradas
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Filter className="h-5 w-5 mr-2" />
            Filtros
          </CardTitle>
          <CardDescription>
            Filtra los datos del inventario según tus necesidades
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Empresa</label>
              <Select
                value={currentFilters.empresa || 'all'}
                onValueChange={(value) => handleFilterChange('empresa', value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder={optionsLoading ? 'Cargando opciones…' : 'Seleccionar empresa'} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas las empresas</SelectItem>
                  {options.empresas.map((empresa) => (
                    <SelectItem key={empresa} value={empresa}>
                      {empresa}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Ciudad</label>
              <Select
                value={currentFilters.ciudad || 'all'}
                onValueChange={(value) => handleFilterChange('ciudad', value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder={optionsLoading ? 'Cargando opciones…' : 'Seleccionar ciudad'} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas las ciudades</SelectItem>
                  {options.ciudades.map((ciudad) => (
                    <SelectItem key={ciudad} value={ciudad}>
                      {ciudad}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Grupo</label>
              <Select
                value={currentFilters.nom_gru || 'all'}
                onValueChange={(value) => handleFilterChange('nom_gru', value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder={optionsLoading ? 'Cargando opciones…' : 'Seleccionar grupo'} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los grupos</SelectItem>
                  {options.grupos.map((grupo) => (
                    <SelectItem key={grupo} value={grupo}>
                      {grupo}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Acciones</label>
              <Button 
                onClick={clearFilters} 
                variant="outline" 
                className="w-full"
              >
                Limpiar Filtros
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Data Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Inventario</CardTitle>
              <CardDescription>
                {data ? `${data.total} items encontrados` : 'Cargando...'}
              </CardDescription>
            </div>
            {data && (
              <Badge variant="secondary">
                Página {data.page} de {data.totalPages}
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="h-8 w-8 animate-spin text-blue-600" />
            </div>
          ) : error ? (
            <div className="text-center py-8 text-red-600">
              <p>Error: {error}</p>
              <Button onClick={handleRefresh} className="mt-4">
                Reintentar
              </Button>
            </div>
          ) : (
            <>
              <div className="rounded-md border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Código</TableHead>
                      <TableHead>Descripción</TableHead>
                      <TableHead>Grupo</TableHead>
                      <TableHead>Marca</TableHead>
                      <TableHead>Ciudad</TableHead>
                      <TableHead>Empresa</TableHead>
                      <TableHead className="text-right">Existencia</TableHead>
                      <TableHead className="text-right">Valor</TableHead>
                      <TableHead>Última Compra</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredData.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={9} className="text-center py-8 text-gray-500">
                          No se encontraron resultados
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredData.map((item, index) => (
                        <TableRow key={`${item.COD_ITEM}-${index}`}>
                          <TableCell className="font-medium">
                            {item.COD_ITEM}
                          </TableCell>
                          <TableCell className="max-w-xs truncate">
                            {item.DES_ITEM}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">
                              {item.NOM_GRU}
                            </Badge>
                          </TableCell>
                          <TableCell>{item.DES_MAR}</TableCell>
                          <TableCell>{item.ciudad}</TableCell>
                          <TableCell>{item.empresa}</TableCell>
                          <TableCell className="text-right font-medium">
                            {formatNumber(item.EXISTENCIA)}
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            {formatCurrency(item.VALOR)}
                          </TableCell>
                          <TableCell>
                            <div className="text-sm">
                              {new Date(item.ult_comp).toLocaleDateString('es-CO')}
                              <div className="text-xs text-gray-500">
                                {item.DiasUC} días
                              </div>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination */}
              {data && data.totalPages > 1 && (
                <div className="flex items-center justify-between mt-4">
                  <div className="text-sm text-gray-500">
                    Mostrando {((data.page - 1) * data.limit) + 1} a{' '}
                    {Math.min(data.page * data.limit, data.total)} de {data.total} resultados
                  </div>
                  <div className="flex items-center space-x-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handlePageChange(data.page - 1)}
                      disabled={!data.hasPrev}
                    >
                      <ChevronLeft className="h-4 w-4" />
                      Anterior
                    </Button>
                    <span className="text-sm text-gray-500">
                      {data.page} / {data.totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handlePageChange(data.page + 1)}
                      disabled={!data.hasNext}
                    >
                      Siguiente
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}