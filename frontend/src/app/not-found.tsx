import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
export default function NotFound() {
  return <div className="page-shell"><div className="empty-state page-error"><span className="section-kicker">OFFSIDE / 404</span><h1>ไม่พบสโมสรที่คุณกำลังมองหา</h1><p>กลับไปเลือกหนึ่งใน 20 สโมสรพรีเมียร์ลีกได้เลย</p><Link className="solid-button" href="/"><ArrowLeft size={16} /> กลับหน้าแรก</Link></div></div>;
}
