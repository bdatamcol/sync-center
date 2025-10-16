"use client";

import { useEffect, useState } from "react";

type CronEntry = {
  id: string;
  startedAt: string;
  finishedAt?: string;
  durationMs?: number;
  total?: number;
  updatedCount?: number;
  failedCount?: number;
  status: "success" | "failure" | "running";
  message?: string;
};

type CronDetails = {
  id: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  summary: {
    total: number;
    successful: number;
    failed: number;
  };
  results: Array<{
    sku: string;
    name: string;
    existencia?: number;
    precioAnterior?: number;
    precioActual?: number;
    success: boolean;
    message?: string;
    error?: string | null;
  }>;
};

function formatDuration(ms?: number) {
  if (!ms || ms < 0) return "-";
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (m > 0) return `${m}m ${r}s`;
  return `${r}s`;
}

function toISOStringLocal(dateStr: string | null) {
  if (!dateStr) return null;
  // datetime-local string to ISO
  const d = new Date(dateStr);
  return d.toISOString();
}

export default function CronHistoryPage() {
  const [entries, setEntries] = useState<CronEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");
  const [sort, setSort] = useState<"asc" | "desc">("desc");

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [details, setDetails] = useState<CronDetails | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState<string | null>(null);

  const fetchEntries = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (from) params.set("from", toISOStringLocal(from)!);
      if (to) params.set("to", toISOStringLocal(to)!);
      params.set("sort", sort);
      params.set("limit", "500");
      const res = await fetch(`/api/cron/history?${params.toString()}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Error al cargar historial");
      setEntries(json.data || []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEntries();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to, sort]);

  const handleExportCSV = () => {
    const header = [
      "Fecha Inicio",
      "Fecha Fin",
      "Duración",
      "Total",
      "Actualizados",
      "Fallidos",
      "Estado",
      "Mensaje",
    ];
    const rows = entries.map((e) => [
      new Date(e.startedAt).toLocaleString("es-ES"),
      e.finishedAt ? new Date(e.finishedAt).toLocaleString("es-ES") : "",
      formatDuration(e.durationMs),
      e.total ?? "",
      e.updatedCount ?? "",
      e.failedCount ?? "",
      e.status,
      e.message ?? "",
    ]);
    const csv = [header, ...rows]
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cron_historial_${Date.now()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const loadDetails = async (id: string) => {
    setSelectedId(id);
    setDetails(null);
    setDetailsError(null);
    setDetailsLoading(true);
    try {
      const res = await fetch(`/api/cron/history/${id}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Error al cargar detalles");
      setDetails(json.data);
    } catch (e: unknown) {
      setDetailsError(e instanceof Error ? e.message : String(e));
    } finally {
      setDetailsLoading(false);
    }
  };

  const closeDetails = () => {
    setSelectedId(null);
    setDetails(null);
    setDetailsError(null);
    setDetailsLoading(false);
  };

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-semibold">Historial de ejecuciones del cron</h1>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
        <div className="flex flex-col">
          <label className="text-sm text-gray-600">Desde</label>
          <input
            type="datetime-local"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="border rounded px-3 py-2"
          />
        </div>
        <div className="flex flex-col">
          <label className="text-sm text-gray-600">Hasta</label>
          <input
            type="datetime-local"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="border rounded px-3 py-2"
          />
        </div>
        <div className="flex flex-col">
          <label className="text-sm text-gray-600">Orden</label>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as "asc" | "desc")}
            className="border rounded px-3 py-2"
          >
            <option value="desc">Más reciente primero</option>
            <option value="asc">Más antiguo primero</option>
          </select>
        </div>
        <div className="flex gap-2">
          <button
            onClick={fetchEntries}
            className="bg-blue-600 text-white px-4 py-2 rounded"
            disabled={loading}
          >
            {loading ? "Cargando..." : "Actualizar"}
          </button>
          <button
            onClick={handleExportCSV}
            className="bg-gray-700 text-white px-4 py-2 rounded"
          >
            Exportar CSV
          </button>
        </div>
      </div>

      {error && (
        <div className="text-red-700 bg-red-100 border border-red-300 px-4 py-3 rounded">
          {error}
        </div>
      )}

      <div className="overflow-auto border rounded">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-100">
            <tr>
              <th className="px-4 py-2 text-left">Fecha de ejecución</th>
              <th className="px-4 py-2 text-left">Duración</th>
              <th className="px-4 py-2 text-left">Productos</th>
              <th className="px-4 py-2 text-left">Actualizados</th>
              <th className="px-4 py-2 text-left">Fallidos</th>
              <th className="px-4 py-2 text-left">Estado</th>
              <th className="px-4 py-2 text-left">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 && !loading && (
              <tr>
                <td className="px-4 py-6 text-center" colSpan={7}>
                  No hay ejecuciones registradas en el rango seleccionado.
                </td>
              </tr>
            )}
            {entries.map((e) => (
              <tr key={e.id} className="border-t">
                <td className="px-4 py-2">
                  <div className="font-medium">
                    {new Date(e.startedAt).toLocaleString("es-ES")}
                  </div>
                  {e.message && (
                    <div className="text-gray-600 text-xs">{e.message}</div>
                  )}
                </td>
                <td className="px-4 py-2">{formatDuration(e.durationMs)}</td>
                <td className="px-4 py-2">{e.total ?? "-"}</td>
                <td className="px-4 py-2">{e.updatedCount ?? "-"}</td>
                <td className="px-4 py-2">{e.failedCount ?? "-"}</td>
                <td className="px-4 py-2">
                  <span
                    className={`px-2 py-1 rounded text-xs ${
                      e.status === "success"
                        ? "bg-green-100 text-green-700"
                        : e.status === "failure"
                        ? "bg-red-100 text-red-700"
                        : "bg-yellow-100 text-yellow-700"
                    }`}
                  >
                    {e.status === "success" ? "Éxito" : e.status === "failure" ? "Fallo" : "Ejecutando"}
                  </span>
                </td>
                <td className="px-4 py-2">
                  <button
                    onClick={() => loadDetails(e.id)}
                    className="bg-indigo-600 text-white px-3 py-1 rounded"
                  >
                    Ver detalles
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal de detalles */}
      {selectedId && (
        <div className="fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center z-50">
          <div className="bg-white rounded shadow-lg max-w-4xl w-full mx-6">
            <div className="border-b px-6 py-4 flex justify-between items-center">
              <h2 className="text-lg font-semibold">Detalles de ejecución</h2>
              <button onClick={closeDetails} className="text-gray-600">Cerrar</button>
            </div>
            <div className="p-6 space-y-4 max-h-[70vh] overflow-auto">
              {detailsLoading && <div>Cargando detalles...</div>}
              {detailsError && (
                <div className="text-red-700 bg-red-100 border border-red-300 px-4 py-3 rounded">
                  {detailsError}
                </div>
              )}
              {details && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <div className="text-gray-600 text-sm">Inicio</div>
                      <div className="font-medium">
                        {new Date(details.startedAt).toLocaleString("es-ES")}
                      </div>
                    </div>
                    <div>
                      <div className="text-gray-600 text-sm">Fin</div>
                      <div className="font-medium">
                        {new Date(details.finishedAt).toLocaleString("es-ES")}
                      </div>
                    </div>
                    <div>
                      <div className="text-gray-600 text-sm">Duración</div>
                      <div className="font-medium">{formatDuration(details.durationMs)}</div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <div className="text-gray-600 text-sm">Total</div>
                      <div className="font-medium">{details.summary.total}</div>
                    </div>
                    <div>
                      <div className="text-gray-600 text-sm">Actualizados</div>
                      <div className="font-medium">{details.summary.successful}</div>
                    </div>
                    <div>
                      <div className="text-gray-600 text-sm">Fallidos</div>
                      <div className="font-medium">{details.summary.failed}</div>
                    </div>
                  </div>

                  <div>
                    <h3 className="font-semibold mb-2">Resultados</h3>
                    <div className="overflow-auto border rounded">
                      <table className="min-w-full text-sm">
                        <thead className="bg-gray-100">
                          <tr>
                            <th className="px-4 py-2 text-left">SKU</th>
                            <th className="px-4 py-2 text-left">Descripción</th>
                            <th className="px-4 py-2 text-left">Precio</th>
                            <th className="px-4 py-2 text-left">Estado</th>
                            <th className="px-4 py-2 text-left">Mensaje</th>
                          </tr>
                        </thead>
                        <tbody>
                          {details.results.map((r, idx) => (
                            <tr key={`${r.sku}-${idx}`} className="border-t">
                              <td className="px-4 py-2">{r.sku}</td>
                              <td className="px-4 py-2">{r.name}</td>
                              <td className="px-4 py-2">
                                {typeof r.precioActual === "number" ? r.precioActual.toFixed(2) : "-"}
                              </td>
                              <td className="px-4 py-2">
                                <span
                                  className={`px-2 py-1 rounded text-xs ${
                                    r.success
                                      ? "bg-green-100 text-green-700"
                                      : "bg-red-100 text-red-700"
                                  }`}
                                >
                                  {r.success ? "Éxito" : "Fallo"}
                                </span>
                              </td>
                              <td className="px-4 py-2">
                                {r.error ? (
                                  <span className="text-red-700">{r.error}</span>
                                ) : (
                                  r.message || ""
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
  );
}