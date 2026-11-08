"use client";
import { useEffect, useId, useRef } from "react";
import type { KeyboardEvent } from "react";
import { FileText, RotateCcw, X } from "lucide-react";
import { InvoiceView } from "./invoice";
import { ReturnPanel } from "./returns";
import type { Invoice } from "./types";
export function InvoiceDetails({
  invoice,
  onClose,
  tab,
  onTabChange,
}: {
  invoice: Invoice;
  onClose: () => void;
  tab: number;
  onTabChange: (tab: number) => void;
}) {
  const id = useId();
  const section = useRef<HTMLElement>(null);
  useEffect(() => {
    section.current?.scrollIntoView?.({ behavior: "smooth", block: "start" });
  }, []);
  function navigate(e: KeyboardEvent<HTMLDivElement>) {
    const next =
      e.key === "ArrowLeft" || e.key === "ArrowRight"
        ? 1 - tab
        : e.key === "Home"
          ? 0
          : e.key === "End"
            ? 1
            : null;
    if (next === null) return;
    e.preventDefault();
    onTabChange(next);
    const buttons =
      e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]');
    buttons[next]?.focus();
  }
  return (
    <section
      ref={section}
      className="invoice-workspace section-gap"
      aria-label={`تفاصيل الفاتورة ${invoice.number}`}
    >
      <div className="invoice-workspace-toolbar">
        <div
          className="invoice-tabs"
          role="tablist"
          aria-label="تفاصيل الفاتورة"
          onKeyDown={navigate}
        >
          {["الفاتورة", "المرتجعات"].map((label, index) => (
            <button
              key={label}
              id={`${id}-tab-${index}`}
              role="tab"
              aria-selected={tab === index}
              aria-controls={`${id}-panel-${index}`}
              tabIndex={tab === index ? 0 : -1}
              onClick={() => onTabChange(index)}
            >
              {index === 0 ? <FileText size={17} /> : <RotateCcw size={17} />}{" "}
              {label}
            </button>
          ))}
        </div>
        <button className="button soft invoice-close" onClick={onClose}>
          <X size={16} /> إغلاق التفاصيل
        </button>
      </div>
      <div
        className="invoice-tabpanel"
        id={`${id}-panel-0`}
        role="tabpanel"
        aria-labelledby={`${id}-tab-0`}
        hidden={tab !== 0}
      >
        <InvoiceView invoice={invoice} />
      </div>
      <div
        className="invoice-tabpanel"
        id={`${id}-panel-1`}
        role="tabpanel"
        aria-labelledby={`${id}-tab-1`}
        hidden={tab !== 1}
      >
        <ReturnPanel invoice={invoice} />
      </div>
    </section>
  );
}
