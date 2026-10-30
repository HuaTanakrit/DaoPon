import 'server-only';
import { cookies } from 'next/headers';
import { apiJson, BACKEND, SESSION_COOKIE } from './auth-server';

export const demoEnabled = () => process.env.DEMO_CONTROLS_ENABLED === 'true' && !!process.env.DEMO_CONTROL_TOKEN;
export async function demoProxy(path: string, method = 'GET', body?: unknown) {
  if (!demoEnabled()) return apiJson({ message: 'ไม่ได้เปิดตัวควบคุมเดโม' }, 404);
  try {
    // Production demo controls are restricted to explicitly listed account emails.
    if (process.env.VERCEL || process.env.DEMO_ADMIN_EMAILS) {
      const allowed = (process.env.DEMO_ADMIN_EMAILS || '').split(',').map((email) => email.trim().toLowerCase()).filter(Boolean);
      const token = (await cookies()).get(SESSION_COOKIE)?.value;
      if (!token || !/^[a-f0-9]{64}$/.test(token)) return apiJson({ message: 'กรุณาเข้าสู่ระบบด้วยบัญชีผู้ดูแลเดโม' }, 401);
      const auth = await fetch(`${BACKEND}/api/auth/me`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store', signal: AbortSignal.timeout(15000) });
      if (!auth.ok) return apiJson({ message: 'กรุณาเข้าสู่ระบบใหม่' }, 401);
      const account = await auth.json();
      if (!allowed.includes(String(account.user?.email || '').toLowerCase())) return apiJson({ message: 'บัญชีนี้ไม่มีสิทธิ์ควบคุมเวลาเดโม' }, 403);
    }
    const response = await fetch(`${BACKEND}/api/demo${path}`, { method, cache: 'no-store',
      headers: { Authorization: `Bearer ${process.env.DEMO_CONTROL_TOKEN}`, 'Content-Type': 'application/json' },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(45000) });
    return apiJson(await response.json(), response.status);
  } catch { return apiJson({ message: 'เชื่อมต่อตัวควบคุมเวลาไม่ได้' }, 502); }
}
