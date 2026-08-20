import { APP_NAME } from "@/lib/constants";

const BACKEND = process.env.BACKEND_URL || "http://127.0.0.1:4000";

export async function getCompanyBranding() {
  try {
    const res = await fetch(`${BACKEND}/api/branding`, { cache: "no-store" });
    const json = (await res.json()) as { data?: { companyName?: string; hasLogo?: boolean } };
    return {
      name: json.data?.companyName || APP_NAME,
      logoUrl: json.data?.hasLogo ? "/api/branding/logo" : null,
    };
  } catch {
    return { name: APP_NAME, logoUrl: null };
  }
}

export async function getCompanyName() {
  return (await getCompanyBranding()).name;
}
