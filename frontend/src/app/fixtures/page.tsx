import type { Metadata } from 'next';
import { getTeams, getUpcomingFixtures } from '@/lib/api';
import { FixtureSchedule } from '@/components/fixture-schedule';

export const metadata: Metadata = {
  title: 'ตารางแข่งขัน',
  description: 'โปรแกรมพรีเมียร์ลีก 2024/25 ที่ยังไม่ถึงเวลาแข่งขันในโหมดจำลองฤดูกาล',
};

export default async function FixturesPage() {
  const [schedule, teams] = await Promise.all([getUpcomingFixtures(), getTeams()]);
  return <FixtureSchedule schedule={schedule} teams={teams} />;
}
