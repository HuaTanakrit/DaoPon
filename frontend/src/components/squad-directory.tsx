'use client';

import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, ArrowUpRight, Search, X, UsersRound, Goal, Sparkles, SlidersHorizontal, RotateCcw, CheckCircle2 } from 'lucide-react';
import type { Player, Team, ReplayPlayersResult } from '@/lib/types';
import { clubStyle } from '@/lib/clubs';
import { ClubImage } from './club-image';

const positions = [
  { value: 'all', label: 'ทั้งหมด' }, { value: 'Goalkeeper', label: 'ผู้รักษาประตู' },
  { value: 'Defender', label: 'กองหลัง' }, { value: 'Midfielder', label: 'กองกลาง' },
  { value: 'Attacker', label: 'กองหน้า' },
];
const labels: Record<string, string> = { Goalkeeper: 'ผู้รักษาประตู', Defender: 'กองหลัง', Midfielder: 'กองกลาง', Attacker: 'กองหน้า' };
const positionCodes: Record<string, string> = { Goalkeeper: 'GK', Defender: 'DEF', Midfielder: 'MID', Attacker: 'FWD' };
const sumKnown = (values: Array<number | null>) => values.some((v) => v !== null) ? values.reduce<number>((sum, v) => sum + (v ?? 0), 0) : null;

