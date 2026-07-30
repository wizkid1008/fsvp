import { ClaimExporterClient } from "./ClaimExporterClient";

export const runtime = "edge";

export default function ClaimExporterPage({
  searchParams,
}: {
  searchParams: { token?: string };
}) {
  return <ClaimExporterClient token={searchParams.token ?? ""} />;
}
