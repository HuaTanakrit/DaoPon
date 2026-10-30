import { NextRequest } from 'next/server';
import { apiJson, BACKEND, sameOrigin, SESSION_COOKIE, sessionToken } from '@/lib/auth-server';
export async function GET(request: NextRequest, { params }: { params: Promise<{ action: string }> }) {
  if ((await params).action !== 'me') return apiJson({ message: 'ไม่พบหน้านี้' }, 404);
  const token = sessionToken(request);
  if (!token) return apiJson({ user: null }, 401);
  try {
    const response = await fetch(`${BACKEND}/api/auth/me`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store', signal: AbortSignal.timeout(15000) });
    const result = apiJson(await response.json(), response.status);
    if (response.status === 401) result.cookies.delete(SESSION_COOKIE);
    return result;
  } catch { return apiJson({ message: 'เชื่อมต่อระบบบัญชีไม่ได้ กรุณาลองอีกครั้ง' }, 502); }
}
export async function POST(request: NextRequest, { params }: { params: Promise<{ action: string }> }) {
  if (!sameOrigin(request)) return apiJson({ message: 'คำขอไม่ถูกต้อง' }, 403);
  const { action } = await params;
  if (!['register', 'login', 'logout'].includes(action)) return apiJson({ message: 'ไม่พบหน้านี้' }, 404);
  try {
    let body: unknown = {};
    if (action !== 'logout') {
      const text = await request.text();
      if (text.length > 8192) return apiJson({ message: 'ข้อมูลไม่ถูกต้อง' }, 400);
      try { body = JSON.parse(text); } catch { return apiJson({ message: 'ข้อมูลไม่ถูกต้อง' }, 400); }
    }
    const token = sessionToken(request), guest = request.cookies.get('touchline_player')?.value;
    const response = await fetch(`${BACKEND}/api/auth/${action}`, { method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(guest ? { 'x-guest-token': guest } : {}) },
      body: JSON.stringify(body), cache: 'no-store', signal: AbortSignal.timeout(20000) });
    const data = await response.json();
    if (!response.ok) return apiJson(data, response.status);
    const result = apiJson(action === 'logout' ? { ok: true } : { user: data.user });
    if (action === 'logout') result.cookies.delete(SESSION_COOKIE);
    else { result.cookies.set(SESSION_COOKIE, data.token, { httpOnly: true, sameSite: 'lax', secure: request.nextUrl.protocol === 'https:', path: '/', maxAge: 30 * 24 * 3600000 }); result.cookies.delete('touchline_player'); }
    return result;
  } catch { return apiJson({ message: 'เชื่อมต่อระบบบัญชีไม่ได้ กรุณาลองอีกครั้ง' }, 502); }
}
