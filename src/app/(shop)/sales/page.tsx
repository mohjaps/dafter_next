"use client";
import * as Shop from "@/client/live/merchant";
import { allow } from "@/client/shell";

export default function Page() {
  return allow(["Owner", "Cashier", "Accountant"], <Shop.Invoices key="sales" />);
}
