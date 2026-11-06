import type { UserData } from "@/store/useAppStore";

function parseJsonArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(String);
  if (typeof v === "string") {
    try {
      const x = JSON.parse(v);
      return Array.isArray(x) ? x.map(String) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function parsePrices(v: unknown): Record<string, Record<string, number>> {
  if (v && typeof v === "object" && !Array.isArray(v)) return v as Record<string, Record<string, number>>;
  if (typeof v === "string") {
    try {
      const x = JSON.parse(v);
      return x && typeof x === "object" ? x : {};
    } catch {
      return {};
    }
  }
  return {};
}

export function mapUserFromApi(u: Record<string, unknown>): Partial<UserData> & { userId: number } {
  return {
    userId: Number(u.id),
    fullName: String(u.full_name ?? ""),
    email: String(u.email ?? ""),
    phone: String(u.phone ?? ""),
    role: (() => {
      const r = String(u.role);
      if (r === "delivery_guy" || r === "driver") return "delivery_guy" as UserData["role"];
      if (["customer", "supplier", "admin"].includes(r)) return r as UserData["role"];
      return "customer" as UserData["role"];
    })(),
    deliveryGuyId: u.delivery_guy_id != null ? Number(u.delivery_guy_id) : null,
    country: String(u.country ?? ""),
    city: String(u.city ?? ""),
    area: String(u.area ?? ""),
    latitude: u.latitude != null ? String(u.latitude) : "",
    longitude: u.longitude != null ? String(u.longitude) : "",
    profileImage: String(u.profile_image ?? ""),
    plateNumber: String(u.plate_number ?? ""),
    drivingLicense: String(u.driving_license ?? ""),
    paymentMethods: parseJsonArray(u.payment_methods),
    transactionPhone: String(u.transaction_phone ?? ""),
    selected_brands: parseJsonArray(u.selected_brands),
    prices: parsePrices(u.prices),
  };
}
