import { AuthForm } from '@/components/auth-form';
export const metadata = { title: 'สมัครสมาชิก' };
export default async function Register({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const target = next?.startsWith('/') && !next.startsWith('//') && !next.includes('\\') ? next : '/account';
  return <AuthForm mode="register" next={target} />;
}
