"use client";
import * as Shop from "@/client/live/merchant";
import { allow } from "@/client/shell";

export default function Page() {
  return allow(["Owner", "Warehouse"], <Shop.Checkout key="purchase" purchase />);
}
