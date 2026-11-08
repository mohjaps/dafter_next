"use client";
import * as Admin from "@/client/live/admin";
import { allow } from "@/client/shell";

export default function Page() {
  return allow(["PlatformAdmin", "Billing"], <Admin.Payments />);
}
