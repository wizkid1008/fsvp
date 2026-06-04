import Link from "next/link";
import { AuthForm } from "@/components/auth/AuthForm";

export default function SignUpPage() {
  return (
    <main className="grid min-h-screen place-items-center bg-panel px-5 py-12">
      <div className="w-full max-w-md">
        <AuthForm mode="signup" />
        <p className="mt-4 text-center text-sm text-slate-600">
          Already have an account? <Link href="/login" className="font-semibold text-forest">Log in</Link>
        </p>
      </div>
    </main>
  );
}
