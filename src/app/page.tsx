import { Dashboard } from "@/components/Dashboard";
import { getClimates } from "@/lib/ha";

export const dynamic = "force-dynamic";

export default async function Page() {
  const initial = await getClimates().catch(() => null);
  return <Dashboard initial={initial} />;
}
