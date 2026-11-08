"use client";
import { useState } from "react";
import type { ReactNode } from "react";
import { NotebookPen, Store, Menu, X, LogOut } from "lucide-react";
import { Link, NavLink, useNavigate } from "@/client/router";
import { useSession, isPlatform } from "@/client/live/auth";
import { useData } from "@/client/live/data";
import { Allowed, Gate } from "@/client/live/session";
import { Status } from "@/client/live/ui";
import type { Row } from "@/client/live/types";
import { roles, text } from "@/client/live/types";
import { post } from "@/client/api/client";
import { adminNav, shopNav } from "./nav";

function Shell({ admin, children }: { admin: boolean; children: ReactNode }) {
  const { me, reload } = useSession();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const settings = useData<Row>(admin ? null : "/settings");
  async function logout() {
    setBusy(true);
    try {
      await post("/auth/logout", {});
      await reload();
      navigate(admin ? "/admin/login" : "/login", { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر الخروج.");
    } finally {
      setBusy(false);
    }
  }
  const nav = (admin ? adminNav : shopNav).filter((n) => me!.roles.some((r) => n.roles.includes(r)));
  return (
    <div className="app-shell" dir="rtl">
      {open && <button className="sidebar-overlay" aria-label="إغلاق القائمة" onClick={() => setOpen(false)} />}
      <aside className={`sidebar ${open ? "is-open" : ""}`}>
        <div className="sidebar-brand">
          <Link to={admin ? "/admin" : "/"} className="brand">
            <NotebookPen size={32} />
            <span>دفتر</span>
          </Link>
          <button className="sidebar-close icon-button" aria-label="إغلاق" onClick={() => setOpen(false)}>
            <X size={21} />
          </button>
        </div>
        <div className="shop-card">
          <span className="shop-symbol">
            <Store size={21} />
          </span>
          <div>
            <strong>{admin ? "إدارة النظام" : text(settings.data?.name) || "المحل"}</strong>
            <small>{admin ? "البقالات والاشتراكات" : "لوحة إدارة المحل"}</small>
          </div>
        </div>
        <nav className="sidebar-nav" aria-label="القائمة الرئيسية">
          {nav.map(({ path, title, icon: Icon }) => (
            <NavLink
              key={path}
              end={path === "/" || path === "/admin"}
              to={path}
              onClick={() => setOpen(false)}
              className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}
            >
              <Icon size={20} />
              <span>{title}</span>
            </NavLink>
          ))}
        </nav>
        <button className="nav-item logout-button" disabled={busy} onClick={() => void logout()}>
          <LogOut size={19} />
          {busy ? "جارٍ الخروج…" : "تسجيل الخروج"}
        </button>
        <div className="sidebar-footer">
          <span className="avatar">{me!.name.slice(0, 1)}</span>
          <div>
            <strong>{me!.name}</strong>
            <small>{roles[me!.roles[0]]}</small>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="topbar-start">
            <button className="icon-button menu-toggle" aria-label="فتح القائمة" aria-expanded={open} onClick={() => setOpen(true)}>
              <Menu size={23} />
            </button>
            <span className="topbar-title">{admin ? "لوحة إدارة النظام" : text(settings.data?.name) || "لوحة البقالة"}</span>
          </div>
          <span className="topbar-date">
            {new Intl.DateTimeFormat("ar-PS", { timeZone: "Asia/Hebron", day: "numeric", month: "long", year: "numeric" }).format(new Date())}
          </span>
        </header>
        <main className="page-content" id="main-content">
          {error && (
            <p role="alert" className="customer-error">
              {error}
            </p>
          )}
          {!admin && settings.error && <Status {...settings} />} {children}
          <footer className="page-footer">دفتر · إدارة أبسط لتجارتك</footer>
        </main>
      </div>
    </div>
  );
}

export function ShopLayout({ children }: { children: ReactNode }) {
  return (
    <Gate platform={false}>
      <Shell admin={false}>{children}</Shell>
    </Gate>
  );
}
export function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <Gate platform>
      <Shell admin>{children}</Shell>
    </Gate>
  );
}
export const allow = (roles: string[], content: ReactNode) => <Allowed roles={roles}>{content}</Allowed>;

export function NotFound() {
  const { me } = useSession();
  return (
    <section className="panel empty-page">
      <h1>الصفحة غير موجودة</h1>
      <Link className="button primary" to={me && isPlatform(me) ? "/admin" : "/"}>
        العودة للرئيسية
      </Link>
    </section>
  );
}
