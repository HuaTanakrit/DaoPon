import { notFound } from 'next/navigation';
import { getPlayers, getTeam } from '@/lib/api';
import { SquadDirectory } from '@/components/squad-directory';

export default async function TeamPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^\d+$/.test(id) || !Number.isSafeInteger(Number(id))) notFound();
  const [team, players] = await Promise.all([getTeam(Number(id)), getPlayers(Number(id))]);
  return <SquadDirectory team={team} players={players.data} clock={players.clock} coverage={players.coverage} />;
}
