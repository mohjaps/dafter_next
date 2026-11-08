"use client";
import * as Shop from "@/client/live/merchant";
import { allow } from "@/client/shell";

export default function Page() {
  return allow(["Owner"], <Shop.Devices />);
}
