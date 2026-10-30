'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Check, ChevronDown, Clock3, LoaderCircle, LogOut, Medal, RefreshCw, Target, Trophy, X } from 'lucide-react';
import { useAuth } from './auth-provider';
import { ClubImage } from './club-image';
import type { MyScores } from '@/lib/types';

const date = new Intl.DateTimeFormat('th-TH-u-ca-gregory', { timeZone: 'Asia/Bangkok', day: 'numeric', month: 'short', year: 'numeric' });
const dateTime = new Intl.DateTimeFormat('th-TH-u-ca-gregory', { timeZone: 'Asia/Bangkok', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

export function ScoreDashboard() {
  const { user, loading, logout, refreshUser } = useAuth();
  const [data, setData] = useState<MyScores | null>(null), [error, setError] = useState('');
  const [team, setTeam] = useState('all'), [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    if (!user) return;
    try {
      const response = await fetch('/api/me/scores', { cache: 'no-store' });
      if (response.status === 401) { await refreshUser(); return; }
      if (!response.ok) throw new Error('โหลดคะแนนไม่สำเร็จ กรุณาลองอีกครั้ง');
      setData(await response.json()); setError('');
    } catch (e) { setError(e instanceof Error ? e.message : 'โหลดคะแนนไม่สำเร็จ'); }
  }, [user?.id, refreshUser]);
  useEffect(() => { setData(null); setTeam('all'); if (!user) return; void load(); const timer = setInterval(() => { void load(); }, 60000); const changed = () => { void load(); }; window.addEventListener('demo-clock-changed', changed); return () => { clearInterval(timer); window.removeEventListener('demo-clock-changed', changed); }; }, [user?.id, load]);

  if (loading) return <div className="page-shell"><div className="empty-state page-error"><LoaderCircle className="spin" /><p>กำลังโหลดบัญชี...</p></div></div>;
  if (!user) return <div className="page-shell"><div className="empty-state page-error"><Trophy size={36} /><h1>คะแนนของคุณ เริ่มจากคำทำนายแรก</h1><p>เข้าสู่ระบบเพื่อดูทีมที่บันทึกและคะแนนแยกตามสโมสร</p><Link href="/login?next=/account" className="solid-button">เข้าสู่ระบบ <ArrowRight size={15} /></Link><Link href="/register?next=/account" className="account-register-link">สมัครสมาชิก</Link></div></div>;
  const predictions = data?.predictions.filter((p) => team === 'all' || p.team.apiId === Number(team)) || [];
  const scorePredictions = data?.scorePredictions.filter((p) => team === 'all' || p.team.apiId === Number(team)) || [];
  const scored = data?.predictions.filter((p) => p.score !== null).length || 0;
  return <div className="page-shell account-page">
    <section className="account-hero"><div><span className="eyebrow">YOUR PREDICTION JOURNAL</span><h1>สวัสดี {user.displayName}<span>ทุกทีม มีคะแนนของคุณ.</span></h1><p>ตัวจริง: ถูกคนละ 1 คะแนน · สกอร์: ตรงเป๊ะ 3 / ถูกผล 1 · แยกคะแนนตามสโมสร</p></div><div className="account-hero-icon"><Trophy size={58} strokeWidth={1.2} /><span>YOUR CLUB. YOUR SCORE.</span></div></section>
    <div className="account-bar"><span>{user.email}</span><button disabled={busy} onClick={async () => { setBusy(true); try { await logout(); } catch (e) { setError(e instanceof Error ? e.message : 'ออกจากระบบไม่สำเร็จ'); } finally { setBusy(false); } }}><LogOut size={13} /> ออกจากระบบ</button></div>
    {error && <div className="account-error" role="alert">{error}<button onClick={() => { void load(); }}><RefreshCw size={13} /> ลองอีกครั้ง</button></div>}
    {!data && !error && <div className="empty-state"><LoaderCircle className="spin" /><p>กำลังโหลดคำทำนายและคะแนน...</p></div>}
    {data && <><div className="account-summary"><span><Target size={17} /><strong>{data.predictions.length}</strong> ทายตัวจริง</span><span><Medal size={17} /><strong>{data.scorePredictions.length}</strong> ทายสกอร์</span><span><Clock3 size={17} /><strong>{data.predictions.length - scored + data.scorePredictions.filter((p) => p.points === null).length}</strong> รอเฉลย</span></div>
      <section className="account-scores"><div className="section-top"><div><span className="section-kicker">POINTS BY CLUB</span><h2>คะแนนแยกสโมสร</h2></div><Link href="/fixtures" className="account-predict-link">ไปทายแมตช์ถัดไป <ArrowRight size={15} /></Link></div>
        {data.teams.length ? <div className="score-team-grid">{data.teams.map((row) => <article className="score-team-card" key={row.team.apiId}><div className="score-team-identity"><ClubImage src={row.team.logoUrl} alt={row.team.name} /><h3>{row.team.name}</h3></div><div className="club-score-split"><div><span>ทายตัวจริง</span><strong>{row.points}</strong><small>ตรวจแล้ว {row.scoredMatches} · รอ {row.pendingMatches}</small></div><div><span>ทายสกอร์</span><strong>{row.scorePoints}</strong><small>ตรวจแล้ว {row.scoreScoredMatches} · รอ {row.scorePendingMatches}</small></div></div></article>)}</div>
          : <div className="empty-state account-empty"><Trophy size={34} /><h3>ยังไม่มีคำทำนายที่บันทึกไว้</h3><p>เลือกแมตช์ที่เปิดรับ แล้วทายตัวจริงหรือสกอร์ของทีมที่คุณเชียร์</p><Link href="/fixtures" className="solid-button">ดูตารางแข่งขัน <ArrowRight size={14} /></Link></div>}
      </section>
      {data.scorePredictions.length > 0 && <section className="prediction-history"><div className="section-top"><div><span className="section-kicker">YOUR SCORE CALLS</span><h2>คำทำนายสกอร์ของฉัน</h2></div><label className="fixture-team-select"><span className="sr-only">กรองคำทำนายสกอร์ตามสโมสร</span><select value={team} onChange={(event) => setTeam(event.target.value)}><option value="all">ทุกสโมสร</option>{data.teams.map((row) => <option key={row.team.apiId} value={row.team.apiId}>{row.team.name}</option>)}</select><ChevronDown size={13} /></label></div>
        {!scorePredictions.length && <p className="history-pending-note">ยังไม่มีคำทำนายสกอร์ของสโมสรที่เลือก</p>}
        <div className="prediction-history-list">{scorePredictions.map((prediction) => <article className="history-card" key={prediction.id}><div className="history-card-top"><div className="history-club"><ClubImage src={prediction.team.logoUrl} alt="" /><span><strong>{prediction.team.name}</strong><small>{date.format(new Date(prediction.fixture.kickoffAt))} · เวลาในเกม</small></span></div><div className={`history-score${prediction.points === null ? ' pending' : ''}`}>{prediction.points === null ? <><Clock3 size={14} /><span>รอผลสกอร์</span></> : <><strong>{prediction.points}<small>/3</small></strong><span>{prediction.points === 3 ? 'ตรงเป๊ะ' : prediction.points === 1 ? 'ผลถูก' : 'ทายผลไม่ถูก'}</span></>}</div></div>
          <div className="score-history-result"><span>{prediction.fixture.homeTeam.name}<strong>{prediction.homeGoals}</strong></span><span>:</span><span>{prediction.fixture.awayTeam.name}<strong>{prediction.awayGoals}</strong></span></div>
          {prediction.points !== null ? <p className="score-history-actual">ผลจริง <strong>{prediction.actualHomeGoals}–{prediction.actualAwayGoals}</strong> · คะแนนสกอร์ {prediction.team.name} +{prediction.points}</p>
            : prediction.resultAvailableAt && <p className="history-pending-note">เริ่มตรวจผล {dateTime.format(new Date(prediction.resultAvailableAt))} น. (เวลาจริง) · รอผลการแข่งขันที่ยืนยันแล้ว</p>}
          <Link className="history-edit" href={`/fixtures/${prediction.fixture.apiId}/predict?team=${prediction.team.apiId}`}>ดูสกอร์ที่ทาย <ArrowRight size={13} /></Link>
        </article>)}</div></section>}
      {data.predictions.length > 0 && <section className="prediction-history"><div className="section-top"><div><span className="section-kicker">YOUR MATCHES</span><h2>คำทำนายของฉัน</h2></div><label className="fixture-team-select"><span className="sr-only">กรองคะแนนตามสโมสร</span><select value={team} onChange={(event) => setTeam(event.target.value)}><option value="all">ทุกสโมสร</option>{data.teams.map((row) => <option key={row.team.apiId} value={row.team.apiId}>{row.team.name}</option>)}</select><ChevronDown size={13} /></label></div>
        <div className="prediction-history-list">{predictions.map((prediction) => <article className="history-card" key={prediction.id}><div className="history-card-top"><div className="history-club"><ClubImage src={prediction.team.logoUrl} alt="" /><span><strong>{prediction.team.name}</strong><small>{date.format(new Date(prediction.fixture.kickoffAt))} · เวลาในเกม</small></span></div><div className={`history-score${prediction.score === null ? ' pending' : ''}`}>{prediction.score === null ? <><Clock3 size={14} /><span>รอเฉลย</span></> : <><strong>{prediction.score}<small>/11</small></strong><span>คะแนน {prediction.team.name}</span></>}</div></div>
          <p className="history-fixture">{prediction.fixture.homeTeam.name} <span>vs</span> {prediction.fixture.awayTeam.name}<span>แผน {prediction.formation}</span></p>
          {prediction.score === null && prediction.resultAvailableAt && <p className="history-pending-note">เริ่มตรวจตัวจริง {dateTime.format(new Date(prediction.resultAvailableAt))} น. (เวลาจริง) · หากข้อมูลยังไม่พร้อม ระบบจะลองใหม่</p>}
          <details><summary>ดู 11 คนที่ทายไว้ <ChevronDown size={13} /></summary><div className="history-picks">{prediction.players.map((player) => <div className={player.correct === true ? 'correct' : player.correct === false ? 'incorrect' : ''} key={player.apiId}><span>{player.name}</span>{player.correct === null ? <span>รอตรวจ</span> : player.correct ? <span><Check size={13} /> +1</span> : <span><X size={13} /> 0</span>}</div>)}</div></details>
          {prediction.score === null && <Link className="history-edit" href={`/fixtures/${prediction.fixture.apiId}/predict?team=${prediction.team.apiId}`}>ดูทีมที่บันทึก <ArrowRight size={13} /></Link>}
        </article>)}</div>
      </section>}
      <div className="account-rule-note"><Clock3 size={17} /><p>เริ่มตรวจหลังเวลาเริ่มแข่งในเกม 3 ชั่วโมง คะแนนตัวจริงและสกอร์เก็บแยกกันในสโมสรที่คุณทาย<br />สกอร์ตรงเป๊ะได้ 3 คะแนน · ถูกเฉพาะผลชนะ/เสมอ/แพ้ได้ 1 คะแนน · ทายผลผิดได้ 0 คะแนน</p></div>
    </>}
  </div>;
}
