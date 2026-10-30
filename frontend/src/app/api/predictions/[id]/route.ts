import { NextRequest, NextResponse } from 'next/server';

const cookieName = 'touchline_session';
const backend = process.env.BACKEND_URL || 'http://127.0.0.1:3001';
const valid = (id: string) => /^\d+$/.test(id) && Number.isSafeInteger(Number(id)) && Number(id) > 0;
const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { 'Cache-Control': 'no-store' } });

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const team = request.nextUrl.searchParams.get('team') || '';
  if (!valid(id) || !valid(team)) return json({ message: 'แมตช์หรือสโมสรไม่ถูกต้อง' }, 400);
  const token = request.cookies.get(cookieName)?.value;
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return json({ message: 'กรุณาเข้าสู่ระบบ' }, 401);
  try {
    const response = await fetch(`${backend}/api/predictions/${id}?team=${team}`, {
      headers: { Authorization: `Bearer ${token}` }, cache: 'no-store', signal: AbortSignal.timeout(15000),
    });
    return json(await response.json(), response.status);
  } catch { return json({ message: 'โหลดทีมที่บันทึกไว้ไม่สำเร็จ กรุณาลองอีกครั้ง' }, 502); }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // Next may canonicalize nextUrl to localhost even when opened via 127.0.0.1.
  // Compare the browser origin with the actual incoming Host instead.
  let sameOrigin = false;
  try {
    const origin = new URL(request.headers.get('origin') || '');
    sameOrigin = ['http:', 'https:'].includes(origin.protocol) && origin.host === request.headers.get('host');
  } catch {}
  if (!sameOrigin) return json({ message: 'คำขอไม่ถูกต้อง' }, 403);
  const { id } = await params;
  if (!valid(id)) return json({ message: 'แมตช์ไม่ถูกต้อง' }, 400);
  let body: unknown;
  try {
    const text = await request.text();
    if (text.length > 4096) return json({ message: 'ข้อมูลทีมมีขนาดใหญ่เกินไป' }, 400);
    body = JSON.parse(text);
  } catch { return json({ message: 'ข้อมูลทีมไม่ถูกต้อง' }, 400); }
  const existing = request.cookies.get(cookieName)?.value;
  if (!existing || !/^[a-f0-9]{64}$/.test(existing)) return json({ message: 'กรุณาเข้าสู่ระบบก่อนบันทึกทีม' }, 401);
  const token = existing;
  try {
    const response = await fetch(`${backend}/api/predictions/${id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body), cache: 'no-store', signal: AbortSignal.timeout(15000),
    });
    const result = json(await response.json(), response.status);
    return result;
  } catch { return json({ message: 'บันทึกไม่สำเร็จ กรุณาลองอีกครั้ง' }, 502); }
}
