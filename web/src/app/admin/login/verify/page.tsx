import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AuthCard } from '@/components/admin/auth-card';
import { VerifyForm } from '@/components/admin/login-form';
import { getSession } from '@/lib/session';

export const metadata: Metadata = { title: 'تأیید دومرحله‌ای', robots: { index: false, follow: false } };

export default async function VerifyPage() {
  const session = await getSession();
  if (!session) redirect('/admin/login');
  if (session.stage === 'full') redirect('/admin');

  return (
    <AuthCard title="تأیید دومرحله‌ای" subtitle="کد برنامهٔ احراز هویت (Google Authenticator) را وارد کنید">
      <VerifyForm />
      <p className="mt-6 text-center text-sm">
        <Link href="/admin/login" className="text-gold-700 hover:underline">
          بازگشت به ورود
        </Link>
      </p>
    </AuthCard>
  );
}
