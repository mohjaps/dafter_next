"use client";
import { useSession } from "@/client/live/auth";
import * as Admin from "@/client/live/admin";

export function AdminHome() {
  const { me } = useSession();
  return me!.roles.includes("Support") ? <Admin.Shops /> : <Admin.Overview />;
}