export function SquadDirectory({ team, players, clock, coverage }: {
  team: Team; players: Player[]; clock: ReplayPlayersResult['clock']; coverage: ReplayPlayersResult['coverage'];
}) {
  const router = useRouter();
  useEffect(() => { const interval = setInterval(() => router.refresh(), 60000); return () => clearInterval(interval); }, [router]);
  const [position, setPosition] = useState('all');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('name');
  const style = clubStyle(team.apiId);
  const asOf = new Intl.DateTimeFormat('th-TH-u-ca-gregory', { timeZone: 'Asia/Bangkok', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(clock.replayNow));
  const roster = useMemo(() => players.map((player) => {
    const stats = player.seasonStats.filter((s) => s.team.apiId === team.apiId);
    return { ...player, position: stats[0]?.position || 'Unknown',
      goals: sumKnown(stats.map((s) => s.goals)), assists: sumKnown(stats.map((s) => s.assists)),
      appearances: sumKnown(stats.map((s) => s.appearances)) };
  }), [players, team.apiId]);
  const filtered = useMemo(() => roster.filter((p) => (position === 'all' || p.position === position)
    && `${p.name} ${p.firstName || ''} ${p.lastName || ''}`.toLowerCase().includes(search.trim().toLowerCase()))
    .sort((a, b) => sort === 'goals' ? (b.goals ?? -1) - (a.goals ?? -1) || a.name.localeCompare(b.name)
      : sort === 'assists' ? (b.assists ?? -1) - (a.assists ?? -1) || a.name.localeCompare(b.name) : a.name.localeCompare(b.name)), [roster, search, position, sort]);
  return <div className="page-shell squad-page" style={{ '--club-color': style.color } as CSSProperties}>
    <Link href="/" className="back-link"><ArrowLeft size={16} /> กลับไปเลือกสโมสร</Link>
    <section className="team-hero"><div className="team-hero-identity"><div className="team-hero-logo"><ClubImage src={team.logoUrl} alt={`ตราสโมสร ${team.name}`} /></div>
      <div><div className="eyebrow">PREMIER LEAGUE <span>/</span> 2024—25</div><h1>{team.name}</h1><p>ผู้เล่นที่มีรายชื่อในแมตช์ถึงวันนี้ในเกม</p></div></div>
      <div className="team-stat"><UsersRound size={22} /><strong>{players.length}</strong><span>นักเตะที่มีข้อมูล</span></div><span className="team-watermark" aria-hidden="true">{style.code}</span>
    </section>
    <div className="squad-replay-note"><RotateCcw size={18} /><div><span>สถิติสะสมถึงวันนี้ในเกม</span><strong>{asOf}</strong></div><div className={`squad-match-coverage${coverage.complete ? ' is-complete' : ''}`}><CheckCircle2 size={15} /><span>ข้อมูล {coverage.importedMatches}/{coverage.expectedMatches} นัด</span></div></div>
    {!coverage.complete && <p className="coverage-note">กำลังเติมข้อมูลรายนัดย้อนหลัง · ยอดที่แสดงคำนวณจาก {coverage.importedMatches} จาก {coverage.expectedMatches} นัด จึงยังไม่ใช่ยอดสะสมครบทั้งหมด ระบบจะดึงต่อเมื่อโควตา API พร้อม</p>}
    <div className="squad-heading"><div><span className="section-kicker">THE PEOPLE BEHIND THE BADGE</span><h2>รายชื่อนักเตะ<span className="count-tag">{players.length}</span></h2></div><span className="squad-season">SEASON ARCHIVE <ArrowUpRight size={14} /> 2024/25</span></div>
    <div className="squad-toolbar"><div className="position-tabs" aria-label="กรองตำแหน่งนักเตะ">{positions.map((p) => <button key={p.value} onClick={() => setPosition(p.value)} aria-pressed={position === p.value} className={position === p.value ? 'active' : ''}>{p.label}<span>{p.value === 'all' ? roster.length : roster.filter((r) => r.position === p.value).length}</span></button>)}</div>
      <div className="squad-tools"><div className="search-box"><Search size={17} /><input aria-label="ค้นหานักเตะ" placeholder="ค้นหานักเตะ..." value={search} onChange={(e) => setSearch(e.target.value)} />{search && <button aria-label="ล้างคำค้นหา" onClick={() => setSearch('')}><X size={15} /></button>}</div>
        <label className="sort-select"><SlidersHorizontal size={15} /><select aria-label="เรียงรายชื่อนักเตะ" value={sort} onChange={(e) => setSort(e.target.value)}><option value="name">เรียงตามชื่อ</option><option value="goals">ประตูมากที่สุด</option><option value="assists">แอสซิสต์มากที่สุด</option></select></label></div>
    </div>
    <div className="squad-results"><span>แสดง {filtered.length} นักเตะ</span><span>GOALS. ASSISTS. APPEARANCES.</span></div>
    <div className="player-grid">{filtered.map((player) => <article key={player.apiId} className="player-card">
      <div className="player-photo"><span className="player-position-code">{positionCodes[player.position] || 'PLAYER'}</span><div className="player-photo-decoration" /><ClubImage src={player.photoUrl} alt={player.name} player /><span className="player-crest"><ClubImage src={team.logoUrl} alt="" /></span></div>
      <div className="player-content"><div className="player-role">{labels[player.position] || 'นักเตะ'}<span>{player.nationality || '—'}</span></div><h3>{player.name}</h3>
        <div className="player-stats"><div><span><Goal size={13} /> ประตู</span><strong>{player.goals ?? '—'}</strong></div><div><span><Sparkles size={13} /> แอสซิสต์</span><strong>{player.assists ?? '—'}</strong></div><div><span>ลงสนาม</span><strong>{player.appearances ?? '—'}</strong></div></div>
      </div></article>)}</div>
    {!filtered.length && <div className="empty-state"><UsersRound size={34} /><h3>{players.length ? 'ไม่พบนักเตะที่ค้นหา' : coverage.complete ? 'ยังไม่มีนักเตะที่มีรายชื่อในแมตช์' : 'กำลังเติมสถิติย้อนหลังของสโมสรนี้'}</h3><p>{players.length ? 'ลองเปลี่ยนคำค้นหาหรือเลือกตำแหน่งอื่น' : coverage.complete ? 'รายชื่อจะแสดงเมื่อมีข้อมูลแมตช์ที่จบแล้วในเกม' : 'กลับมาอีกครั้งเมื่อดึงข้อมูลรายนัดแล้ว'}</p>{players.length > 0 && <button className="solid-button" onClick={() => { setPosition('all'); setSearch(''); }}>แสดงนักเตะทั้งหมด</button>}</div>}
    <div className="archive-note"><span className="note-index">02 / THE SQUAD</span><p>รวมเฉพาะสถิติรายนัดถึง <strong>{asOf}</strong> · อัปเดตหลังเวลาเริ่มแข่งในเกมอย่างน้อย {coverage.matchDelayHours} ชั่วโมง · — หมายถึงไม่มีข้อมูล</p></div>
  </div>;
}
