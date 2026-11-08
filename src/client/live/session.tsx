"use client";
import { Context, useSession, isPlatform } from "./auth";
import { failure } from "./data";
import { useEffect, useState, useRef } from "react";
import type { ReactNode, FormEvent } from "react";
import { Link, Navigate, useNavigate } from "@/client/router";
import { NotebookPen } from "lucide-react";
import { ApiError, request, post } from "../api/client";
import type { Me } from "./types";
import { Status } from "./ui";
export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{
    me: Me | null;
    loading: boolean;
    error: string;
  }>({ me: null, loading: true, error: "" });
  const generation = useRef(0);
  async function reload() {
    const turn = ++generation.current;
    try {
      const me = await request<Me>("/auth/me");
      if (turn !== generation.current) return null;
      setState({ me, loading: false, error: "" });
      return me;
    } catch (e) {
      if (turn !== generation.current) return null;
      if (e instanceof ApiError && e.status === 401)
        setState({ me: null, loading: false, error: "" });
      else setState({ me: null, loading: false, error: failure(e) });
      return null;
    }
  }
  useEffect(() => {
    queueMicrotask(() => void reload());
    const expired = () => {
      generation.current++;
      setState({ me: null, loading: false, error: "" });
    };
    window.addEventListener("daftar-session-expired", expired);
    return () => window.removeEventListener("daftar-session-expired", expired);
  }, []);
  return (
    <Context.Provider value={{ ...state, reload }}>{children}</Context.Provider>
  );
}
export function Gate({
  platform,
  children,
}: {
  platform: boolean;
  children: ReactNode;
}) {
  const s = useSession();
  if (s.loading || s.error)
    return (
      <main className="login-shell">
        <section className="panel login-card">
          <h1>دفتر</h1>
          <Status
            loading={s.loading}
            error={s.error}
            retry={() => void s.reload()}
          />
          {s.error && (
            <button
              className="button soft"
              onClick={() =>
                void post("/auth/logout", {})
                  .then(() => s.reload())
                  .catch(() => s.reload())
              }
            >
              إنهاء الجلسة
            </button>
          )}
        </section>
      </main>
    );
  if (!s.me)
    return <Navigate to={platform ? "/admin/login" : "/login"} replace />;
  if (isPlatform(s.me) !== platform)
    return <Navigate to={platform ? "/" : "/admin"} replace />;
  return children;
}
export function Login({ admin = false }: { admin?: boolean }) {
  const navigate = useNavigate();
  const s = useSession();
  const [challenge, setChallenge] = useState<{
    challengeId: string;
    developmentCode?: string;
  } | null>(null);
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const d = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    try {
      if (admin)
        await post("/auth/admin-login", {
          email: String(d.get("email")).trim(),
          password: String(d.get("password")),
          deviceName: "متصفح إدارة دفتر",
        });
      else if (!challenge) {
        setChallenge(await post("/auth/otp", { phone }));
        return;
      } else
        await post("/auth/verify", {
          challengeId: challenge.challengeId,
          code: String(d.get("code")),
          deviceName: "متصفح دفتر",
        });
      const me = await s.reload();
      if (me) navigate(isPlatform(me) ? "/admin" : "/", { replace: true });
      else setError("تعذر التحقق من الجلسة. أعد المحاولة.");
    } catch (e) {
      setError(failure(e));
    } finally {
      setBusy(false);
    }
  }
  if (s.me && !s.error)
    return <Navigate to={isPlatform(s.me) ? "/admin" : "/"} replace />;
  return (
    <main className="login-shell" dir="rtl">
      <section className="panel login-card">
        <div className="login-brand">
          <NotebookPen size={36} />
          <strong>دفتر</strong>
        </div>
        <h1>
          {admin
            ? "دخول إدارة النظام"
            : challenge
              ? "تحقق من رقمك"
              : "أهلًا بعودتك"}
        </h1>
        <p className="muted">إدارة أبسط لتجارتك</p>
        <form className="customer-form" onSubmit={submit}>
          <fieldset className="connected-fields" disabled={busy}>
            {admin ? (
              <>
                <label>
                  البريد الإلكتروني
                  <input
                    type="email"
                    name="email"
                    autoComplete="username"
                    required
                    maxLength={150}
                    dir="ltr"
                  />
                </label>
                <label>
                  كلمة المرور
                  <input
                    name="password"
                    type="password"
                    autoComplete="current-password"
                    required
                    maxLength={256}
                  />
                </label>
              </>
            ) : challenge ? (
              <>
                <p>
                  الرقم: <bdi>{phone}</bdi>
                </p>
                <label>
                  رمز التحقق
                  <input
                    name="code"
                    autoComplete="one-time-code"
                    inputMode="numeric"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    required
                  />
                </label>
                {challenge.developmentCode && (
                  <p className="development-code">
                    رمز بيئة التطوير المحلية:{" "}
                    <bdi>{challenge.developmentCode}</bdi>
                  </p>
                )}
              </>
            ) : (
              <label>
                رقم الهاتف
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  pattern="0(59|56)[0-9]{7}"
                  autoComplete="tel"
                  placeholder="رقم الهاتف المسجّل"
                  required
                />
              </label>
            )}
            {error && (
              <p className="customer-error" role="alert">
                {error}
              </p>
            )}
            <button className="button primary" disabled={busy}>
              {busy
                ? "جارٍ المتابعة…"
                : admin || challenge
                  ? "تسجيل الدخول"
                  : "إرسال رمز التحقق"}
            </button>
            {challenge && (
              <button
                className="button soft"
                type="button"
                onClick={() => {
                  setChallenge(null);
                  setError("");
                }}
              >
                تغيير الرقم / طلب رمز جديد
              </button>
            )}
          </fieldset>
        </form>
        {admin && (
          <div className="login-links">
            <Link to="/login">دخول المحل</Link>
          </div>
        )}
        {!admin && (
          <p className="muted">لإضافة بقالتك تواصل مع إدارة النظام.</p>
        )}
      </section>
    </main>
  );
}
export function Allowed({
  roles,
  children,
}: {
  roles: string[];
  children: ReactNode;
}) {
  const { me } = useSession();
  return me?.roles.some((r) => roles.includes(r)) ? (
    children
  ) : (
    <section className="panel">
      <h1>لا تملك صلاحية هذه الصفحة</h1>
      <Link to={me && isPlatform(me) ? "/admin" : "/"}>
        العودة إلى الرئيسية
      </Link>
    </section>
  );
}
