// Same keys as users.social_links, so the scraper and the onboarding bot read them the same way.
export const SOCIALS = ["instagram", "linkedin", "x", "github"] as const;
export type Social = (typeof SOCIALS)[number];

const PROFILE_URL: Record<Social, (handle: string) => string> = {
  instagram: (h) => `https://www.instagram.com/${h}/`,
  linkedin: (h) => `https://www.linkedin.com/in/${h}/`,
  x: (h) => `https://x.com/${h}`,
  github: (h) => `https://github.com/${h}`,
};

/** Accepts a full URL, a bare domain path, or just a handle ("@bob"). */
export function socialUrl(platform: Social, value: string): string {
  const v = value.trim();
  if (!v) return "";
  if (/^https?:\/\//i.test(v)) return v;
  if (v.includes(".") && v.includes("/")) return `https://${v}`;
  return PROFILE_URL[platform](v.replace(/^@/, ""));
}
