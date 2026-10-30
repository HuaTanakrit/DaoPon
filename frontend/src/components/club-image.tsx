'use client';

import { useState } from 'react';
import { Shield, UserRound } from 'lucide-react';

export function ClubImage({ src, alt, player = false }: { src: string | null; alt: string; player?: boolean }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) return player ? <UserRound className="image-fallback" aria-label={alt} /> : <Shield className="image-fallback" aria-label={alt} />;
  return <img src={src} alt={alt} loading="lazy" decoding="async" onError={() => setFailed(true)} />;
}
