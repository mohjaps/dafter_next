"use client";
import { useState } from "react";
import type { ReactNode } from "react";
import { SessionProvider } from "@/client/live/session";
import { RefreshContext } from "@/client/live/data";
import { AppBoundary } from "@/client/components/AppBoundary";

export function Providers({ children }: { children: ReactNode }) {
  const [version, setVersion] = useState(0);
  return (
    <AppBoundary>
      <SessionProvider>
        <RefreshContext.Provider value={{ version, refresh: () => setVersion((v) => v + 1) }}>
          <a className="skip-link" href="#main-content">
            تخطي إلى المحتوى
          </a>
          {children}
        </RefreshContext.Provider>
      </SessionProvider>
    </AppBoundary>
  );
}
