import 'server-only';
import { apiJson, BACKEND } from './auth-server';

export const demoEnabled = () => process.env.DEMO_CONTROLS_ENABLED === 'true' && !!process.env.DEMO_CONTROL_TOKEN;
export async function demoProxy(path: string, method = 'GET', body?: unknown) {
  if (!demoEnabled()) return apiJson({ message: 'ไม่ได้เปิดตัวควบคุมเดโม' }, 404);
  try {
    const response = await fetch(`${BACKEND}/api/demo${path}`, { method, cache: 'no-store',
      headers: { Authorization: `Bearer ${process.env.DEMO_CONTROL_TOKEN}`, 'Content-Type': 'application/json' },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(45000) });
    return apiJson(await response.json(), response.status);
  } catch { return apiJson({ message: 'เชื่อมต่อตัวควบคุมเวลาไม่ได้' }, 502); }
}
