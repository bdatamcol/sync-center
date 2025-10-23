"use client"

import { useEffect, useState } from "react"
import { Clock, Download, RefreshCw, Calendar, TrendingUp } from "lucide-react"

type CronEntry = {
  id: string
  startedAt: string
  finishedAt?: string
  durationMs?: number
  total?: number
  updatedCount?: number
  failedCount?: number
  status: "success" | "failure" | "running"
  message?: string
}

type CronDetails = {
  id: string
  startedAt: string
  finishedAt: string
  durationMs: number
  summary: {
    total: number
    successful: number
    failed: number
  }
  results: Array<{
    sku: string
    name: string
    existencia?: number
    precioAnterior?: number
    precioActual?: number
    success: boolean
    message?: string
    error?: string | null
  }>
}

function formatDuration(ms?: number) {
  if (!ms || ms < 0) return "-"
  const s = Math.floor(ms / 1000)
  const m = Math.floor(s / 60)
  const r = s % 60
  if (m > 0) return `${m}m ${r}s`
  return `${r}s`
}

function toISOStringLocal(dateStr: string | null) {
  if (!dateStr) return null
  const d = new Date(dateStr)
  return d.toISOString()
}

export default function CronHistoryPage() {
  const [entries, setEntries] = useState<CronEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [from, setFrom] = useState<string>("")
  const [to, setTo] = useState<string>("")
  const [sort, setSort] = useState<"asc" | "desc">("desc")

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [details, setDetails] = useState<CronDetails | null>(null)
  const [detailsLoading, setDetailsLoading] = useState(false)
  const [detailsError, setDetailsError] = useState<string | null>(null)

  const fetchEntries = async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (from) params.set("from", toISOStringLocal(from)!)
      if (to) params.set("to", toISOStringLocal(to)!)
      params.set("sort", sort)
      params.set("limit", "500")
      const res = await fetch(`/api/cron/history?${params.toString()}`)
      const json = await res.json()
      if (!json.success) throw new Error(json.error || "Error al cargar historial")
      setEntries(json.data || [])
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchEntries()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to, sort])

  const handleExportCSV = () => {
    const header = ["Fecha Inicio", "Fecha Fin", "Duración", "Total", "Actualizados", "Fallidos", "Estado", "Mensaje"]
    const rows = entries.map((e) => [
      new Date(e.startedAt).toLocaleString("es-ES"),
      e.finishedAt ? new Date(e.finishedAt).toLocaleString("es-ES") : "",
      formatDuration(e.durationMs),
      e.total ?? "",
      e.updatedCount ?? "",
      e.failedCount ?? "",
      e.status,
      e.message ?? "",
    ])
    const csv = [header, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n")
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `cron_historial_${Date.now()}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const loadDetails = async (id: string) => {
    setSelectedId(id)
    setDetails(null)
    setDetailsError(null)
    setDetailsLoading(true)
    try {
      const res = await fetch(`/api/cron/history/${id}`)
      const json = await res.json()
      if (!json.success) throw new Error(json.error || "Error al cargar detalles")
      setDetails(json.data)
    } catch (e: unknown) {
      setDetailsError(e instanceof Error ? e.message : String(e))
    } finally {
      setDetailsLoading(false)
    }
  }

  const closeDetails = () => {
    setSelectedId(null)
    setDetails(null)
    setDetailsError(null)
    setDetailsLoading(false)
  }

  const stats = {
    total: entries.length,
    successful: entries.filter((e) => e.status === "success").length,
    failed: entries.filter((e) => e.status === "failure").length,
    running: entries.filter((e) => e.status === "running").length,
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50/30">
      <div className="mx-auto space-y-6">
        <div className="flex justify-between items-center bg-gradient-to-r from-primary/10 via-secondary/10 to-primary/5 p-6 rounded-xl border border-primary/20">
          <div>
            <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
              Historial de Ejecuciones CRON
            </h1>
            <p className="text-sm text-muted-foreground mt-1">Monitorea y analiza las ejecuciones automáticas de sincronización</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-lg shadow-md p-6 border-l-4 border-blue-500">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 font-medium">Total</p>
                <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
              </div>
              <TrendingUp className="w-8 h-8 text-blue-500" />
            </div>
          </div>
          <div className="bg-white rounded-lg shadow-md p-6 border-l-4 border-green-500">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 font-medium">Exitosas</p>
                <p className="text-2xl font-bold text-gray-900">{stats.successful}</p>
              </div>
              <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center">
                <span className="text-green-600 font-bold">✓</span>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-lg shadow-md p-6 border-l-4 border-red-500">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 font-medium">Fallidas</p>
                <p className="text-2xl font-bold text-gray-900">{stats.failed}</p>
              </div>
              <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center">
                <span className="text-red-600 font-bold">✕</span>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-lg shadow-md p-6 border-l-4 border-yellow-500">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 font-medium">En Ejecución</p>
                <p className="text-2xl font-bold text-gray-900">{stats.running}</p>
              </div>
              <Clock className="w-8 h-8 text-yellow-500" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-md p-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
            <div className="flex flex-col">
              <label className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                Desde
              </label>
              <input
                type="datetime-local"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="border border-gray-300 rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
              />
            </div>
            <div className="flex flex-col">
              <label className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                Hasta
              </label>
              <input
                type="datetime-local"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="border border-gray-300 rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
              />
            </div>
            <div className="flex flex-col">
              <label className="text-sm font-medium text-gray-700 mb-2">Orden</label>
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as "asc" | "desc")}
                className="border border-gray-300 rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
              >
                <option value="desc">Más reciente primero</option>
                <option value="asc">Más antiguo primero</option>
              </select>
            </div>
            <div className="flex gap-2">
              <button
                onClick={fetchEntries}
                className="flex-1 bg-gradient-to-r from-blue-600 to-blue-700 text-white px-4 py-2.5 rounded-lg font-medium hover:from-blue-700 hover:to-blue-800 transition-all shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                disabled={loading}
              >
                <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
                {loading ? "Cargando..." : "Actualizar"}
              </button>
              <button
                onClick={handleExportCSV}
                className="flex-1 bg-gradient-to-r from-gray-700 to-gray-800 text-white px-4 py-2.5 rounded-lg font-medium hover:from-gray-800 hover:to-gray-900 transition-all shadow-md hover:shadow-lg flex items-center justify-center gap-2"
              >
                <Download className="w-4 h-4" />
                CSV
              </button>
            </div>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border-l-4 border-red-500 text-red-700 px-6 py-4 rounded-lg shadow-md">
            <p className="font-medium">Error</p>
            <p className="text-sm">{error}</p>
          </div>
        )}

        <div className="bg-white rounded-xl shadow-md overflow-hidden">
          <div className="overflow-auto">
            <table className="min-w-full">
              <thead className="bg-gradient-to-r from-gray-50 to-blue-50">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                    Fecha de ejecución
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                    Duración
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                    Productos
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                    Actualizados
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                    Fallidos
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                    Estado
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {entries.length === 0 && !loading && (
                  <tr>
                    <td className="px-6 py-12 text-center text-gray-500" colSpan={7}>
                      <Clock className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                      <p className="font-medium">No hay ejecuciones registradas</p>
                      <p className="text-sm">en el rango seleccionado</p>
                    </td>
                  </tr>
                )}
                {entries.map((e) => (
                  <tr key={e.id} className="hover:bg-blue-50/50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="font-medium text-gray-900">{new Date(e.startedAt).toLocaleString("es-ES")}</div>
                      {e.message && <div className="text-gray-600 text-sm mt-1">{e.message}</div>}
                    </td>
                    <td className="px-6 py-4 text-gray-700 font-medium">{formatDuration(e.durationMs)}</td>
                    <td className="px-6 py-4 text-gray-700">{e.total ?? "-"}</td>
                    <td className="px-6 py-4">
                      <span className="text-green-700 font-medium">{e.updatedCount ?? "-"}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-red-700 font-medium">{e.failedCount ?? "-"}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium border ${
                          e.status === "success"
                            ? "bg-green-50 text-green-700 border-green-200"
                            : e.status === "failure"
                              ? "bg-red-50 text-red-700 border-red-200"
                              : "bg-yellow-50 text-yellow-700 border-yellow-200"
                        }`}
                      >
                        {e.status === "success" ? "Éxito" : e.status === "failure" ? "Fallo" : "Ejecutando"}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <button
                        onClick={() => loadDetails(e.id)}
                        className="bg-gradient-to-r from-blue-600 to-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium hover:from-blue-700 hover:to-blue-800 transition-all shadow-sm hover:shadow-md"
                      >
                        Ver detalles
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {selectedId && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl max-w-5xl w-full max-h-[85vh] flex flex-col">
              <div className="border-b border-gray-200 px-8 py-6 flex justify-between items-center bg-gradient-to-r from-blue-50 to-white rounded-t-2xl">
                <h2 className="text-2xl font-bold text-gray-900">Detalles de ejecución</h2>
                <button
                  onClick={closeDetails}
                  className="text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg p-2 transition-colors"
                >
                  <span className="text-2xl">×</span>
                </button>
              </div>
              <div className="p-8 space-y-6 overflow-auto flex-1">
                {detailsLoading && (
                  <div className="flex items-center justify-center py-12">
                    <RefreshCw className="w-8 h-8 text-blue-600 animate-spin" />
                    <span className="ml-3 text-gray-600">Cargando detalles...</span>
                  </div>
                )}
                {detailsError && (
                  <div className="bg-red-50 border-l-4 border-red-500 text-red-700 px-6 py-4 rounded-lg">
                    <p className="font-medium">Error</p>
                    <p className="text-sm">{detailsError}</p>
                  </div>
                )}
                {details && (
                  <div className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
                        <div className="text-blue-700 text-sm font-medium mb-1">Inicio</div>
                        <div className="font-semibold text-gray-900">
                          {new Date(details.startedAt).toLocaleString("es-ES")}
                        </div>
                      </div>
                      <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
                        <div className="text-blue-700 text-sm font-medium mb-1">Fin</div>
                        <div className="font-semibold text-gray-900">
                          {new Date(details.finishedAt).toLocaleString("es-ES")}
                        </div>
                      </div>
                      <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
                        <div className="text-blue-700 text-sm font-medium mb-1">Duración</div>
                        <div className="font-semibold text-gray-900">{formatDuration(details.durationMs)}</div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                        <div className="text-gray-600 text-sm font-medium mb-1">Total</div>
                        <div className="text-2xl font-bold text-gray-900">{details.summary.total}</div>
                      </div>
                      <div className="bg-green-50 rounded-lg p-4 border border-green-200">
                        <div className="text-green-700 text-sm font-medium mb-1">Actualizados</div>
                        <div className="text-2xl font-bold text-green-700">{details.summary.successful}</div>
                      </div>
                      <div className="bg-red-50 rounded-lg p-4 border border-red-200">
                        <div className="text-red-700 text-sm font-medium mb-1">Fallidos</div>
                        <div className="text-2xl font-bold text-red-700">{details.summary.failed}</div>
                      </div>
                    </div>

                    <div>
                      <h3 className="text-lg font-bold text-gray-900 mb-4">Resultados detallados</h3>
                      <div className="overflow-auto border border-gray-200 rounded-lg">
                        <table className="min-w-full">
                          <thead className="bg-gradient-to-r from-gray-50 to-blue-50">
                            <tr>
                              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">SKU</th>
                              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">
                                Descripción
                              </th>
                              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">
                                Precio
                              </th>
                              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">
                                Estado
                              </th>
                              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">
                                Mensaje
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-200 bg-white">
                            {details.results.map((r, idx) => (
                              <tr key={`${r.sku}-${idx}`} className="hover:bg-blue-50/50 transition-colors">
                                <td className="px-4 py-3 font-mono text-sm text-gray-900">{r.sku}</td>
                                <td className="px-4 py-3 text-sm text-gray-700">{r.name}</td>
                                <td className="px-4 py-3 text-sm font-medium text-gray-900">
                                  {typeof r.precioActual === "number" ? `$${r.precioActual.toFixed(2)}` : "-"}
                                </td>
                                <td className="px-4 py-3">
                                  <span
                                    className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${
                                      r.success
                                        ? "bg-green-50 text-green-700 border-green-200"
                                        : "bg-red-50 text-red-700 border-red-200"
                                    }`}
                                  >
                                    {r.success ? "Éxito" : "Fallo"}
                                  </span>
                                </td>
                                <td className="px-4 py-3 text-sm">
                                  {r.error ? (
                                    <span className="text-red-700 font-medium">{r.error}</span>
                                  ) : (
                                    <span className="text-gray-600">{r.message || "-"}</span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
