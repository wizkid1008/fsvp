import { AuthForm } from "@/components/auth/AuthForm";
import { ResetSessionBridge } from "@/components/auth/ResetSessionBridge";

export const runtime = "edge";

export default function ResetPasswordPage() {
  return (
    <main className="grid min-h-screen place-items-center bg-white px-5 py-12">
      <div className="w-full max-w-md">
        <ResetSessionBridge />
        <AuthForm mode="reset" />
      </div>
    </main>
  );
}
