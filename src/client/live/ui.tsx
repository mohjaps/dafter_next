"use client";
import { useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { X, RefreshCw, Plus, ChevronRight, ChevronLeft } from "lucide-react";
import { useCommand, useData, useList, values } from "./data";
import type { Row } from "./types";
import { text, number } from "./types";
export function Status({
  loading,
  error,
  retry,
}: {
  loading: boolean;
  error: string;
  retry: () => void;
}) {
  return loading ? (
    <p className="loading-state" role="status">
      جارٍ تحميل البيانات…
    </p>
  ) : error ? (
    <div className="error-state" role="alert">
      <p>{error}</p>
      <button className="button soft" onClick={retry}>
        <RefreshCw size={16} />
        إعادة المحاولة
      </button>
    </div>
  ) : null;
}
export function Heading({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <section className="page-heading">
      <div>
        <p className="eyebrow">دفتر · إدارة أبسط لتجارتك</p>
        <h1>{title}</h1>
      </div>
      <div className="actions">{children}</div>
    </section>
  );
}
export type Column = { label: string; render: (r: Row) => ReactNode };
export function Table({
  rows,
  columns,
  empty = "لا توجد سجلات بعد.",
}: {
  rows: Row[];
  columns: Column[];
  empty?: string;
}) {
  return rows.length ? (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            {columns.map((c, i) => (
              <th key={i}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              {columns.map((c, i) => (
                <td key={i}>{c.render(r)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ) : (
    <p className="empty-message">{empty}</p>
  );
}
export function Pager({
  page,
  total,
  setPage,
}: {
  page: number;
  total: number;
  setPage: (p: number) => void;
}) {
  return (
    <div className="actions pagination">
      <button
        className="button soft"
        disabled={page <= 1}
        onClick={() => setPage(page - 1)}
      >
        <ChevronRight size={16} />
        السابق
      </button>
      <span>
        صفحة {page} · {total} سجل
      </span>
      <button
        className="button soft"
        disabled={page * 20 >= total}
        onClick={() => setPage(page + 1)}
      >
        التالي
        <ChevronLeft size={16} />
      </button>
    </div>
  );
}
export function ListPanel({
  path,
  columns,
  query = "",
  children,
}: {
  path: string;
  columns: Column[];
  query?: string;
  children?: ReactNode;
}) {
  const r = useList(path, query);
  return (
    <section className="panel">
      {children}
      <Status {...r} />
      {r.data && (
        <>
          <Table rows={r.data.items} columns={columns} />
          <Pager page={r.page} total={r.data.total} setPage={r.setPage} />
        </>
      )}
    </section>
  );
}
export type Values = Record<string, string | number | boolean>;
export type Field = {
  key: string;
  label: string;
  type?:
    | "text"
    | "email"
    | "password"
    | "tel"
    | "number"
    | "money"
    | "date"
    | "textarea"
    | "select"
    | "checkbox";
  value?: unknown;
  options?: { value: string; label: string }[];
  optional?: boolean;
  min?: number | string;
  max?: number | string;
  step?: number | string;
  readOnly?: boolean;
  pattern?: string;
  hint?: string;
};
export function Fields({ fields }: { fields: Field[] }) {
  return (
    <>
      {fields.map((f) => (
        <label key={f.key}>
          {f.label}
          {f.type === "select" ? (
            <select
              name={f.key}
              defaultValue={text(f.value)}
              required={!f.optional}
              disabled={f.readOnly}
            >
              {f.optional && <option value="">بدون</option>}
              {f.options?.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          ) : f.type === "textarea" ? (
            <textarea
              name={f.key}
              required={!f.optional}
              defaultValue={text(f.value)}
              maxLength={4000}
            />
          ) : (
            <input
              name={f.key}
              type={f.type === "money" ? "number" : f.type || "text"}
              defaultValue={
                f.type === "checkbox"
                  ? undefined
                  : f.type === "money" && f.value != null
                    ? number(f.value) / 100
                    : text(f.value)
              }
              defaultChecked={
                f.type === "checkbox" ? Boolean(f.value) : undefined
              }
              required={!f.optional && f.type !== "checkbox"}
              readOnly={f.readOnly}
              min={f.min}
              max={f.max}
              step={
                f.step ??
                (f.type === "money"
                  ? "0.01"
                  : f.type === "number"
                    ? "1"
                    : undefined)
              }
              pattern={f.pattern}
              maxLength={f.type === "password" ? 256 : 500}
              autoComplete={f.type === "password" ? "new-password" : undefined}
            />
          )}{" "}
          {f.hint && <small className="muted">{f.hint}</small>}
        </label>
      ))}
    </>
  );
}
export function EditButton({
  label = "إضافة",
  title,
  fields,
  onSave,
  disabled = false,
  children,
}: {
  label?: string;
  title: string;
  fields: Field[];
  onSave: (
    v: Values,
    command: ReturnType<typeof useCommand>,
  ) => Promise<unknown>;
  disabled?: boolean;
  children?: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const command = useCommand();
  const [epoch, setEpoch] = useState(0);
  const [localError, setLocalError] = useState("");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLocalError("");
    try {
      const v = values(e.currentTarget, fields);
      await onSave(v, command);
      dialog.current?.close();
      setEpoch((x) => x + 1);
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : "راجع البيانات.");
    }
  }
  return (
    <>
      <button
        className="button soft"
        disabled={disabled}
        onClick={() => {
          command.clear();
          setLocalError("");
          setEpoch((x) => x + 1);
          dialog.current?.showModal();
        }}
      >
        {label === "إضافة" && <Plus size={16} />} {label}
      </button>
      <dialog
        ref={dialog}
        className="sales-dialog customer-add-dialog"
        aria-label={title}
        onCancel={(e) => {
          if (command.busy) e.preventDefault();
        }}
      >
        <button
          className="icon-button dialog-close"
          aria-label="إغلاق"
          disabled={command.busy}
          onClick={() => dialog.current?.close()}
        >
          <X size={20} />
        </button>
        <h2>{title}</h2>
        {children}
        <form key={epoch} className="customer-form" onSubmit={submit}>
          <fieldset disabled={command.busy} className="connected-fields">
            <Fields fields={fields} />
            {(localError || command.error) && (
              <p className="customer-error" role="alert">
                {localError || command.error}
              </p>
            )}
            <button className="button primary" disabled={command.busy}>
              {command.busy ? "جارٍ الحفظ…" : "حفظ"}
            </button>
          </fieldset>
        </form>
      </dialog>
    </>
  );
}
export function Action({
  label,
  path,
  body = {},
  method = "POST",
  confirmText,
  disabled = false,
}: {
  label: string;
  path: string;
  body?: unknown;
  method?: string;
  confirmText?: string;
  disabled?: boolean;
}) {
  const c = useCommand();
  return (
    <span>
      <button
        className="button soft"
        disabled={disabled || c.busy}
        onClick={() => {
          if (!confirmText || confirm(confirmText))
            void c.run(path, body, method).catch(() => {});
        }}
      >
        {c.busy ? "جارٍ التنفيذ…" : label}
      </button>
      {c.error && (
        <small className="customer-error" role="alert">
          {c.error}
        </small>
      )}
    </span>
  );
}
export function SettingsForm({
  fields,
  path,
  children,
}: {
  fields: Field[];
  path: string;
  children?: ReactNode;
}) {
  const c = useCommand();
  const [saved, setSaved] = useState(false);
  return (
    <form
      className="panel customer-form"
      onSubmit={async (e) => {
        e.preventDefault();
        const body = values(e.currentTarget, fields);
        setSaved(false);
        try {
          await c.run(path, body, "PATCH");
          setSaved(true);
        } catch {
          /* displayed below */
        }
      }}
    >
      <fieldset className="connected-fields" disabled={c.busy}>
        <div className="form-grid">
          <Fields fields={fields} />
        </div>
        {children}
        {c.error && (
          <p className="customer-error" role="alert">
            {c.error}
          </p>
        )}
        {saved && <p role="status">تم الحفظ.</p>}
        <button className="button primary">
          {c.busy ? "جارٍ الحفظ…" : "حفظ الإعدادات"}
        </button>
      </fieldset>
    </form>
  );
}
export function ItemList({
  path,
  columns,
}: {
  path: string;
  columns: Column[];
}) {
  const r = useData<{ items: Row[] }>(path);
  return (
    <section className="panel">
      <Status {...r} />
      {r.data && <Table rows={r.data.items} columns={columns} />}
    </section>
  );
}
