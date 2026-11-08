"use client";
import type { ReactNode } from "react";
import { AdminLayout } from "@/client/shell";

export default function Layout({ children }: { children: ReactNode }) {
  return <AdminLayout>{children}</AdminLayout>;
}
