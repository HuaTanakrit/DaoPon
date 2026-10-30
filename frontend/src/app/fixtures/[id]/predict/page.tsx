import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Clock3, ArrowLeft } from 'lucide-react';
import { getPredictionContext } from '@/lib/api';
import { LineupBuilder } from '@/components/lineup-builder';

export const metadata: Metadata = { title: 'ทายตัวจริงและสกอร์' };

export default async function PredictionPage({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ team?: string }>;
}) {
  const { id } = await params;
  const { team } = await searchParams;
  if (!/^\d+$/.test(id) || !Number.isSafeInteger(Number(id)) || (team !== undefined && !/^\d+$/.test(team))) notFound();
  const context = await getPredictionContext(Number(id), team ? Number(team) : undefined);
  if (context.window.state === 'NOT_OPEN' || context.window.state === 'UNAVAILABLE') {
    return <div className="page-shell"><div className="empty-state page-error"><Clock3 size={36} /><h1>ยังไม่เปิดให้สร้างทีม</h1>
      <p>{context.window.opensAt ? `เปิดก่อนแข่ง 7 วัน: ${new Intl.DateTimeFormat('th-TH-u-ca-gregory', { timeZone: 'Asia/Bangkok', dateStyle: 'long', timeStyle: 'short' }).format(new Date(context.window.opensAt))} ตามเวลาในเกม` : 'แมตช์นี้ยังไม่พร้อมให้ทายตัวจริง'}</p>
      <Link href="/fixtures" className="solid-button"><ArrowLeft size={15} /> กลับตารางแข่งขัน</Link></div></div>;
  }
  return <LineupBuilder key={`${id}-${context.team.apiId}`} context={context} />;
}
