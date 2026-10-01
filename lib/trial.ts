// The free trial: every account gets TRIAL_DAYS from the moment it's
// created (auth.users.created_at — no extra column). Display only for now:
// nothing is locked when it ends until billing exists.
export const TRIAL_DAYS = 14;

export function trialInfo(createdAt: string, now = new Date()) {
  const endsAt = new Date(Date.parse(createdAt) + TRIAL_DAYS * 86_400_000);
  const daysLeft = Math.max(0, Math.ceil((endsAt.getTime() - now.getTime()) / 86_400_000));
  return {
    endsAt,
    endsOn: endsAt.toLocaleDateString("en-US", { month: "long", day: "numeric" }),
    daysLeft,
    ended: daysLeft === 0,
  };
}
