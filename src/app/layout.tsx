import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Providers } from "@/client/providers";
import "@/styles/index.css";
import "@/styles/App.css";
import "@/styles/extended.css";
import "@/styles/live.css";
import "@/styles/Sales.css";
import "@/styles/Customers.css";
import "@/styles/Products.css";
import "@/styles/Pos.css";
import "@/styles/Expenses.css";
import "@/styles/Purchases.css";

export const metadata: Metadata = {
  title: "دفتر | إدارة البقالة",
  description: "دفتر — إدارة المبيعات والمخزون والديون للبقالات",
  icons: { icon: "/favicon.svg" },
};
export const viewport: Viewport = { themeColor: "#145c50", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link href="https://fonts.googleapis.com/css2?family=Alexandria:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
