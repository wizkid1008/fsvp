import Link from "next/link";
import { AuthForm } from "@/components/auth/AuthForm";

export const runtime = "edge";

export default function LoginPage({ searchParams }: { searchParams?: { next?: string } }) {
  return (
    <main className="grid min-h-screen place-items-center bg-white px-5 py-12">
      <div className="w-full max-w-md">
        <AuthForm mode="login" nextPath={searchParams?.next || "/dashboard"} />
        <div className="mt-4 flex justify-between text-sm font-bold text-black/60">
          <Link href="/forgot-password">Forgot password?</Link>
          <Link href="/signup">Create account</Link>
        </div>
      </div>
    </main>
  );
}
