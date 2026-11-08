"use client";
import { useEffect, useRef, useState, createContext, useContext } from "react";
import { cents } from "./money";
import { request, ApiError } from "../api/client";
import type { Page, Row } from "./types";
import type { Field, Values } from "./ui";
export const RefreshContext = createContext({ version: 0, refresh: () => {} });
export const failure = (e: unknown) =>
  e instanceof Error ? e.message : "تعذر تنفيذ الطلب.";
export function useData<T>(path: string | null) {
  const { version } = useContext(RefreshContext);
  const [retry, setRetry] = useState(0);
  const tag = path ? `${path}|${version}|${retry}` : null;
  const [state, setState] = useState<{
    data: T | null;
    error: string;
    tag: string | null;
  }>({ data: null, error: "", tag: null });
  useEffect(() => {
    if (!path) return;
    const c = new AbortController();
    let active = true;
    request<T>(path, { signal: c.signal })
      .then((data) => {
        if (active) setState({ data, error: "", tag });
      })
      .catch((e) => {
        if (active) setState({ data: null, error: failure(e), tag });
      });
    return () => {
      active = false;
      c.abort();
    };
  }, [path, tag]);
  const current = tag !== null && state.tag === tag;
  return {
    data: current ? state.data : null,
    error: current ? state.error : "",
    loading: tag !== null && !current,
    retry: () => setRetry((v) => v + 1),
  };
}
export function useList(path: string, query = "") {
  const [page, setPage] = useState(1);
  const r = useData<Page<Row>>(
    `${path}?page=${page}&pageSize=20${query ? "&" + query : ""}`,
  );
  return { ...r, page, setPage };
}
export function useCommand() {
  const { refresh } = useContext(RefreshContext);
  const pending = useRef(false);
  const keys = useRef(new Map<string, string>());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function run<T>(
    path: string,
    body: unknown = {},
    method = "POST",
  ): Promise<T | undefined> {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    const fingerprint = JSON.stringify([path, method, body]);
    const key = keys.current.get(fingerprint) || crypto.randomUUID();
    keys.current.set(fingerprint, key);
    try {
      const result = await request<T>(path, {
        method,
        body: JSON.stringify(body),
        headers: { "Idempotency-Key": key },
      });
      keys.current.delete(fingerprint);
      refresh();
      return result;
    } catch (e) {
      setError(failure(e));
      if (e instanceof ApiError && e.status !== 0 && e.status < 500)
        keys.current.delete(fingerprint);
      throw e;
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return { run, busy, error, clear: () => setError("") };
}
export function values(form: HTMLFormElement, fields: Field[]): Values {
  const d = new FormData(form);
  return Object.fromEntries(
    fields.map((f) => {
      const v = d.get(f.key);
      return [
        f.key,
        f.type === "checkbox"
          ? v === "on"
          : f.type === "money"
            ? cents(String(v ?? ""))
            : f.type === "number"
              ? Number(v)
              : String(v ?? "").trim(),
      ];
    }),
  );
}
