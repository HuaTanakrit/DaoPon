'use client';
import { RefreshCw } from 'lucide-react';

export default function ErrorPage({ retry }: { retry: () => void }) {
  return <div className="page-shell"><div className="empty-state page-error"><RefreshCw size={36} /><span className="section-kicker">A SHORT PAUSE IN PLAY</span><h1>ยังโหลดข้อมูลไม่ได้ในตอนนี้</h1><p>กรุณารอสักครู่ แล้วลองเปิดข้อมูลอีกครั้ง</p><button className="solid-button" onClick={retry}><RefreshCw size={16} /> ลองอีกครั้ง</button></div></div>;
}
