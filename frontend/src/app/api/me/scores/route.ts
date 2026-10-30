import { NextRequest } from 'next/server';
import { apiJson, BACKEND, sessionToken } from '@/lib/auth-server';
export async function GET(request: NextRequest) {
  const token = sessionToken(request);
  if (!token) return apiJson({ message: 'กรุณาเข้าสู่ระบบ' }, 401);
  try {
    const response = await fetch(`${BACKEND}/api/me/scores`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store', signal: AbortSignal.timeout(15000) });
    return apiJson(await response.json(), response.status);
  } catch { return apiJson({ message: 'โหลดคะแนนไม่สำเร็จ กรุณาลองอีกครั้ง' }, 502); }
}
