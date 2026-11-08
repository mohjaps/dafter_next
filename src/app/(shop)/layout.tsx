"use client";
import type { ReactNode } from "react";
import { ShopLayout } from "@/client/shell";

export default function Layout({ children }: { children: ReactNode }) {
  return <ShopLayout>{children}</ShopLayout>;
}
