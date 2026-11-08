"use client";
/** Minimal react-router-style API on top of Next.js navigation, so screens stay framework-agnostic. */
import NextLink from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import type { AnchorHTMLAttributes, ReactNode } from "react";

type LinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & { to: string; replace?: boolean; children?: ReactNode };
export function Link({ to, replace, ...rest }: LinkProps) {
  return <NextLink href={to} replace={replace} {...rest} />;
}

type NavLinkProps = Omit<LinkProps, "className"> & { end?: boolean; className?: string | ((s: { isActive: boolean }) => string) };
export function NavLink({ to, end, className, ...rest }: NavLinkProps) {
  const pathname = usePathname() || "/";
  const isActive = end ? pathname === to : pathname === to || pathname.startsWith(to.endsWith("/") ? to : to + "/");
  const cls = typeof className === "function" ? className({ isActive }) : className;
  return <Link to={to} className={cls} aria-current={isActive ? "page" : undefined} {...rest} />;
}

export function useNavigate() {
  const router = useRouter();
  return (to: string, options: { replace?: boolean } = {}) => (options.replace ? router.replace(to) : router.push(to));
}

export function Navigate({ to, replace }: { to: string; replace?: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (replace) router.replace(to);
    else router.push(to);
  }, [router, to, replace]);
  return null;
}
