'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Clock3 } from 'lucide-react';
import type { ReplayClock } from '@/lib/types';

const format = new Intl.DateTimeFormat('th-TH-u-ca-gregory', { timeZone: 'Asia/Bangkok', dateStyle: 'medium', timeStyle: 'short' });
export function DemoBanner() {
  const [clock, setClock] = useState<ReplayClock | null>(null);
  const previous = useRef<number | null>(null), router = useRouter();
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch('/api/demo', { cache: 'no-store', signal: controller.signal });
        if (!response.ok) return;
        const data = await response.json() as { clock: ReplayClock };
        if (controller.signal.aborted) return;
        if (previous.current !== null && previous.current !== data.clock.revision) { router.refresh(); window.dispatchEvent(new Event('demo-clock-changed')); }
        previous.current = data.clock.revision; setClock(data.clock);
      } catch {}
    }
    void load(); const timer = setInterval(() => { void load(); }, 5000);
    window.addEventListener('demo-clock-updated', load);
    return () => { controller.abort(); clearInterval(timer); window.removeEventListener('demo-clock-updated', load); };
  }, [router]);
  return <div className={`demo-banner${clock?.mode === 'DEMO' ? ' active' : ''}`}><div><Clock3 size={15} /><span>{clock?.mode === 'DEMO' ? `เวลาเดโม · ${format.format(new Date(clock.replayNow))} น. · หยุดเวลาไว้` : 'เครื่องมือสำหรับสาธิตเกม'}</span><Link href="/demo">ปรับเวลาเดโม →</Link></div></div>;
}
