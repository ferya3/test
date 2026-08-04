import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { LoginForm } from "@/components/auth-forms";
import { Card } from "@/components/ui";

export const metadata = { title: "Sign in" };

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/dashboard");

  return (
    <div className="mx-auto max-w-md py-8">
      <h1 className="mb-6 text-2xl font-semibold text-slate-50">Sign in</h1>
      <Card>
        <LoginForm />
      </Card>
    </div>
  );
}
