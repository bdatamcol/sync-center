import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: idParam } = await context.params;
    const id = parseInt(idParam, 10);
    if (Number.isNaN(id)) {
      return NextResponse.json({ success: false, error: 'ID inválido' }, { status: 400 });
    }
    const HISTORY_DB_PATH = path.resolve(process.cwd(), 'cron_history.db');
    const db = await open({ filename: HISTORY_DB_PATH, driver: sqlite3.Database });
    const row = await db.get<{
      id: number;
      start_time: string;
      end_time: string | null;
      status: string;
      total_products: number | null;
      successful_products: number | null;
      failed_products: number | null;
      duration: number | null;
      error_message: string | null;
      details: string | null;
    }>(
      `SELECT id, start_time, end_time, status, total_products, successful_products, failed_products, duration, error_message, details
       FROM cron_executions WHERE id = ?`,
      id
    );
    if (!row) {
      return NextResponse.json({ success: false, error: 'Detalles no encontrados' }, { status: 404 });
    }
    type CronRunResult = {
      sku: string;
      name: string;
      existencia?: number;
      precioAnterior?: number;
      precioActual?: number;
      success: boolean;
      message?: string;
      error?: string | null;
    };
    let parsedDetails: CronRunResult[] | null = null;
    try {
      parsedDetails = row.details ? (JSON.parse(row.details) as unknown as CronRunResult[]) : null;
    } catch {
      parsedDetails = null;
    }
    const data = {
      id: String(row.id),
      startedAt: row.start_time,
      finishedAt: row.end_time,
      durationMs: row.duration,
      status: row.status === 'completed' ? 'success' : row.status === 'failed' ? 'failure' : 'running',
      summary: {
        total: row.total_products,
        successful: row.successful_products,
        failed: row.failed_products,
      },
      error: row.error_message || null,
      results: Array.isArray(parsedDetails) ? parsedDetails : [],
    };
    return NextResponse.json({ success: true, data });
  } catch (e: unknown) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}