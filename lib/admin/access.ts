// Who can open the owner's console (/admin): the emails in
// DOUGHTALLY_ADMIN_EMAILS (comma-separated, server-only env). Unset = nobody.
export function isAdmin(email: string | null | undefined) {
  if (!email) return false;
  const admins = (process.env.DOUGHTALLY_ADMIN_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
  return admins.includes(email.trim().toLowerCase());
}
