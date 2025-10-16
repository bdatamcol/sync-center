import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';

export const dynamic = 'force-dynamic';

async function openDb() {
  const HISTORY_DB_PATH = path.resolve(process.cwd(), 'cron_history.db');
  const db = await open({ filename: HISTORY_DB_PATH, driver: sqlite3.Database });
  return db;
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const searchParams = url.searchParams;
    const fromParam = searchParams.get('from');
    const toParam = searchParams.get('to');
    const sortParam = searchParams.get('sort') || 'desc';
    const limitParam = searchParams.get('limit');
    const offsetParam = searchParams.get('offset');

    const from = fromParam ? new Date(fromParam) : null;
    const to = toParam ? new Date(toParam) : null;
    const sort = sortParam === 'asc' ? 'asc' : 'desc';
    const limit = limitParam ? Math.max(1, Math.min(1000, parseInt(limitParam))) : 200;
    const offset = offsetParam ? Math.max(0, parseInt(offsetParam)) : 0;

    const db = await openDb();
    const whereClauses: string[] = [];
    const params: string[] = [];
    if (from) {
      whereClauses.push('start_time >= ?');
      params.push(from.toISOString());
    }
    if (to) {
      whereClauses.push('start_time <= ?');
      params.push(to.toISOString());
    }
    const where = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : '';
    const order = sort === 'asc' ? 'ASC' : 'DESC';

    const countRow = await db.get<{ cnt: number }>(`SELECT COUNT(1) as cnt FROM cron_executions ${where}`, params);
    const totalCount = countRow?.cnt ?? 0;

    const dataRows = await db.all<Array<{
      id: number;
      start_time: string;
      end_time: string | null;
      status: string;
      total_products: number | null;
      successful_products: number | null;
      failed_products: number | null;
      duration: number | null;
      error_message: string | null;
    }>>(
      `SELECT id, start_time, end_time, status, total_products, successful_products, failed_products, duration, error_message
       FROM cron_executions ${where}
       ORDER BY start_time ${order}
       LIMIT ? OFFSET ?`,
      ...params,
      limit,
      offset
    );

    const mapped = (dataRows || []).map((r) => ({
      id: String(r.id),
      startedAt: r.start_time,
      finishedAt: r.end_time,
      durationMs: r.duration,
      total: r.total_products,
      updatedCount: r.successful_products,
      failedCount: r.failed_products,
      status: r.status === 'completed' ? 'success' : r.status === 'failed' ? 'failure' : 'running',
      message: r.error_message || null,
    }));

    return NextResponse.json({ success: true, data: mapped, count: totalCount, offset, limit, sort });
  } catch (e: unknown) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}