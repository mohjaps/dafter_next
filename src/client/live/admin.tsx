"use client";
import { useData, useList } from "./data";
import { useState } from "react";
import { Link } from "@/client/router";
import { useSession } from "./auth";
import {
  Action,
  EditButton,
  Heading,
  ItemList,
  ListPanel,
  Pager,
  SettingsForm,
  Status,
  Table,
} from "./ui";
import type { Field, Column } from "./ui";
import type { Row, Page } from "./types";
import { text, number, money, dateTime, today, roles } from "./types";
import { Picker } from "./merchant";
const named = (label: string, key: string): Column => ({
  label,
  render: (r) => text(r[key]) || "—",
});
const priced = (label: string, key: string): Column => ({
  label,
  render: (r) => money(r[key]),
});
const nameStatus = (r: Row) =>
  r.status === "suspended" ? "معلّق" : r.status === "overdue" ? "متأخر" : "نشط";
function useCan(...allowed: string[]) {
  return useSession().me!.roles.some((r) => allowed.includes(r));
}
export function Overview() {
  const r = useData<Row>("/admin/summary");
  return (
    <>
      <Heading title="نظرة عامة" />
      <Status {...r} />
      {r.data && (
        <>
          <section className="stats-grid">
            {[
              ["البقالات", r.data.shops],
              ["اشتراكات متأخرة", r.data.overdue],
              ["بقالات معلّقة", r.data.suspended],
              ["دفعات مسجلة", money(r.data.paymentsCents)],
            ].map(([label, value]) => (
              <article className="stat-card" key={text(label)}>
                <p>{text(label)}</p>
                <strong className="stat-value">{text(value)}</strong>
              </article>
            ))}
          </section>
          <section className="panel">
            <h2>متابعة الاشتراكات</h2>
            <p className="muted">
              {number(r.data.openTickets)} طلبات دعم مفتوحة.
            </p>
            <Link className="button soft" to="/admin/subscriptions">
              الاشتراكات والمتأخرات
            </Link>
          </section>
        </>
      )}
    </>
  );
}
export function Shops({ subscriptions = false }: { subscriptions?: boolean }) {
  const manage = useCan("PlatformAdmin");
  const bill = useCan("PlatformAdmin", "Billing");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState(subscriptions ? "overdue" : "");
  const r = useList(
    "/admin/shops",
    new URLSearchParams({ q: query, status: filter }).toString(),
  );
  const plans = useData<Page<Row>>("/admin/plans");
  const fields = (s?: Row): Field[] => [
    { key: "name", label: "اسم البقالة", value: s?.name },
    { key: "owner", label: "المالك", value: s?.owner },
    {
      key: "phone",
      label: "هاتف المالك",
      type: "tel",
      value: s?.phone,
      pattern: "0(59|56)[0-9]{7}",
      hint: "رقم فريد لحساب صاحب البقالة، مختلف عن حساب الإدارة.",
    },
    {
      key: "planId",
      label: "الخطة",
      type: "select",
      value: s?.planId,
      options: plans.data?.items
        .filter((p) => p.active || p.id === s?.planId)
        .map((p) => ({ value: p.id, label: text(p.name) })),
    },
    {
      key: "expiresOn",
      label: "انتهاء الاشتراك",
      type: "date",
      value: s?.expiresOn || today(),
      readOnly: !!s,
      hint: s ? "غيّر التاريخ من دفعة تجديد الاشتراك." : undefined,
    },
  ];
  return (
    <>
      <Heading title={subscriptions ? "الاشتراكات والمتأخرات" : "البقالات"}>
        {manage && (
          <EditButton
            disabled={!plans.data}
            title="إضافة بقالة"
            fields={fields()}
            onSave={(v, c) => c.run("/admin/shops", v)}
          />
        )}
      </Heading>
      <section className="panel">
        <div className="sales-toolbar">
          <input
            className="control grow"
            aria-label="بحث البقالات"
            placeholder="اسم البقالة أو المالك أو الهاتف…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              r.setPage(1);
            }}
          />
          <select
            aria-label="حالة الاشتراك"
            value={filter}
            onChange={(e) => {
              setFilter(e.target.value);
              r.setPage(1);
            }}
          >
            <option value="">كل الحالات</option>
            <option value="active">نشط</option>
            <option value="overdue">متأخر</option>
            <option value="suspended">معلّق</option>
          </select>
        </div>
        <Status {...r} />
        <Status {...plans} />
        {r.data && plans.data && (
          <>
            <Table
              rows={r.data.items}
              columns={[
                {
                  label: "البقالة / المالك",
                  render: (s) => (
                    <>
                      {text(s.name)}
                      <small className="block muted">{text(s.owner)}</small>
                      {!!s.suspensionReason && (
                        <small className="block wrap-cell">
                          {text(s.suspensionReason)}
                        </small>
                      )}
                    </>
                  ),
                },
                named("الهاتف", "phone"),
                {
                  label: "الخطة",
                  render: (s) =>
                    text(
                      plans.data!.items.find((p) => p.id === s.planId)?.name,
                    ),
                },
                named("انتهاء الاشتراك", "expiresOn"),
                {
                  label: "الحالة",
                  render: (s) => (
                    <span
                      className={`status ${s.status === "active" ? "cash" : "credit"}`}
                    >
                      {nameStatus(s)}
                    </span>
                  ),
                },
                {
                  label: "الإجراءات",
                  render: (s) => (
                    <div className="actions">
                      {manage && (
                        <EditButton
                          label="تعديل"
                          title="تعديل البقالة"
                          fields={fields(s)}
                          onSave={(v, c) =>
                            c.run(`/admin/shops/${s.id}`, v, "PATCH")
                          }
                        />
                      )}{" "}
                      {bill && (
                        <EditButton
                          label="تسجيل دفعة"
                          title={`تجديد اشتراك ${text(s.name)}`}
                          fields={[
                            {
                              key: "amountCents",
                              label: "المبلغ المستلم — ₪",
                              type: "money",
                              min: 0.01,
                            },
                            { key: "reference", label: "مرجع الدفع" },
                            {
                              key: "expiresOn",
                              label: "تاريخ الانتهاء الجديد",
                              type: "date",
                              min: today(),
                            },
                          ]}
                          onSave={(v, c) =>
                            c.run("/admin/subscription-payments", {
                              ...v,
                              shopId: s.id,
                            })
                          }
                        >
                          <p className="muted">
                            الانتهاء الحالي {text(s.expiresOn)}. التجديد لا يرفع
                            التعليق اليدوي ولا يسحب أموالًا إلكترونيًا.
                          </p>
                        </EditButton>
                      )}
                      {manage &&
                        (s.status === "suspended" ? (
                          <Action
                            label="إعادة تفعيل"
                            path={`/admin/shops/${s.id}/activate`}
                            confirmText="إعادة التفعيل؟ تاريخ الاشتراك سيبقى كما هو."
                          />
                        ) : (
                          <EditButton
                            label="تعليق"
                            title={`تعليق ${text(s.name)}`}
                            fields={[{ key: "reason", label: "سبب التعليق" }]}
                            onSave={(v, c) =>
                              c.run(`/admin/shops/${s.id}/suspend`, v)
                            }
                          >
                            <p className="muted">
                              سيمنع الخادم وصول البقالة بعد التعليق.
                            </p>
                          </EditButton>
                        ))}
                    </div>
                  ),
                },
              ]}
            />
            <Pager page={r.page} total={r.data.total} setPage={r.setPage} />
          </>
        )}
      </section>
    </>
  );
}
export function Plans() {
  const manage = useCan("PlatformAdmin");
  const r = useData<Page<Row>>("/admin/plans");
  const fields = (p?: Row): Field[] => [
    { key: "name", label: "اسم الخطة", value: p?.name },
    {
      key: "priceCents",
      label: "السعر — ₪",
      type: "money",
      value: p?.priceCents ?? 0,
      min: 0,
    },
    {
      key: "months",
      label: "المدة بالأشهر",
      type: "number",
      value: p?.months ?? 1,
      min: 1,
      max: 36,
    },
    {
      key: "devices",
      label: "حد الأجهزة",
      type: "number",
      value: p?.devices ?? 2,
      min: 1,
      max: 100,
    },
    {
      key: "active",
      label: "متاحة للاشتراكات الجديدة",
      type: "checkbox",
      value: p?.active ?? true,
    },
  ];
  return (
    <>
      <Heading title="خطط الاشتراك">
        {manage && (
          <EditButton
            title="إضافة خطة"
            fields={fields()}
            onSave={(v, c) => c.run("/admin/plans", v)}
          />
        )}
      </Heading>
      <Status {...r} />
      <div className="plan-grid">
        {r.data?.items.map((p) => (
          <article className="panel" key={p.id}>
            <h2>{text(p.name)}</h2>
            <strong className="stat-value">{money(p.priceCents)}</strong>
            <p className="muted">
              كل {text(p.months)} شهر · {text(p.devices)} أجهزة ·{" "}
              {p.active ? "متاحة" : "موقوفة للاشتراكات الجديدة"}
            </p>
            {manage && (
              <div className="actions">
                <EditButton
                  label="تعديل"
                  title="تعديل الخطة"
                  fields={fields(p)}
                  onSave={(v, c) => c.run(`/admin/plans/${p.id}`, v, "PATCH")}
                />
                <Action
                  label={p.active ? "إيقاف الخطة" : "إتاحة الخطة"}
                  path={`/admin/plans/${p.id}`}
                  method="PATCH"
                  body={{
                    name: p.name,
                    priceCents: p.priceCents,
                    months: p.months,
                    devices: p.devices,
                    active: !p.active,
                  }}
                />
              </div>
            )}
          </article>
        ))}
      </div>
      {r.data && !r.data.total && (
        <p className="empty-message">لم تُضف خطط بعد.</p>
      )}
    </>
  );
}
export function Payments() {
  const [shop, setShop] = useState<Row | null>(null);
  return (
    <>
      <Heading title="دفعات الاشتراك" />
      <section className="panel">
        <Picker<Row>
          path="/admin/shops"
          label="تصفية بالبقالة"
          onPick={setShop}
        />
        {shop && (
          <div className="detail-row">
            <span>{text(shop.name)}</span>
            <button className="button soft" onClick={() => setShop(null)}>
              عرض الكل
            </button>
          </div>
        )}
        <p className="muted">
          تُسجل دفعات التجديد من صفحة البقالات أو الاشتراكات.
        </p>
      </section>
      <ListPanel
        key={shop?.id || "all"}
        path="/admin/subscription-payments"
        query={shop ? "shopId=" + shop.id : ""}
        columns={[
          { label: "التاريخ", render: (r) => dateTime(r.date) },
          named("معرّف البقالة", "shopId"),
          priced("المبلغ", "amountCents"),
          named("المرجع", "reference"),
          named("الانتهاء السابق", "previousExpiry"),
          named("الانتهاء الجديد", "expiresOn"),
        ]}
      />
    </>
  );
}
export function Users() {
  const me = useSession().me!;
  const options = ["PlatformAdmin", "Support", "Billing"].map((value) => ({
    value,
    label: roles[value],
  }));
  return (
    <>
      <Heading title="مستخدمو الإدارة">
        <EditButton
          title="إضافة مستخدم إدارة"
          fields={[
            { key: "name", label: "الاسم" },
            {
              key: "phone",
              label: "الهاتف",
              type: "tel",
              pattern: "0(59|56)[0-9]{7}",
            },
            { key: "email", label: "البريد", type: "email" },
            { key: "role", label: "الدور", type: "select", options },
            {
              key: "password",
              label: "كلمة المرور — 12 حرفًا على الأقل",
              type: "password",
              pattern: ".{12,256}",
            },
          ]}
          onSave={(v, c) => c.run("/admin/users", v)}
        />
      </Heading>
      <ItemList
        path="/admin/users"
        columns={[
          named("الاسم", "name"),
          named("البريد", "email"),
          named("الهاتف", "phone"),
          { label: "الدور", render: (r) => roles[text(r.role)] },
          { label: "الحالة", render: (r) => (r.active ? "نشط" : "معطّل") },
          {
            label: "الإجراء",
            render: (r) =>
              r.id === me.userId ? (
                "حسابك الحالي"
              ) : (
                <EditButton
                  label="تعديل"
                  title="تعديل مستخدم الإدارة"
                  fields={[
                    { key: "name", label: "الاسم", value: r.name },
                    {
                      key: "role",
                      label: "الدور",
                      type: "select",
                      value: r.role,
                      options,
                    },
                    {
                      key: "active",
                      label: "نشط",
                      type: "checkbox",
                      value: r.active,
                    },
                  ]}
                  onSave={(v, c) => c.run(`/admin/users/${r.id}`, v, "PATCH")}
                />
              ),
          },
        ]}
      />
    </>
  );
}
export function Settings() {
  const r = useData<Row>("/admin/settings");
  return (
    <>
      <Heading title="إعدادات المنصة" />
      <Status {...r} />
      {r.data && (
        <SettingsForm
          path="/admin/settings"
          fields={[
            { key: "name", label: "اسم المنصة", value: r.data.name },
            {
              key: "phone",
              label: "هاتف الدعم",
              value: r.data.phone,
              optional: true,
            },
            {
              key: "email",
              label: "بريد الدعم",
              type: "email",
              value: r.data.email,
              optional: true,
            },
            {
              key: "graceDays",
              label: "مهلة السماح بالأيام",
              type: "number",
              value: r.data.graceDays,
              min: 0,
              max: 90,
            },
          ]}
        >
          <p className="muted">
            مهلة السماح تتحكم في وصول البقالات بعد انتهاء الاشتراك. التعليق
            اليدوي يمنع الوصول فورًا.
          </p>
        </SettingsForm>
      )}
    </>
  );
}
