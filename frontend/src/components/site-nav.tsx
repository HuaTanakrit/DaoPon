'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from './auth-provider';

export function SiteNav() {
  const pathname = usePathname();
  const { user } = useAuth();
  return <nav className="primary-nav" aria-label="เมนูหลัก">
    {[{ href: '/', label: 'สโมสร', active: pathname === '/' || pathname.startsWith('/teams/') },
      { href: '/fixtures', label: 'ตารางแข่งขัน', active: pathname.startsWith('/fixtures') },
      { href: user ? '/account' : '/login', label: user ? 'คะแนนของฉัน' : 'เข้าสู่ระบบ', active: ['/account', '/login', '/register'].includes(pathname) }].map((item) =>
      <Link key={item.href} href={item.href} className={`nav-link${item.active ? ' is-active' : ''}`} aria-current={item.active ? 'page' : undefined}>{item.label}</Link>)}
    <span className="header-divider" /><span className="season-chip"><span /> SEASON 2024/25</span>
  </nav>;
}
