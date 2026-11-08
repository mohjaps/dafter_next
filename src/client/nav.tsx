"use client";
import {
  LayoutDashboard, ShoppingCart, Package, Truck, Receipt, Users, Store, Banknote, Wallet, ClipboardList,
  ChartColumn, Settings, CalendarClock, Layers, LifeBuoy, Monitor, History,
} from "lucide-react";

export type Nav = { path: string; title: string; icon: typeof Store; roles: string[] };
const all = ["Owner", "Cashier", "Warehouse", "Accountant"];
export const shopNav: Nav[] = [
  { path: "/", title: "نظرة عامة", icon: LayoutDashboard, roles: all },
  { path: "/pos", title: "نقطة البيع", icon: ShoppingCart, roles: ["Owner", "Cashier"] },
  { path: "/products", title: "المنتجات", icon: Package, roles: all },
  { path: "/purchases", title: "المشتريات", icon: Truck, roles: ["Owner", "Warehouse", "Accountant"] },
  { path: "/sales", title: "المبيعات", icon: Receipt, roles: ["Owner", "Cashier", "Accountant"] },
  { path: "/customers", title: "الزبائن والديون", icon: Users, roles: all },
  { path: "/suppliers", title: "الموردون", icon: Store, roles: all },
  { path: "/expenses", title: "المصروفات", icon: Banknote, roles: ["Owner", "Accountant"] },
  { path: "/cashbox", title: "الصندوق", icon: Wallet, roles: ["Owner", "Accountant"] },
  { path: "/stocktake", title: "الجرد والتسويات", icon: ClipboardList, roles: ["Owner", "Warehouse", "Accountant"] },
  { path: "/reports", title: "التقارير", icon: ChartColumn, roles: ["Owner", "Accountant"] },
  { path: "/team", title: "الموظفون", icon: Users, roles: ["Owner"] },
  { path: "/devices", title: "الأجهزة", icon: Monitor, roles: ["Owner"] },
  { path: "/support", title: "الدعم الفني", icon: LifeBuoy, roles: ["Owner"] },
  { path: "/audit", title: "سجل العمليات", icon: History, roles: ["Owner", "Accountant"] },
  { path: "/settings", title: "الإعدادات", icon: Settings, roles: all },
];
export const adminNav: Nav[] = [
  { path: "/admin", title: "نظرة عامة", icon: LayoutDashboard, roles: ["PlatformAdmin", "Billing"] },
  { path: "/admin/shops", title: "البقالات", icon: Store, roles: ["PlatformAdmin", "Support", "Billing"] },
  { path: "/admin/subscriptions", title: "الاشتراكات والمتأخرات", icon: CalendarClock, roles: ["PlatformAdmin", "Support", "Billing"] },
  { path: "/admin/plans", title: "الخطط", icon: Layers, roles: ["PlatformAdmin", "Support", "Billing"] },
  { path: "/admin/payments", title: "دفعات الاشتراك", icon: Wallet, roles: ["PlatformAdmin", "Billing"] },
  { path: "/admin/support", title: "الدعم الفني", icon: LifeBuoy, roles: ["PlatformAdmin", "Support"] },
  { path: "/admin/users", title: "مستخدمو الإدارة", icon: Users, roles: ["PlatformAdmin"] },
  { path: "/admin/devices", title: "الأجهزة", icon: Monitor, roles: ["PlatformAdmin", "Support"] },
  { path: "/admin/audit", title: "سجل العمليات", icon: History, roles: ["PlatformAdmin"] },
  { path: "/admin/settings", title: "إعدادات المنصة", icon: Settings, roles: ["PlatformAdmin"] },
];
