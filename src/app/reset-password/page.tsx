import Link from "next/link";
import { isResetTokenUsable } from "@/lib/password-reset";
import { ResetPasswordForm } from "@/components/reset-forms";
import { Alert, Card } from "@/components/ui";

export const metadata = { title: "Set a new password" };

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const usable = token ? await isResetTokenUsable(token) : false;

  return (
    <div className="mx-auto max-w-md py-8">
      <h1 className="mb-2 text-2xl font-semibold text-slate-50">Set a new password</h1>

      {usable ? (
        <>
          <p className="mb-6 text-sm text-slate-400">
            Choose something you do not use anywhere else.
          </p>
          <Card>
            <ResetPasswordForm token={token!} />
          </Card>
        </>
      ) : (
        <Card className="mt-6">
          <Alert tone="error">
            This link is no longer valid. Reset links work once and expire after an hour.
          </Alert>
          <div className="mt-4 flex gap-2">
            <Link className="btn btn-primary" href="/forgot-password">
              Send a new link
            </Link>
            <Link className="btn btn-ghost" href="/login">
              Back to sign in
            </Link>
          </div>
        </Card>
      )}
    </div>
  );
}
