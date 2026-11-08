"use client";
import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";
export class AppBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Daftar rendering error", error, info.componentStack);
  }
  render() {
    return this.state.failed ? (
      <main className="login-shell">
        <section className="panel">
          <h1>تعذر عرض الصفحة</h1>
          <p className="muted">
            أعد تحميل الواجهة، ثم راجع سجل العملية قبل إعادة أي طلب مالي.
          </p>
          <button
            className="button primary"
            onClick={() => window.location.reload()}
          >
            إعادة المحاولة
          </button>
        </section>
      </main>
    ) : (
      this.props.children
    );
  }
}
