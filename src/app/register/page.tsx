import Link from "next/link";
import { RegisterForm } from "@/components/register-form";

export const dynamic = "force-dynamic";

export default function RegisterPage() {
  const registrationEnabled = process.env.ENABLE_REGISTRATION !== "false";

  if (!registrationEnabled) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="w-full max-w-sm space-y-6">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-foreground">Grok</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Registration is currently closed
            </p>
          </div>

          <div className="rounded-lg bg-yellow-500/10 px-4 py-3 text-center text-sm text-yellow-600 dark:text-yellow-500">
            New account registration has been disabled. Please contact an administrator if you need access.
          </div>

          <p className="text-center text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link
              href="/login"
              className="text-foreground underline hover:opacity-80"
            >
              Sign in
            </Link>
          </p>
        </div>
      </div>
    );
  }

  return <RegisterForm />;
}
