import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { RegisterForm } from "@/components/auth-forms";
import { Card } from "@/components/ui";

export const metadata = { title: "Create account" };

export default async function RegisterPage() {
  if (await getCurrentUser()) redirect("/dashboard");

  return (
    <div className="mx-auto max-w-md py-8">
      <h1 className="mb-2 text-2xl font-semibold text-slate-50">Create your account</h1>
      <p className="mb-6 text-sm text-slate-400">
        One account covers both sides — buy on one deal, sell on the next.
      </p>
      <Card>
        <RegisterForm />
      </Card>
    </div>
  );
}
