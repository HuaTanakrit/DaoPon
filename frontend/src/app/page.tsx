import { getTeams } from '@/lib/api';
import { ClubDirectory } from '@/components/club-directory';

export default async function Home() {
  const teams = await getTeams();
  return <ClubDirectory teams={teams} />;
}
