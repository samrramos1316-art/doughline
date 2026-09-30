// Pre-launch gate. With DOUGHTALLY_ACCESS=closed, only the emails in
// DOUGHTALLY_ALLOWED_EMAILS (comma-separated) can sign up, log in or use the
// app; everyone else is told it isn't open yet. Unset (local dev, tests)
// or anything else = open to everyone. Server-only: both are plain env vars.
export const CLOSED_MESSAGE = "Sorry — DoughTally isn't open yet. We're finishing it up and will let you know as soon as it's ready.";

export function accessClosed() {
  return process.env.DOUGHTALLY_ACCESS === "closed";
}

export function canUseApp(email: string | null | undefined) {
  if (!accessClosed()) return true;
  if (!email) return false;
  const allowed = (process.env.DOUGHTALLY_ALLOWED_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
  return allowed.includes(email.trim().toLowerCase());
}
