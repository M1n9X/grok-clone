import { LoginForm } from "@/components/login-form";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  const registrationEnabled = process.env.ENABLE_REGISTRATION !== "false";

  return <LoginForm registrationEnabled={registrationEnabled} />;
}
