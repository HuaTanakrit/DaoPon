'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Clock3, FastForward, LoaderCircle, RotateCcw } from 'lucide-react';
import type { ReplayClock } from '@/lib/types';

type Fixture = { apiId: number; kickoffAt: string; homeTeam: { apiId: number; name: string }; awayTeam: { apiId: number; name: string } };
const format = new Intl.DateTimeFormat('th-TH-u-ca-gregory', { timeZone: 'Asia/Bangkok', dateStyle: 'medium', timeStyle: 'short' });
const inputTime = (iso: string) => new Date(Date.parse(iso) + 7 * 3600000).toISOString().slice(0, 16);
export function DemoControls() {
  const router = useRouter();
  const [clock, setClock] = useState<ReplayClock | null>(null), [fixtures, setFixtures] = useState<Fixture[]>([]);
  const [selected, setSelected] = useState(''), [time, setTime] = useState(''), [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const [state, list] = await Promise.all([fetch('/api/demo', { signal: controller.signal, cache: 'no-store' }), fetch('/api/demo/fixtures', { signal: controller.signal, cache: 'no-store' })]);
        if (!state.ok || !list.ok) throw new Error('โหลดตัวควบคุมเดโมไม่สำเร็จ');
        const data = await state.json() as { clock: ReplayClock }, rows = (await list.json()).fixtures as Fixture[];
        setClock(data.clock); setTime(inputTime(data.clock.replayNow)); setFixtures(rows);
        setSelected(String((rows.find((f) => Date.parse(f.kickoffAt) > Date.parse(data.clock.replayNow) && [f.homeTeam.apiId, f.awayTeam.apiId].includes(40)) ?? rows.find((f) => Date.parse(f.kickoffAt) > Date.parse(data.clock.replayNow)) ?? rows[0])?.apiId ?? ''));
      } catch (e) { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'โหลดไม่สำเร็จ'); }
    })();
    return () => controller.abort();
  }, []);
  const fixture = fixtures.find((f) => f.apiId === Number(selected));
  async function process() {
    const response = await fetch('/api/demo', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fixture ? { fixture: fixture.apiId } : {}), signal: AbortSignal.timeout(50000) });
    if (!response.ok) throw new Error('เปลี่ยนเวลาแล้ว แต่สั่งตรวจคะแนนไม่สำเร็จ ระบบจะตรวจต่อทุกนาที');
  }
  async function apply(replayAt: string | null) {
    if (busy) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const response = await fetch('/api/demo', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ replayAt }), signal: AbortSignal.timeout(20000) });
      const data = await response.json();
      if (!response.ok) throw new Error(Array.isArray(data.message) ? data.message.join(', ') : data.message || 'เปลี่ยนเวลาไม่สำเร็จ');
      setClock(data.clock); setTime(inputTime(data.clock.replayNow)); window.dispatchEvent(new Event('demo-clock-updated')); router.refresh();
      setMessage(replayAt ? 'เปลี่ยนเวลาแล้ว กำลังตรวจงานที่ถึงเวลา…' : 'กลับไปใช้เวลาจริงย้อนหลัง 2 ปีแล้ว');
      if (replayAt) { await process(); setMessage('เปลี่ยนเวลาแล้ว และตรวจงานที่ถึงเวลาแล้วหนึ่งแมตช์ ดูคะแนนได้ที่ “คะแนนของฉัน” งานอื่นตรวจต่อทุกนาที'); }
      window.dispatchEvent(new Event('demo-clock-changed'));
    } catch (e) { setError(e instanceof Error ? e.message : 'เปลี่ยนเวลาไม่สำเร็จ'); }
    finally { setBusy(false); }
  }
  async function retry() { setBusy(true); setError(''); try { await process(); setMessage('ตรวจงานที่ถึงเวลาแล้วหนึ่งแมตช์ ดูผลที่คะแนนของฉัน'); window.dispatchEvent(new Event('demo-clock-changed')); } catch (e) { setError(e instanceof Error ? e.message : 'ตรวจไม่สำเร็จ'); } finally { setBusy(false); } }
  return <div className="page-shell demo-page"><div className="demo-title"><span className="eyebrow">DEMO TIME MACHINE</span><h1><Clock3 /> ควบคุมเวลาเดโม</h1><p>เลื่อนเวลาในฤดูกาล 2024/25 เพื่อโชว์ช่วงเปิดทาย การล็อกตอนเริ่มแข่ง และการตรวจคะแนนหลังเริ่ม 3 ชั่วโมง</p></div>
    <div className="demo-current"><span>{clock?.mode === 'DEMO' ? 'เวลาเดโม · หยุดเวลาไว้' : 'เวลาปกติ · ย้อนหลัง 2 ปี'}</span><strong>{clock ? `${format.format(new Date(clock.replayNow))} น.` : 'กำลังโหลด…'}</strong><small>เวลาไทย · ใช้ร่วมกันทั้งเว็บและทุกบัญชี</small></div>
    <div className="demo-grid"><section className="demo-card"><h2>เลือกวันเวลาเอง</h2><label htmlFor="demo-datetime">วันเวลาในเกม (เวลาไทย)</label><input id="demo-datetime" type="datetime-local" min="2024-08-01T00:00" max="2025-06-30T23:59" value={time} disabled={busy || !clock} onChange={(e) => setTime(e.target.value)} /><button className="solid-button" disabled={busy || !time || !clock} onClick={() => { if (time) void apply(new Date(`${time}:00+07:00`).toISOString()); }}><FastForward size={15} /> ใช้เวลานี้</button><button className="demo-reset" disabled={busy || !clock} onClick={() => { void apply(null); }}><RotateCcw size={14} /> กลับไปใช้เวลาปกติ</button></section>
    <section className="demo-card"><h2>ข้ามตามแมตช์</h2><label htmlFor="demo-fixture">แมตช์ที่จะสาธิต</label><select id="demo-fixture" value={selected} disabled={busy || !fixtures.length} onChange={(e) => setSelected(e.target.value)}>{fixtures.map((f) => <option key={f.apiId} value={f.apiId}>{format.format(new Date(f.kickoffAt))} · {f.homeTeam.name} – {f.awayTeam.name}</option>)}</select><div className="demo-jumps">{[{ label: 'ก่อนแข่ง 1 วัน', hours: -24 }, { label: 'ถึงเวลาเริ่มแข่ง', hours: 0 }, { label: 'หลังเริ่มแข่ง 3 ชม.', hours: 3 }].map((jump) => <button disabled={busy || !fixture} key={jump.hours} onClick={() => { if (fixture) void apply(new Date(Date.parse(fixture.kickoffAt) + jump.hours * 3600000).toISOString()); }}>{jump.label}</button>)}</div>{fixture && <Link href={`/fixtures/${fixture.apiId}/predict?team=${fixture.homeTeam.apiId}`} className="demo-fixture-link">เปิดหน้าทาย {fixture.homeTeam.name} – {fixture.awayTeam.name} →</Link>}<button className="demo-reset" disabled={busy || !clock} onClick={() => { void retry(); }}>ตรวจคะแนนที่ถึงเวลาอีกครั้ง</button></section></div>
    {busy && <p className="demo-status" role="status"><LoaderCircle className="spin" size={16} /> กำลังอัปเดตเวลาและตรวจข้อมูลการแข่งขัน…</p>}{message && <p className="demo-status" role="status">{message}</p>}{error && <p className="demo-error" role="alert">{error}</p>}
    <div className="demo-guide"><h2>ลำดับสำหรับสาธิต</h2><ol><li>เลือกแมตช์ กด “ก่อนแข่ง 1 วัน” แล้วเปิดหน้าทายและบันทึกคำทำนาย</li><li>กด “ถึงเวลาเริ่มแข่ง” เพื่อแสดงว่าคำทำนายถูกล็อกและแมตช์หายจากตารางนัดถัดไป</li><li>กด “หลังเริ่มแข่ง 3 ชม.” แล้วเปิด <Link href="/account">คะแนนของฉัน</Link> เพื่อดูผลที่ตรวจแล้ว</li></ol><p>เวลาเดโมค้างไว้จนกว่าจะเปลี่ยนหรือกดกลับเวลาปกติ คะแนนที่ตรวจแล้วเก็บไว้และแก้คำทำนายไม่ได้ แม้ย้อนเวลา ข้อมูลจริงหรือโควตา API ที่ยังไม่พร้อมอาจทำให้รอเฉลยต่อไป</p></div>
  </div>;
}
