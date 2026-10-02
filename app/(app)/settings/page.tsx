import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/supabase/org";
import { getSessionUser } from "@/lib/supabase/user";
import { PageHeader, Panel } from "@/components/ui/dash";
import { SettingsForm } from "@/components/settings/SettingsForm";

export default async function SettingsPage() {
  const supabase = await createClient();
  const orgId = await getCurrentOrgId(supabase);
  if (!orgId) redirect("/login");
  const [{ data: org }, user] = await Promise.all([
    supabase.from("organizations").select("name, business_type, target_margin_pct, price_alert_threshold_pct, max_unreviewed_line_items").eq("id", orgId).single(),
    getSessionUser(),
  ]);
  if (!org) redirect("/login");

  return (
    <>
      <PageHeader title="Settings" subtitle="How DoughTally judges your margins and when it speaks up" />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <Panel title="Business" className="xl:col-span-8">
          <SettingsForm
            initial={{
              name: org.name,
              target_margin_pct: Number(org.target_margin_pct),
              price_alert_threshold_pct: Number(org.price_alert_threshold_pct),
              max_unreviewed_line_items: org.max_unreviewed_line_items,
            }}
          />
        </Panel>
        <Panel title="Account" className="xl:col-span-4">
          <dl className="space-y-2 text-sm">
            <div>
              <dt className="text-[11px] font-semibold tracking-wider text-stone-500 uppercase">Signed in as</dt>
              <dd className="text-stone-800">{user?.email}</dd>
            </div>
            <div>
              <dt className="text-[11px] font-semibold tracking-wider text-stone-500 uppercase">Business type</dt>
              <dd className="text-stone-800 capitalize">{org.business_type?.replace("_", " ") ?? "—"}</dd>
            </div>
          </dl>
        </Panel>
      </div>
    </>
  );
}
