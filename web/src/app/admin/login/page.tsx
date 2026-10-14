import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AuthCard } from '@/components/admin/auth-card';
import { LoginForm } from '@/components/admin/login-form';
import { getSession } from '@/lib/session';

export const metadata: Metadata = { title: 'ورود به پنل مدیریت', robots: { index: false, follow: false } };

export default async function LoginPage() {
  const session = await getSession();
  if (session?.stage === 'full') redirect('/admin');

  return (
    <AuthCard title="پنل مدیریت" subtitle="برای ادامه وارد شوید">
      <LoginForm />
    </AuthCard>
  );
}
