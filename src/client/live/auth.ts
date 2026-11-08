"use client";
import { createContext, useContext } from "react";
import type { Me } from "./types";
type Session = {
  me: Me | null;
  loading: boolean;
  error: string;
  reload: () => Promise<Me | null>;
};
export const Context = createContext<Session>({
  me: null,
  loading: true,
  error: "",
  reload: async () => null,
});
export const useSession = () => useContext(Context);
export const isPlatform = (me: Me) =>
  me.roles.some((r) => ["PlatformAdmin", "Support", "Billing"].includes(r));
