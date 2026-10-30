import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { ArrowUpRight } from 'lucide-react';
import { Brand } from '@/components/brand';
import { SiteNav } from '@/components/site-nav';
import { AuthProvider } from '@/components/auth-provider';
import { DemoBanner } from '@/components/demo-banner';
import { demoEnabled } from '@/lib/demo-server';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'DaoPon — ทุกทีม ทุกตัวตน', template: '%s | DaoPon' },
  description: 'สำรวจ 20 สโมสรพรีเมียร์ลีก รายชื่อนักเตะ ประตู และแอสซิสต์ ฤดูกาล 2024/25',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="th" data-scroll-behavior="smooth"><body><AuthProvider>
    <a className="skip-link" href="#main">ข้ามไปยังเนื้อหา</a>
    <header className="site-header"><div className="header-inner">
      <Brand />
      <SiteNav />
    </div></header>
    {demoEnabled() && <DemoBanner />}
    <main id="main">{children}</main>
    <footer className="site-footer"><div className="footer-inner"><Brand /><p>ทุกชื่อมีเรื่องราว ทุกทีมมีคนเชียร์</p><span className="footer-source">ข้อมูลฤดูกาล 2024/25 <ArrowUpRight size={14} /></span></div>
      <div className="footer-note">ข้อมูลสถิติจาก API-Football · เว็บไซต์อิสระสำหรับสำรวจข้อมูลฟุตบอล</div>
    </footer>
  </AuthProvider></body></html>;
}
