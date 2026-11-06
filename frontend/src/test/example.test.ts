import { describe, it, expect } from "vitest";
import { mapUserFromApi } from "@/lib/mapUserFromApi";

describe("CGD account mapping", () => {
  it("maps the delivery role and seller inventory fields without inventing data", () => {
    const user = mapUserFromApi({
      id: 9,
      role: "delivery_guy",
      email: "driver@example.com",
      selected_brands: '["Oryx"]',
      latitude: null,
      longitude: null,
    });
    expect(user.role).toBe("delivery_guy");
    expect(user.selected_brands).toEqual(["Oryx"]);
    expect(user.latitude).toBe("");
    expect(user.longitude).toBe("");
  });
});
