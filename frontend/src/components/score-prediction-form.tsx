'use client';
import { useEffect, useState } from 'react';
import { CheckCircle2, Goal, LoaderCircle, LockKeyhole, Save } from 'lucide-react';
import { useAuth } from './auth-provider';
import { ClubImage } from './club-image';
import type { PredictionContext, SavedScorePrediction } from '@/lib/types';

export function ScorePredictionForm({ context, expired }: { context: PredictionContext; expired: boolean }) {
  const { user, loading: authLoading, refreshUser } = useAuth();
  const [home, setHome] = useState(''), [away, setAway] = useState('');
  const [loading, setLoading] = useState(true), [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<SavedScorePrediction | null>(null), [error, setError] = useState('');
  const { fixture, team } = context;
  useEffect(() => {
    if (authLoading) return;
    setHome(''); setAway(''); setSaved(null); setError('');
    if (!user) { setLoading(false); return; }
    const controller = new AbortController();
    setLoading(true);
    const load = async () => {
      try {
        const response = await fetch(`/api/predictions/${fixture.apiId}/score?team=${team.apiId}`, { cache: 'no-store', signal: controller.signal });
        if (response.status === 401) { await refreshUser(); return; }
        if (!response.ok) throw new Error('โหลดสกอร์ที่ทายไว้ไม่สำเร็จ');
        const data = await response.json() as { prediction: SavedScorePrediction | null };
        setSaved(data.prediction); setHome(data.prediction ? String(data.prediction.homeGoals) : ''); setAway(data.prediction ? String(data.prediction.awayGoals) : '');
      } catch (e) { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'โหลดสกอร์ไม่สำเร็จ'); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    };
    void load();
    const interval = expired ? setInterval(() => { void load(); }, 60000) : null;
    return () => { controller.abort(); if (interval) clearInterval(interval); };
  }, [fixture.apiId, team.apiId, user?.id, authLoading, expired, refreshUser]);
  const canEdit = !!user && !authLoading && !loading && !saving && !expired && (saved?.points == null);
  const valid = /^\d{1,2}$/.test(home) && /^\d{1,2}$/.test(away) && Number(home) <= 99 && Number(away) <= 99;
  async function save() {
    if (!canEdit || !valid) return;
    setSaving(true); setError('');
    try {
      const response = await fetch(`/api/predictions/${fixture.apiId}/score`, { method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ team: team.apiId, homeGoals: Number(home), awayGoals: Number(away) }), signal: AbortSignal.timeout(20000) });
      const data = await response.json();
      if (!response.ok) throw new Error(Array.isArray(data.message) ? data.message.join(', ') : data.message || 'บันทึกสกอร์ไม่สำเร็จ');
      setSaved(data.prediction);
    } catch (e) { setError(e instanceof Error ? e.message : 'บันทึกสกอร์ไม่สำเร็จ'); }
    finally { setSaving(false); }
  }
  return <section id="score-prediction" className="score-prediction-panel" aria-labelledby="score-prediction-title">
    <div className="score-prediction-copy"><span className="section-kicker">CALL THE SCORE</span><h2 id="score-prediction-title"><Goal size={21} /> ทายสกอร์</h2><p>ตรงเป๊ะ <strong>3 คะแนน</strong> · ถูกเฉพาะผลชนะ/เสมอ/แพ้ <strong>1 คะแนน</strong></p><small>คะแนนสกอร์แยกจากตัวจริง · เข้าทีม {team.name}</small></div>
    <div className="score-prediction-fields">
      <label><span className="score-prediction-club"><ClubImage src={fixture.homeTeam.logoUrl} alt="" /><span>{fixture.homeTeam.name}<small>เจ้าบ้าน</small></span></span><input aria-label={`สกอร์เจ้าบ้าน ${fixture.homeTeam.name}`} type="number" min="0" max="99" step="1" inputMode="numeric" placeholder="—" value={home} disabled={!canEdit} onChange={(event) => { setHome(event.target.value); setSaved(null); setError(''); }} /></label>
      <span className="score-prediction-dash">:</span>
      <label><span className="score-prediction-club"><ClubImage src={fixture.awayTeam.logoUrl} alt="" /><span>{fixture.awayTeam.name}<small>ทีมเยือน</small></span></span><input aria-label={`สกอร์ทีมเยือน ${fixture.awayTeam.name}`} type="number" min="0" max="99" step="1" inputMode="numeric" placeholder="—" value={away} disabled={!canEdit} onChange={(event) => { setAway(event.target.value); setSaved(null); setError(''); }} /></label>
    </div>
    <div className="score-prediction-save"><button disabled={!canEdit || !valid} onClick={save}>{saving ? <LoaderCircle size={15} className="spin" /> : expired ? <LockKeyhole size={15} /> : <Save size={15} />}{saving ? 'กำลังบันทึก...' : expired ? 'ปิดรับแล้ว' : 'บันทึกสกอร์'}</button><div role="status" aria-live="polite" className={error ? 'error' : ''}>{error || (authLoading || loading ? 'กำลังโหลด...' : !user ? 'เข้าสู่ระบบเพื่อทายสกอร์' : saved ? <><CheckCircle2 size={12} />{saved.points === null ? 'บันทึกสกอร์แล้ว' : `ผลจริง ${saved.actualHomeGoals}–${saved.actualAwayGoals} · ได้ ${saved.points} คะแนน`}</> : 'ทายสกอร์อย่างเดียวได้ ไม่ต้องจัดตัวจริง')}</div></div>
  </section>;
}
