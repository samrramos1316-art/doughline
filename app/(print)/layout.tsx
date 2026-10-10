import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/supabase/user";

// Printable pages (cost sheets, event quotes): no app sidebar, a plain white
// page that prints as it looks. Signed-in only, like the app itself.
export default async function PrintLayout({ children }: { children: React.ReactNode }) {
  if (!(await getSessionUser())) redirect("/login");
  return <div className="min-h-dvh bg-white px-4 py-6 text-stone-900 print:p-0 sm:px-8">{children}</div>;
}
