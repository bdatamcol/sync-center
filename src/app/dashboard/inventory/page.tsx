'use client';

import { useState, useMemo } from 'react';
import { useInventory } from '@/hooks/use-inventory';
import { useFilterOptions } from '@/hooks/use-filter-options';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Table } from '@/components/ui/table';
import { 
  Search, 
  Filter, 
  Download, 
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Package,
  MapPin,
  Building2,
  Tag
} from 'lucide-react';

export default function InventoryPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [filters, setFilters] = useState({
    ciudad: '',
    empresa: '',
    nom_gru: ''
  });

  const { data, loading, error, refetch } = useInventory({
    ...filters,
    page: currentPage,
    limit: pageSize
  });

  const { options, loading: optionsLoading } = useFilterOptions();

  // Filtrar datos localmente por término de búsqueda
  const filteredData = useMemo(() => {
    if (!data?.data || !searchTerm) return data?.data || [];
    
    return data.data.filter(item => 
      item.DES_ITEM.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.COD_ITEM.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.NOM_GRU.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.DES_MAR.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [data?.data, searchTerm]);

  const handleFilterChange = (key: string, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value }));
    setCurrentPage(1);
  };

  const handleRefresh = () => {
    refetch({ ...filters, page: currentPage, limit: pageSize });
  };

  const formatCurrency = (value: number) => 
    new Intl.NumberFormat('es-CO', { 
      style: 'currency', 
      currency: 'COP',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value);

  const formatNumber = (value: number) => 
    new Intl.NumberFormat('es-CO').format(value);

  const formatDate = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleDateString('es-ES');
    } catch {
      return dateString;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Inventario Completo</h1>
          <p className="text-gray-600">
            {data?.total ? `${formatNumber(data.total)} productos encontrados` : 'Cargando...'}
          </p>
        </div>
        
        <div className="flex items-center space-x-2">
          <Button 
            onClick={handleRefresh} 
            variant="outline" 
            size="sm"
            disabled={loading}
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Actualizar
          </Button>
          <Button variant="outline" size="sm">
            <Download className="w-4 h-4 mr-2" />
            Exportar
          </Button>
        </div>
      </div>

      {/* Filtros y búsqueda */}
      <Card className="p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          {/* Búsqueda */}
          <div className="lg:col-span-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <Input
                placeholder="Buscar por código, descripción, grupo o marca..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          {/* Filtro Ciudad */}
          <div>
            <Select
              value={filters.ciudad}
              onValueChange={(value) => handleFilterChange('ciudad', value)}
            >
              <option value="">Todas las ciudades</option>
              {options.ciudades.map(ciudad => (
                <option key={ciudad} value={ciudad}>{ciudad}</option>
              ))}
            </Select>
          </div>

          {/* Filtro Empresa */}
          <div>
            <Select
              value={filters.empresa}
              onValueChange={(value) => handleFilterChange('empresa', value)}
            >
              <option value="">Todas las empresas</option>
              {options.empresas.map(empresa => (
                <option key={empresa} value={empresa}>{empresa}</option>
              ))}
            </Select>
          </div>

          {/* Filtro Grupo */}
          <div>
            <Select
              value={filters.nom_gru}
              onValueChange={(value) => handleFilterChange('nom_gru', value)}
            >
              <option value="">Todos los grupos</option>
              {options.grupos.map(grupo => (
                <option key={grupo} value={grupo}>{grupo}</option>
              ))}
            </Select>
          </div>
        </div>

        {/* Filtros activos */}
        {(filters.ciudad || filters.empresa || filters.nom_gru || searchTerm) && (
          <div className="flex flex-wrap items-center gap-2 mt-4 pt-4 border-t border-gray-200">
            <span className="text-sm text-gray-600">Filtros activos:</span>
            {filters.ciudad && (
              <Badge variant="secondary" className="flex items-center gap-1">
                <MapPin className="w-3 h-3" />
                {filters.ciudad}
                <button 
                  onClick={() => handleFilterChange('ciudad', '')}
                  className="ml-1 hover:text-red-600"
                >
                  ×
                </button>
              </Badge>
            )}
            {filters.empresa && (
              <Badge variant="secondary" className="flex items-center gap-1">
                <Building2 className="w-3 h-3" />
                {filters.empresa}
                <button 
                  onClick={() => handleFilterChange('empresa', '')}
                  className="ml-1 hover:text-red-600"
                >
                  ×
                </button>
              </Badge>
            )}
            {filters.nom_gru && (
              <Badge variant="secondary" className="flex items-center gap-1">
                <Tag className="w-3 h-3" />
                {filters.nom_gru}
                <button 
                  onClick={() => handleFilterChange('nom_gru', '')}
                  className="ml-1 hover:text-red-600"
                >
                  ×
                </button>
              </Badge>
            )}
            {searchTerm && (
              <Badge variant="secondary" className="flex items-center gap-1">
                <Search className="w-3 h-3" />
                "{searchTerm}"
                <button 
                  onClick={() => setSearchTerm('')}
                  className="ml-1 hover:text-red-600"
                >
                  ×
                </button>
              </Badge>
            )}
          </div>
        )}
      </Card>

      {/* Tabla de inventario */}
      <Card className="overflow-hidden">
        {loading ? (
          <div className="p-6">
            <div className="space-y-4">
              {[...Array(10)].map((_, i) => (
                <div key={i} className="flex space-x-4">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-4 w-20" />
                </div>
              ))}
            </div>
          </div>
        ) : error ? (
          <div className="p-8 text-center">
            <Package className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Error al cargar inventario</h3>
            <p className="text-gray-600 mb-4">{error}</p>
            <Button onClick={handleRefresh}>Reintentar</Button>
          </div>
        ) : filteredData.length === 0 ? (
          <div className="p-8 text-center">
            <Package className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">No se encontraron productos</h3>
            <p className="text-gray-600">Intenta ajustar los filtros de búsqueda</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left py-3 px-4 font-medium text-gray-700">Código</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-700">Descripción</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-700">Grupo</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-700">Marca</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-700">Ciudad</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-700">Bodega</th>
                  <th className="text-right py-3 px-4 font-medium text-gray-700">Existencia</th>
                  <th className="text-right py-3 px-4 font-medium text-gray-700">Valor</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-700">Última Compra</th>
                </tr>
              </thead>
              <tbody>
                {filteredData.map((item, index) => (
                  <tr key={index} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-3 px-4 font-mono text-xs">{item.COD_ITEM}</td>
                    <td className="py-3 px-4 max-w-xs">
                      <div className="truncate" title={item.DES_ITEM}>
                        {item.DES_ITEM}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <Badge variant="outline" className="text-xs">
                        {item.NOM_GRU}
                      </Badge>
                    </td>
                    <td className="py-3 px-4 text-xs">{item.DES_MAR}</td>
                    <td className="py-3 px-4">
                      <Badge variant="secondary" className="text-xs">
                        {item.ciudad}
                      </Badge>
                    </td>
                    <td className="py-3 px-4 text-xs">{item.NOM_BOD}</td>
                    <td className="py-3 px-4 text-right font-medium">
                      <span className={item.EXISTENCIA > 0 ? 'text-green-600' : 'text-red-600'}>
                        {formatNumber(item.EXISTENCIA)}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right font-medium">
                      {formatCurrency(item.VALOR)}
                    </td>
                    <td className="py-3 px-4 text-xs text-gray-600">
                      {formatDate(item.ult_comp)}
                      <div className="text-xs text-gray-400">
                        ({item.DiasUC} días)
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Paginación */}
        {data && data.totalPages > 1 && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200">
            <div className="flex items-center space-x-2">
              <span className="text-sm text-gray-600">Mostrar</span>
              <Select
                value={pageSize.toString()}
                onValueChange={(value) => {
                  setPageSize(parseInt(value));
                  setCurrentPage(1);
                }}
              >
                <option value="10">10</option>
                <option value="25">25</option>
                <option value="50">50</option>
                <option value="100">100</option>
              </Select>
              <span className="text-sm text-gray-600">por página</span>
            </div>

            <div className="flex items-center space-x-2">
              <span className="text-sm text-gray-600">
                Página {data.page} de {data.totalPages}
              </span>
              
              <div className="flex items-center space-x-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  disabled={!data.hasPrev || loading}
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(prev => Math.min(data.totalPages, prev + 1))}
                  disabled={!data.hasNext || loading}
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}