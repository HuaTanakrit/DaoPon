'use client';
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowRight, LockKeyhole, LoaderCircle, ShieldCheck } from 'lucide-react';
import { useAuth } from './auth-provider';
export function AuthForm({ mode, next }: { mode: 'login' | 'register'; next: string }) {
  const register = mode === 'register';
  const { refreshUser, user } = useAuth();
  const router = useRouter();
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError('');
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch(`/api/auth/${mode}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: form.get('email'), password: form.get('password'), ...(register ? { displayName: form.get('displayName') } : {}) }) });
      const data = await response.json();
      if (!response.ok) throw new Error(Array.isArray(data.message) ? data.message.join(', ') : data.message || 'ทำรายการไม่สำเร็จ');
      await refreshUser(); router.replace(next); router.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : 'เชื่อมต่อไม่ได้ กรุณาลองอีกครั้ง'); } finally { setBusy(false); }
  }
  return <div className="page-shell auth-page"><section className="auth-story"><span className="eyebrow">YOUR CLUB. YOUR CALL.</span><h1>ทุกคำทำนาย<span>มีชื่อของคุณ.</span></h1><p>จัด 11 ตัวจริง เก็บคำทำนายของคุณ<br />และสะสมคะแนนแยกตามสโมสรที่คุณเชียร์</p><div className="auth-rules"><ShieldCheck size={18} /><span>ทายถูกคนละ 1 คะแนน<br />ไม่จำกัดตำแหน่งที่ลงเล่น</span></div><span className="auth-season">SEASON REPLAY · 2024/25</span></section>
    <section className="auth-card"><span className="section-kicker">{register ? 'JOIN DaoPon' : 'WELCOME BACK'}</span><h2>{register ? 'สร้างบัญชีของคุณ' : 'เข้าสู่ระบบ'}</h2><p>{register ? 'เริ่มเก็บคำทำนายและคะแนนไว้ในบัญชีเดียว' : 'กลับมาจัดทีมและติดตามคะแนนของคุณ'}</p>
      {user && <div className="auth-already">เข้าสู่ระบบแล้วในชื่อ {user.displayName} <Link href={next}>ไปต่อ <ArrowRight size={13} /></Link></div>}
      <form onSubmit={submit}>{register && <label>ชื่อที่แสดง<input name="displayName" autoComplete="nickname" minLength={2} maxLength={40} required placeholder="ชื่อของคุณ" disabled={busy} /></label>}
        <label>อีเมล<input name="email" type="email" autoComplete="email" maxLength={254} required placeholder="you@example.com" disabled={busy} /></label>
        <label>รหัสผ่าน<input name="password" type="password" autoComplete={register ? 'new-password' : 'current-password'} minLength={8} maxLength={128} required placeholder={register ? 'อย่างน้อย 8 ตัวอักษร' : 'รหัสผ่านของคุณ'} disabled={busy} /></label>
        {error && <p className="auth-error" role="alert">{error}</p>}<button disabled={busy} type="submit">{busy ? <LoaderCircle size={17} className="spin" /> : <LockKeyhole size={16} />}{busy ? 'กำลังดำเนินการ...' : register ? 'สมัครสมาชิก' : 'เข้าสู่ระบบ'}<ArrowRight size={17} /></button>
      </form><div className="auth-switch">{register ? 'มีบัญชีแล้ว?' : 'ยังไม่มีบัญชี?'} <Link href={`/${register ? 'login' : 'register'}?next=${encodeURIComponent(next)}`}>{register ? 'เข้าสู่ระบบ' : 'สมัครสมาชิก'}</Link></div>
    </section></div>;
}
