import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
export const SESSION_COOKIE = 'touchline_session';
export const BACKEND = process.env.BACKEND_URL || 'http://127.0.0.1:3001';
export const apiJson = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
export function sameOrigin(request: NextRequest) {
  try { const origin = new URL(request.headers.get('origin') || ''); return ['http:', 'https:'].includes(origin.protocol) && origin.host === request.headers.get('host'); }
  catch { return false; }
}
export function sessionToken(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  return token && /^[a-f0-9]{64}$/.test(token) ? token : null;
}
