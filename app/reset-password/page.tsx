import { AuthForm } from "@/components/auth/AuthForm";

export default function ResetPasswordPage() {
  return (
    <main className="grid min-h-screen place-items-center bg-panel px-5 py-12">
      <AuthForm mode="reset" />
    </main>
  );
}
