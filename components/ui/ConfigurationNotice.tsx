import { AlertTriangle } from "lucide-react";

/**
 * Shown when a page cannot reach the database because the deployment is
 * misconfigured, rather than because anything is wrong with the data.
 *
 * The distinction matters operationally. "Something went wrong" sends a
 * compliance officer looking for a data problem that does not exist; naming the
 * missing variable sends whoever owns the deployment to the one setting that
 * needs changing.
 */
export function ConfigurationNotice({ message }: { message: string }) {
  const isServiceRoleKey = message.includes("SUPABASE_SERVICE_ROLE_KEY");

  return (
    <div className="mt-6 rounded-lg border border-red-200 bg-red-50 p-5">
      <div className="flex gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-red-800">
            This page could not load because the deployment is misconfigured.
          </p>
          <p className="mt-2 rounded border border-red-200 bg-white px-3 py-2 font-mono text-xs leading-relaxed text-red-900">
            {message}
          </p>
          {isServiceRoleKey && (
            <p className="mt-2 text-sm leading-relaxed text-red-800">
              The service-role key is read when a request arrives, so it has to be available to the
              running Pages Function — in Cloudflare that means <strong>Bindings</strong>, not the
              build-scope Variables list. Every page that reads across tenants fails the same way
              until it is set there.
            </p>
          )}
          <p className="mt-2 text-xs leading-relaxed text-red-700">
            Nothing has been lost. No data was read or written, and anything shown as empty or zero
            below means nothing loaded — not that there is nothing there.
          </p>
        </div>
      </div>
    </div>
  );
}
