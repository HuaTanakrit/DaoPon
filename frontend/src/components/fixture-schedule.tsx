'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowDown, ArrowRight, CalendarDays, ChevronDown, Clock3, Filter, MapPin, RotateCcw, ShieldCheck, LockKeyhole } from 'lucide-react';
import { ClubImage } from './club-image';
import type { Team, UpcomingFixture, UpcomingFixturesResult } from '@/lib/types';

const zone = 'Asia/Bangkok';
const dateFormat = new Intl.DateTimeFormat('th-TH-u-ca-gregory', { timeZone: zone, day: 'numeric', month: 'long', year: 'numeric' });
const dayFormat = new Intl.DateTimeFormat('th-TH-u-ca-gregory', { timeZone: zone, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const timeFormat = new Intl.DateTimeFormat('th-TH', { timeZone: zone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const dayKey = (iso: string) => new Date(Date.parse(iso) + 7 * 3600000).toISOString().slice(0, 10);
const roundNumber = (round: string | null) => round?.match(/Regular Season - (\d+)/)?.[1];

function FixtureRow({ fixture, replayNow, team }: { fixture: UpcomingFixture; replayNow: number; team: string }) {
  const opensAt = Date.parse(fixture.kickoffAt) - 7 * 24 * 3600000;
  const canPredict = replayNow >= opensAt && replayNow < Date.parse(fixture.kickoffAt);
  return <li className="fixture-row">
    <div className="fixture-round">MATCHWEEK <strong>{roundNumber(fixture.round) || '—'}</strong></div>
    <div className="fixture-team fixture-home"><span>{fixture.homeTeam.name}<small>เจ้าบ้าน</small></span><div className="fixture-crest"><ClubImage src={fixture.homeTeam.logoUrl} alt={`ตราสโมสร ${fixture.homeTeam.name}`} /></div></div>
    <div className="fixture-kickoff"><time dateTime={fixture.kickoffAt}>{timeFormat.format(new Date(fixture.kickoffAt))}</time><span>VS</span></div>
    <div className="fixture-team fixture-away"><div className="fixture-crest"><ClubImage src={fixture.awayTeam.logoUrl} alt={`ตราสโมสร ${fixture.awayTeam.name}`} /></div><span>{fixture.awayTeam.name}<small>ทีมเยือน</small></span></div>
    <div className="fixture-venue"><MapPin size={13} /><span>{fixture.venueName || 'ยังไม่ระบุสนาม'}</span></div>
    <div className="fixture-action">{canPredict
      ? <><Link className="create-lineup-link" href={`/fixtures/${fixture.apiId}/predict${team !== 'all' ? `?team=${team}` : ''}`}>ทายตัวจริง <ArrowRight size={14} /></Link><Link className="create-lineup-link score-entry-link" href={`/fixtures/${fixture.apiId}/predict${team !== 'all' ? `?team=${team}` : ''}#score-prediction`}>ทายสกอร์ <ArrowRight size={14} /></Link></>
      : <span className="prediction-not-open"><LockKeyhole size={12} /> เปิด {new Intl.DateTimeFormat('th-TH-u-ca-gregory', { timeZone: zone, day: 'numeric', month: 'short' }).format(opensAt)}</span>}</div>
  </li>;
}

export function FixtureSchedule({ schedule, teams }: { schedule: UpcomingFixturesResult; teams: Team[] }) {
  const router = useRouter();
  const [team, setTeam] = useState('all');
  const [shown, setShown] = useState(30);
  const [replayNow, setReplayNow] = useState(Date.parse(schedule.clock.replayNow));

  useEffect(() => {
    const startedAt = Date.now();
    const serverNow = Date.parse(schedule.clock.replayNow);
    setReplayNow(serverNow);
    // Drop a fixture at kickoff, then refresh the server's clock and schedule.
    const update = () => setReplayNow(serverNow + (schedule.clock.mode === 'DEMO' ? 0 : Date.now() - startedAt));
    const tick = setInterval(update, 1000);
    const refresh = setInterval(() => router.refresh(), 60000);
    return () => { clearInterval(tick); clearInterval(refresh); };
  }, [schedule.clock.replayNow, schedule.clock.mode, router]);

  const upcoming = useMemo(() => schedule.data.filter((fixture) => Date.parse(fixture.kickoffAt) > replayNow), [schedule.data, replayNow]);
  const filtered = useMemo(() => upcoming.filter((fixture) => team === 'all'
    || fixture.homeTeam.apiId === Number(team) || fixture.awayTeam.apiId === Number(team)), [upcoming, team]);
  const groups = useMemo(() => {
    const result: Array<{ key: string; fixtures: UpcomingFixture[] }> = [];
    for (const fixture of filtered.slice(0, shown)) {
      const key = dayKey(fixture.kickoffAt);
      const previous = result[result.length - 1];
      if (previous?.key === key) previous.fixtures.push(fixture);
      else result.push({ key, fixtures: [fixture] });
    }
    return result;
  }, [filtered, shown]);
  const next = filtered[0];

  return <div className="page-shell fixtures-page">
    <section className="fixtures-hero" aria-labelledby="fixtures-title">
      <div className="fixtures-hero-copy"><div className="eyebrow"><span className="live-dot" /> THE NEXT MATCHDAY</div>
        <h1 id="fixtures-title">เกมถัดไป<span>เริ่มที่ข้างสนาม.</span></h1>
        <p>ตามโปรแกรมทีมที่คุณเชียร์<br />ย้อนฤดูกาล 2024/25 แล้วเดินไปด้วยกันทีละนัด</p>
        <a href="#schedule" className="hero-link">ดูโปรแกรมแข่งขัน <ArrowDown size={16} /></a>
      </div>
      <div className="fixtures-hero-aside"><CalendarDays size={35} strokeWidth={1.2} /><span>PREMIER LEAGUE</span><strong>2024<span>/</span>25</strong><div className="replay-pill"><RotateCcw size={12} /> SEASON REPLAY</div></div>
      <div className="hero-bottom-line"><span>ONE MATCH AT A TIME.</span><span>ALL TIMES IN BANGKOK</span></div>
    </section>

    <section className="replay-timeline" aria-label="เวลาจำลองฤดูกาล">
      <div className="replay-timeline-label"><RotateCcw size={18} /><span>นาฬิกาฤดูกาล<strong>{schedule.clock.mode === 'DEMO' ? 'เวลาเดโม (หยุดไว้)' : `ย้อนเวลา ${schedule.clock.yearOffset} ปี`}</strong></span></div>
      <div className="replay-date"><span>วันที่จริง</span><time dateTime={schedule.clock.realNow}>{dateFormat.format(new Date(schedule.clock.realNow))}</time></div>
      <ArrowRight className="replay-date-arrow" size={20} />
      <div className="replay-date replay-date-current"><span><span className="tiny-dot" /> วันนี้ในเกม</span><time dateTime={schedule.clock.replayNow}>{dateFormat.format(new Date(schedule.clock.replayNow))}</time></div>
    </section>

    <section id="schedule" className="schedule-section" aria-labelledby="schedule-title">
      <div className="section-top"><div><span className="section-kicker">UPCOMING FIXTURES</span><h2 id="schedule-title">ตารางแข่งขัน<span className="count-tag">{filtered.length}</span></h2></div>
        <label className="fixture-team-select"><Filter size={15} /><span className="sr-only">กรองตามสโมสร</span><select value={team} onChange={(event) => { setTeam(event.target.value); setShown(30); }}><option value="all">ทุกสโมสร</option>{teams.map((club) => <option value={club.apiId} key={club.apiId}>{club.name}</option>)}</select><ChevronDown size={14} /></label>
      </div>
      <div className="schedule-meta"><span><Clock3 size={13} /> เฉพาะนัดที่ยังไม่เริ่มตามเวลาในเกม</span><span>เวลาไทย · ฤดูกาล 2024/25</span></div>
      {next && <div className="next-match-note"><span className="tiny-dot" /><span>นัดถัดไป <strong>{dateFormat.format(new Date(next.kickoffAt))}</strong></span><span>ตรงกับ {dateFormat.format(new Date(next.replayKickoffAt))} ในเวลาจริง</span></div>}
      <div className="fixture-groups">
        {groups.map((group) => <section className="fixture-day" key={group.key} aria-labelledby={`day-${group.key}`}>
          <div className="fixture-day-heading"><CalendarDays size={15} /><h3 id={`day-${group.key}`}>{dayFormat.format(new Date(group.fixtures[0].kickoffAt))}</h3><span>{group.fixtures.length} คู่</span></div>
          <ul className="fixture-list">{group.fixtures.map((fixture) => <FixtureRow key={fixture.apiId} fixture={fixture} replayNow={replayNow} team={team} />)}</ul>
        </section>)}
      </div>
      {!filtered.length && <div className="empty-state fixture-empty"><CalendarDays size={34} /><h3>ไม่มีโปรแกรมแข่งขันที่ยังไม่ถึงเวลา</h3><p>{team === 'all' ? 'โปรแกรมที่เหลือของฤดูกาลนี้จะแสดงที่นี่เมื่อมีข้อมูล' : 'ลองเลือกสโมสรอื่น หรือดูโปรแกรมของทุกสโมสร'}</p>{team !== 'all' && <button className="solid-button" onClick={() => { setTeam('all'); setShown(30); }}>ดูทุกสโมสร</button>}</div>}
      {filtered.length > shown && <div className="fixture-load-more"><span>แสดง {Math.min(shown, filtered.length)} จาก {filtered.length} นัด</span><button onClick={() => setShown((value) => value + 30)}>ดูโปรแกรมเพิ่มเติม <ArrowDown size={15} /></button></div>}
      <div className="schedule-footnote"><ShieldCheck size={16} /><p>ทายตัวจริงหรือสกอร์ได้ล่วงหน้า 7 วัน และแก้ไขได้จนเริ่มแข่งตามเวลาในเกม<br />สกอร์ตรงเป๊ะ 3 คะแนน · ถูกเฉพาะผล 1 คะแนน · คะแนนแยกจากตัวจริงตามสโมสร</p><span>02 / THE FIXTURES</span></div>
    </section>
  </div>;
}
