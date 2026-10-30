'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, Check, CheckCircle2, Clock3, Goal, LoaderCircle, LockKeyhole, Plus, RotateCcw, Save, Search, Shield, Sparkles, Trash2, X } from 'lucide-react';
import { ClubImage } from './club-image';
import type { Player, PredictionContext, SavedPrediction } from '@/lib/types';
import { useAuth } from './auth-provider';
import { ScorePredictionForm } from './score-prediction-form';

const formations: Record<string, number[]> = { '4-3-3': [4, 3, 3], '4-4-2': [4, 4, 2], '4-2-3-1': [4, 2, 3, 1], '3-5-2': [3, 5, 2] };
const roleName: Record<string, string> = { Goalkeeper: 'ผู้รักษาประตู', Defender: 'กองหลัง', Midfielder: 'กองกลาง', Attacker: 'กองหน้า', Unknown: 'นักเตะ' };
const roleCode: Record<string, string> = { Goalkeeper: 'GK', Defender: 'DEF', Midfielder: 'MID', Attacker: 'FWD' };
const formatDate = new Intl.DateTimeFormat('th-TH-u-ca-gregory', { timeZone: 'Asia/Bangkok', day: 'numeric', month: 'long', year: 'numeric' });
const formatTime = new Intl.DateTimeFormat('th-TH', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

function fieldRows(formation: string) {
  let slot = 1;
  const groups = formations[formation].map((count, row, all) => {
    const role = row === 0 ? 'Defender' : row === all.length - 1 ? 'Attacker' : 'Midfielder';
    return Array.from({ length: count }, () => ({ slot: slot++, role }));
  });
  return [...groups.reverse(), [{ slot: 0, role: 'Goalkeeper' }]];
}

export function LineupBuilder({ context }: { context: PredictionContext }) {
  const { user, loading: authLoading, refreshUser } = useAuth();
  const [formation, setFormation] = useState('4-3-3');
  const [picks, setPicks] = useState<Array<number | null>>(Array(11).fill(null));
  const [activeSlot, setActiveSlot] = useState<number | null>(null);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [expired, setExpired] = useState(!context.window.canPredict);
  const [graded, setGraded] = useState(false);
  const { fixture, team } = context;

  useEffect(() => {
    if (authLoading) return;
    setPicks(Array(11).fill(null)); setSavedAt(null); setFormation('4-3-3'); setError(''); setGraded(false);
    if (!user) { setLoading(false); return; }
    setLoading(true);
    const controller = new AbortController();
    fetch(`/api/predictions/${fixture.apiId}?team=${team.apiId}`, { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        if (response.status === 401) await refreshUser();
        if (!response.ok) throw new Error('โหลดทีมที่บันทึกไว้ไม่สำเร็จ ลองรีเฟรชหน้านี้อีกครั้ง');
        return response.json() as Promise<{ prediction: SavedPrediction | null }>;
      }).then(({ prediction }) => {
        if (prediction) { setFormation(prediction.formation); setPicks(prediction.playerApiIds); setSavedAt(prediction.updatedAt); setGraded(prediction.score !== null); }
      }).catch((e: Error) => { if (!controller.signal.aborted) setError(e.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [fixture.apiId, team.apiId, user?.id, authLoading, refreshUser, context.clock.revision]);

  useEffect(() => {
    const startedAt = Date.now();
    const clock = Date.parse(context.clock.replayNow);
    const update = () => setExpired(!context.window.canPredict || clock + (context.clock.mode === 'DEMO' ? 0 : Date.now() - startedAt) >= Date.parse(fixture.kickoffAt));
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [context.clock.replayNow, context.clock.mode, context.window.canPredict, fixture.kickoffAt]);

  const players = useMemo(() => context.players.map((player) => ({ ...player,
    position: player.seasonStats[0]?.position || 'Unknown', goals: player.seasonStats[0]?.goals ?? 0,
    assists: player.seasonStats[0]?.assists ?? 0, appearances: player.seasonStats[0]?.appearances ?? 0 })), [context.players]);
  const byId = useMemo(() => new Map(players.map((player) => [player.apiId, player])), [players]);
  const rows = fieldRows(formation);
  const slots = rows.flat();
  const count = picks.filter((id) => id !== null).length;
  const canEdit = !!user && !authLoading && !expired && !graded && !loading && !saving;
  const filtered = players.filter((player) => (filter === 'all' || player.position === filter)
    && `${player.name} ${player.firstName || ''} ${player.lastName || ''}`.toLowerCase().includes(search.trim().toLowerCase()));
  const keeperCount = picks.filter((id) => id !== null && byId.get(id)?.position === 'Goalkeeper').length;
  const valid = count === 11 && keeperCount === 1 && byId.get(picks[0] ?? -1)?.position === 'Goalkeeper';

  function change(next: Array<number | null>) { setPicks(next); setSavedAt(null); setError(''); }
  function choose(player: typeof players[number]) {
    if (!canEdit) return;
    const existing = picks.indexOf(player.apiId);
    if (existing !== -1) { change(picks.map((id, index) => index === existing ? null : id)); return; }
    const isKeeper = player.position === 'Goalkeeper';
    let destination = isKeeper ? (picks[0] === null ? 0 : -1) : -1;
    if (!isKeeper) {
      destination = activeSlot !== null && activeSlot > 0 ? activeSlot
        : (slots.find((slot) => slot.slot > 0 && slot.role === player.position && picks[slot.slot] === null)?.slot
          ?? picks.findIndex((id, index) => index > 0 && id === null));
    }
    if (destination < 0) { setError(isKeeper ? 'เลือกผู้รักษาประตูได้ 1 คน กรุณานำคนเดิมออกก่อน' : 'เลือกครบแล้ว กรุณานำผู้เล่นออกหรือเลือกช่องที่จะเปลี่ยน'); return; }
    const next = [...picks]; next[destination] = player.apiId; change(next); setActiveSlot(null);
  }

  async function save() {
    if (!valid || !canEdit) return;
    setSaving(true); setError('');
    try {
      const response = await fetch(`/api/predictions/${fixture.apiId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ team: team.apiId, formation, playerApiIds: picks }), signal: AbortSignal.timeout(20000) });
      const result = await response.json();
      if (!response.ok) throw new Error(Array.isArray(result.message) ? result.message.join(', ') : result.message || 'บันทึกไม่สำเร็จ');
      setSavedAt(result.prediction.updatedAt);
    } catch (e) { setError(e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ กรุณาลองอีกครั้ง'); }
    finally { setSaving(false); }
  }

  return <div className="page-shell builder-page">
    <Link href="/fixtures" className="back-link"><ArrowLeft size={15} /> กลับตารางแข่งขัน</Link>
    <section className="builder-match" aria-label="แมตช์ที่เลือก">
      <div className="builder-match-team"><ClubImage src={fixture.homeTeam.logoUrl} alt={fixture.homeTeam.name} /><strong>{fixture.homeTeam.name}</strong><span>เจ้าบ้าน</span></div>
      <div className="builder-match-date"><span className="section-kicker">PREMIER LEAGUE · MATCHWEEK {fixture.round?.split(' - ')[1] || '—'}</span><strong>{formatTime.format(new Date(fixture.kickoffAt))}</strong><time dateTime={fixture.kickoffAt}>{formatDate.format(new Date(fixture.kickoffAt))}</time><span>เวลาในเกม · เวลาไทย</span></div>
      <div className="builder-match-team"><ClubImage src={fixture.awayTeam.logoUrl} alt={fixture.awayTeam.name} /><strong>{fixture.awayTeam.name}</strong><span>ทีมเยือน</span></div>
    </section>

    <div className="builder-heading"><div><span className="section-kicker">YOUR STARTING ELEVEN</span><h1>คุณคิดว่าใครจะเป็นตัวจริง?</h1><p>เลือก 11 คนที่คุณเชื่อว่าจะได้ออกสตาร์ตให้ {team.name}</p></div><div className={`builder-open-badge${expired ? ' closed' : ''}`}>{expired ? <LockKeyhole size={14} /> : <Clock3 size={14} />}{expired ? 'ปิดรับคำทำนายแล้ว' : 'เปิดให้สร้างทีม'}</div></div>
    <div className="builder-team-tabs" aria-label="เลือกทีมที่ต้องการทาย">{[fixture.homeTeam, fixture.awayTeam].map((club) =>
      <Link key={club.apiId} href={`/fixtures/${fixture.apiId}/predict?team=${club.apiId}`} className={team.apiId === club.apiId ? 'active' : ''} aria-current={team.apiId === club.apiId ? 'page' : undefined} onClick={(event) => { if (saving) event.preventDefault(); }}><ClubImage src={club.logoUrl} alt="" />{club.name}{team.apiId === club.apiId && <Check size={14} />}</Link>)}<span>เลือกทายได้ทั้งสองสโมสร</span></div>
    {!authLoading && !user && <div className="builder-login-note"><LockKeyhole size={18} /><span>เข้าสู่ระบบเพื่อสร้างทีมและเก็บคะแนนแยกตามสโมสร</span><Link href={`/login?next=${encodeURIComponent(`/fixtures/${fixture.apiId}/predict?team=${team.apiId}`)}`}>เข้าสู่ระบบ <ArrowRight size={14} /></Link></div>}
    {context.coverage && !context.coverage.complete && <p className="coverage-note">รายชื่อยังอาจไม่ครบ · มีข้อมูลแมตช์ก่อนหน้า {context.coverage.importedMatches}/{context.coverage.expectedMatches} นัด ระบบกำลังเติมข้อมูลย้อนหลัง</p>}

    <ScorePredictionForm context={context} expired={expired} />
    <div className="builder-workspace">
      <section className="builder-board" aria-labelledby="field-title">
        <div className="builder-board-toolbar"><div><span className="section-kicker">THE TACTICS BOARD</span><h2 id="field-title">11 ตัวจริงของคุณ</h2></div><label><span className="sr-only">แผนการเล่น</span><select aria-label="แผนการเล่น" value={formation} disabled={!canEdit} onChange={(event) => { setFormation(event.target.value); setSavedAt(null); setActiveSlot(null); }}>{Object.keys(formations).map((value) => <option key={value}>{value}</option>)}</select></label></div>
        <div className="lineup-pitch"><div className="pitch-midline" /><div className="pitch-centre" /><div className="pitch-goal top" /><div className="pitch-goal bottom" />
          {rows.map((row, rowIndex) => <div className="lineup-field-row" key={rowIndex}>{row.map(({ slot, role }) => {
            const player = byId.get(picks[slot] ?? -1);
            return <div className={`lineup-slot${player ? ' filled' : ''}${activeSlot === slot ? ' targeted' : ''}`} key={slot}>
              <button className="lineup-slot-pick" disabled={!canEdit} aria-label={`${roleName[role]} ช่อง ${slot + 1}${player ? ` ${player.name}` : ' ว่าง'}`} aria-pressed={activeSlot === slot}
                onClick={() => { setActiveSlot(slot); setFilter(role === 'Goalkeeper' ? 'Goalkeeper' : 'all'); setSearch(''); setError(''); }}>
                <span className="lineup-slot-circle">{player ? <ClubImage src={player.photoUrl} alt="" player /> : <Plus size={22} />}</span><span className="lineup-slot-name">{player?.name || roleCode[role]}</span>
              </button>{player && <button className="lineup-remove" aria-label={`นำ ${player.name} ออก`} disabled={!canEdit} onClick={() => change(picks.map((id, index) => index === slot ? null : id))}><X size={11} /></button>}
            </div>;
          })}</div>)}
          <span className="pitch-signature">DaoPon · YOUR XI</span>
        </div>
        <div className="builder-selection-count"><span>เลือกแล้ว <strong>{count}<small>/11</small></strong></span><span className={keeperCount === 1 ? 'complete' : ''}><Shield size={13} /> GK {keeperCount}/1</span><button disabled={!canEdit || count === 0} onClick={() => { change(Array(11).fill(null)); setActiveSlot(null); }}><Trash2 size={13} /> ล้างทีม</button></div>
        <div className="builder-save-panel"><p>{expired ? 'ทีมถูกล็อกเมื่อถึงเวลาเริ่มแข่งตามวันจำลอง' : 'แก้ไขได้จนถึงเวลาเริ่มแข่ง · บันทึกก่อนเปลี่ยนสโมสร'}</p>
          <button className="builder-save-button" disabled={!canEdit || !valid} onClick={save}>{saving ? <LoaderCircle size={17} className="spin" /> : expired ? <LockKeyhole size={17} /> : <Save size={17} />}{saving ? 'กำลังบันทึก...' : expired ? 'ปิดรับแล้ว' : savedAt ? 'บันทึกทีมอีกครั้ง' : 'บันทึก 11 ตัวจริง'}<ArrowRight size={16} /></button>
          <div className={`builder-save-status${error ? ' error' : ''}`} role="status" aria-live="polite">{error ? error : authLoading || loading ? 'กำลังโหลดทีมที่บันทึกไว้...' : !user ? 'เข้าสู่ระบบก่อนบันทึกทีม' : savedAt ? <><CheckCircle2 size={14} /> บันทึกในบัญชีแล้ว · ดูผลได้ที่คะแนนของฉัน</> : count ? 'มีการเปลี่ยนแปลงที่ยังไม่ได้บันทึก' : 'ทีมที่บันทึกจะผูกกับบัญชีของคุณ เปิดจากเครื่องอื่นได้'}</div>
        </div>
      </section>

      <section className="builder-roster" aria-labelledby="roster-title"><div className="builder-roster-heading"><div><span className="section-kicker">PICK YOUR PLAYERS</span><h2 id="roster-title">รายชื่อนักเตะ <span className="count-tag">{players.length}</span></h2></div><span>{formatDate.format(new Date(context.clock.replayNow))}</span></div>
        <p className="builder-roster-help">แตะ + เพื่อเลือกนักเตะ หรือเลือกช่องบนสนามเพื่อเปลี่ยนตัว</p>
        <div className="search-box builder-search"><Search size={16} /><input aria-label="ค้นหานักเตะเพื่อสร้างทีม" placeholder="ค้นหาชื่อนักเตะ..." value={search} onChange={(event) => setSearch(event.target.value)} />{search && <button aria-label="ล้างคำค้นหา" onClick={() => setSearch('')}><X size={14} /></button>}</div>
        <div className="builder-role-tabs" aria-label="กรองตำแหน่ง">{['all', 'Goalkeeper', 'Defender', 'Midfielder', 'Attacker'].map((role) => <button key={role} aria-pressed={filter === role} className={filter === role ? 'active' : ''} onClick={() => setFilter(role)}>{role === 'all' ? 'ทั้งหมด' : roleCode[role]}</button>)}</div>
        <div className="builder-roster-list">{filtered.map((player) => {
          const selected = picks.includes(player.apiId);
          return <button key={player.apiId} className={`builder-player${selected ? ' selected' : ''}`} disabled={!canEdit} aria-label={`${selected ? 'ยกเลิก' : 'เลือก'} ${player.name}`} aria-pressed={selected} onClick={() => choose(player)}>
            <span className="builder-player-photo"><ClubImage src={player.photoUrl} alt="" player /></span><span className="builder-player-info"><small>{roleName[player.position] || 'นักเตะ'}</small><strong>{player.name}</strong><span><Goal size={11} /> {player.goals} <Sparkles size={11} /> {player.assists} <span>{player.appearances} นัด</span></span></span><span className="builder-player-add">{selected ? <Check size={16} /> : <Plus size={16} />}</span>
          </button>;
        })}</div>
        {!filtered.length && <div className="builder-no-players"><Search size={25} /><strong>{players.length ? 'ไม่พบนักเตะที่ค้นหา' : 'กำลังเตรียมรายชื่อนักเตะ'}</strong><p>{players.length ? 'ลองค้นหาชื่ออื่น หรือเลือกตำแหน่งทั้งหมด' : 'ลองเลือกอีกสโมสร หรือกลับมาเมื่อข้อมูลรายนัดพร้อม'}</p></div>}
        <div className="builder-roster-note"><RotateCcw size={13} /><span>สถิติเฉพาะแมตช์ก่อนหน้าถึงวันจำลอง<br />แผนบนสนามคือตำแหน่งที่คุณเลือกทาย</span></div>
      </section>
    </div>
  </div>;
}
