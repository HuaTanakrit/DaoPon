'use client';

import { useMemo, useState, type CSSProperties } from 'react';
import Link from 'next/link';
import { ArrowRight, ArrowUpRight, Search, X, Layers3 } from 'lucide-react';
import { ClubImage } from './club-image';
import { clubStyle } from '@/lib/clubs';
import type { Team } from '@/lib/types';

export function ClubDirectory({ teams }: { teams: Team[] }) {
  const [search, setSearch] = useState('');
  const filtered = useMemo(() => teams.filter((team) =>
    `${team.name} ${clubStyle(team.apiId).thai} ${clubStyle(team.apiId).code}`.toLowerCase().includes(search.trim().toLowerCase())), [teams, search]);
  return <div className="page-shell">
    <section className="hero" aria-labelledby="hero-title">
      <div className="hero-copy"><div className="eyebrow"><span className="live-dot" /> THE PREMIER LEAGUE COLLECTION</div>
        <h1 id="hero-title">20 สโมสร<span>หนึ่งลีกที่คุณรัก.</span></h1>
        <p>เลือกทีมที่คุณเชียร์ แล้วรู้จักทุกชื่อในสนาม<br className="desktop-break" /> ผ่านรายชื่อนักเตะและสถิติประจำฤดูกาล</p>
        <a href="#clubs" className="hero-link">ค้นพบสโมสรของคุณ <ArrowRight size={17} /></a>
      </div>
      <div className="hero-art" aria-hidden="true"><div className="pitch-outline"><div className="pitch-half" /><div className="pitch-circle" /><div className="pitch-box top" /><div className="pitch-box bottom" /></div>
        <span className="art-season">2024 — 2025</span><div className="hero-number">20<span>CLUBS. ONE LEAGUE.</span></div><span className="art-label"><Layers3 size={14} /> THE CLUB DIRECTORY</span>
      </div>
      <div className="hero-bottom-line"><span>ENGLISH FOOTBALL. ENDLESS STORIES.</span><span>VOL. 2024/25</span></div>
    </section>
    <section id="clubs" className="directory" aria-labelledby="clubs-title">
      <div className="section-top"><div><span className="section-kicker">FIND YOUR CLUB</span><h2 id="clubs-title">เลือกสโมสรของคุณ<span className="count-tag">{teams.length}</span></h2></div>
        <div className="search-box"><Search size={18} /><input aria-label="ค้นหาสโมสร" placeholder="ค้นหาชื่อสโมสร..." value={search} onChange={(e) => setSearch(e.target.value)} />{search && <button aria-label="ล้างคำค้นหา" onClick={() => setSearch('')}><X size={16} /></button>}</div>
      </div>
      <div className="directory-meta"><span><span className="tiny-dot" /> PREMIER LEAGUE</span><span>{search ? `พบ ${filtered.length} จาก ${teams.length} สโมสร` : `${teams.length} สโมสร · ฤดูกาล 2024/25`}</span></div>
      <div className="club-grid">
        {filtered.map((team) => { const style = clubStyle(team.apiId); return <Link key={team.apiId} href={`/teams/${team.apiId}`} className="club-card" style={{ '--club-color': style.color } as CSSProperties}>
          <div className="club-card-top"><span>{style.code}</span><ArrowUpRight size={18} /></div>
          <div className="club-crest"><ClubImage src={team.logoUrl} alt={`ตราสโมสร ${team.name}`} /></div>
          <h3>{team.name}</h3><div className="club-card-link"><span>ดูรายชื่อนักเตะ</span><ArrowRight size={15} /></div>
        </Link>; })}
      </div>
      {!filtered.length && <div className="empty-state"><Search size={32} /><h3>{teams.length ? 'ไม่พบสโมสรที่ค้นหา' : 'กำลังเตรียมข้อมูลสโมสร'}</h3><p>{teams.length ? 'ลองค้นหาด้วยชื่อภาษาไทย ภาษาอังกฤษ หรือชื่อย่อทีม' : 'รายชื่อสโมสรจะแสดงที่นี่เมื่อข้อมูลพร้อม'}</p>{search && <button className="solid-button" onClick={() => setSearch('')}>ดูสโมสรทั้งหมด</button>}</div>}
      <div className="archive-note"><span className="note-index">01 / THE CLUBS</span><p>คอลเลกชันฤดูกาล <strong>2024/25</strong> · รายชื่อและสถิติอ้างอิงฤดูกาลดังกล่าว</p><span>EXPLORE. DISCOVER. SUPPORT.</span></div>
    </section>
  </div>;
}
