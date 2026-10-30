import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { demoEnabled } from '@/lib/demo-server';
import { DemoControls } from '@/components/demo-controls';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'ควบคุมเวลาเดโม' };
export default function DemoPage() {
  if (!demoEnabled()) notFound();
  return <DemoControls />;
}
