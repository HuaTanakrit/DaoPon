import Link from 'next/link';

export function Brand() {
  return <Link href="/" className="brand" aria-label="DaoPon หน้าแรก">
    <span className="brand-mark" aria-hidden="true"><span /><span /><span /></span>
    <span>DaoPon<span className="brand-dot">.</span></span>
  </Link>;
}
