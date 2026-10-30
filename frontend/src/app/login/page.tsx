import { AuthForm } from '@/components/auth-form';
export const metadata = { title: 'เข้าสู่ระบบ' };
export default async function Login({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const target = next?.startsWith('/') && !next.startsWith('//') && !next.includes('\\') ? next : '/account';
  return <AuthForm mode="login" next={target} />;
}
