import { loadEnv, getAdminClient } from "./lib/supabaseTestEnv.mjs";
loadEnv();
const admin = getAdminClient();
const { data: users } = await admin.auth.admin.listUsers({ perPage: 1000 });
const u = users.users.find((x) => x.email === "samraphael.ramos@servitehs.org");
const orgId = (await admin.from("profiles").select("org_id").eq("id", u.id).single()).data.org_id;
const { data: inv } = await admin.from("invoices").select("id, status, error_message, file_storage_path, file_type, source_type, created_at, raw_extraction, invoice_line_items(count)").eq("org_id", orgId).order("created_at");
for (const i of inv) {
  const rx = i.raw_extraction;
  console.log([i.created_at.slice(0, 16), i.status, i.source_type, i.file_type, i.file_storage_path.split("/").pop(), `lines=${i.invoice_line_items[0]?.count}`, `doc=${rx?.document_type ?? "-"}`, `rxLines=${rx?.line_items?.length ?? "-"}`, `vendor=${rx?.vendor_name_guess ?? "-"}`, `err=${i.error_message ?? ""}`].join(" | "));
}
