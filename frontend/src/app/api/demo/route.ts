import { NextRequest } from 'next/server';
import { apiJson, sameOrigin } from '@/lib/auth-server';
import { demoProxy } from '@/lib/demo-server';

export async function GET() { return demoProxy(''); }
export async function PUT(request: NextRequest) {
  if (!sameOrigin(request)) return apiJson({ message: 'คำขอไม่ถูกต้อง' }, 403);
  try {
    const text = await request.text();
    if (text.length > 512) return apiJson({ message: 'ข้อมูลไม่ถูกต้อง' }, 400);
    return demoProxy('', 'PUT', JSON.parse(text));
  } catch { return apiJson({ message: 'ข้อมูลไม่ถูกต้อง' }, 400); }
}
export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return apiJson({ message: 'คำขอไม่ถูกต้อง' }, 403);
  try {
    const text = await request.text();
    if (text.length > 512) return apiJson({ message: 'ข้อมูลไม่ถูกต้อง' }, 400);
    return demoProxy('/process', 'POST', text ? JSON.parse(text) : {});
  } catch { return apiJson({ message: 'ข้อมูลไม่ถูกต้อง' }, 400); }
}
