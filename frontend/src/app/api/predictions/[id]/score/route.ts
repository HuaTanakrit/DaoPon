import { NextRequest } from 'next/server';
import { apiJson, BACKEND, sameOrigin, sessionToken } from '@/lib/auth-server';

const valid = (id: string) => /^\d+$/.test(id) && Number.isSafeInteger(Number(id)) && Number(id) > 0;
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const token = sessionToken(request);
  if (!token) return apiJson({ message: 'กรุณาเข้าสู่ระบบ' }, 401);
  const { id } = await params, team = request.nextUrl.searchParams.get('team') || '';
  if (!valid(id) || !valid(team)) return apiJson({ message: 'แมตช์หรือสโมสรไม่ถูกต้อง' }, 400);
  try {
    const response = await fetch(`${BACKEND}/api/predictions/${id}/score?team=${team}`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store', signal: AbortSignal.timeout(15000) });
    return apiJson(await response.json(), response.status);
  } catch { return apiJson({ message: 'โหลดคำทำนายสกอร์ไม่สำเร็จ' }, 502); }
}
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(request)) return apiJson({ message: 'คำขอไม่ถูกต้อง' }, 403);
  const token = sessionToken(request);
  if (!token) return apiJson({ message: 'กรุณาเข้าสู่ระบบ' }, 401);
  const { id } = await params;
  if (!valid(id)) return apiJson({ message: 'แมตช์ไม่ถูกต้อง' }, 400);
  let body: unknown;
  try { const text = await request.text(); if (text.length > 4096) return apiJson({ message: 'ข้อมูลไม่ถูกต้อง' }, 400); body = JSON.parse(text); }
  catch { return apiJson({ message: 'ข้อมูลไม่ถูกต้อง' }, 400); }
  try {
    const response = await fetch(`${BACKEND}/api/predictions/${id}/score`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body), cache: 'no-store', signal: AbortSignal.timeout(15000) });
    return apiJson(await response.json(), response.status);
  } catch { return apiJson({ message: 'บันทึกคำทำนายสกอร์ไม่สำเร็จ' }, 502); }
}
