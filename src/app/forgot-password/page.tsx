import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { ForgotPasswordForm } from "@/components/reset-forms";
import { Card } from "@/components/ui";

export const metadata = { title: "Forgot password" };

export default async function ForgotPasswordPage() {
  if (await getCurrentUser()) redirect("/dashboard/settings");

  return (
    <div className="mx-auto max-w-md py-8">
      <h1 className="mb-2 text-2xl font-semibold text-slate-50">Forgot your password?</h1>
      <p className="mb-6 text-sm text-slate-400">
        Give us the email on your account and we will send you a link to set a new password.
      </p>
      <Card>
        <ForgotPasswordForm />
      </Card>
    </div>
  );
}
