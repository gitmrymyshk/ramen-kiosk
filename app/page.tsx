"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type Noodle = "硬め" | "普通" | "柔らかめ";
type Flavor = "濃いめ" | "普通" | "薄め";
type Oil = "多め" | "普通" | "少なめ";
type NoodleSize = "普通" | "大盛り";
type Rice = "なし" | "大盛り" | "普通" | "少なめ";
type MenuBaseKey = "ramen" | "chashu_ramen";
type ToppingKey = "ajitama" | "chashu" | "nori";

type Bowl = {
  bowlId: string;
  base: {
    key: MenuBaseKey;
    name: string;
    unitPrice: number;
    image: string;
  };
  options: {
    noodle: Noodle;
    flavor: Flavor;
    oil: Oil;
    noodlesize: NoodleSize;
    rice: Rice;
    toppings: ToppingKey[];
  };
  price: number;
};

const PRICES = {
  ramen: 900,
  chashu_ramen: 1200, // ←ここは後で変更OK
  toppings: {
    ajitama: 150,
    chashu: 300,
    nori: 200,
  },
  noodlesize: {
    普通: 0,
    大盛り: 200,
  },
  rice: {
    なし: 0,
    大盛り: 200,
    普通: 150,
    少なめ: 100,
  },
} as const;

const TOPPING_LABEL: Record<ToppingKey, string> = {
  ajitama: "味玉",
  chashu: "チャーシュー増し",
  nori: "のり増し",
};

const TOPPING_IMAGE: Record<ToppingKey, string> = {
  ajitama: "/images/ajitama.jpg",
  chashu: "/images/chashu.jpg",
  nori: "/images/nori.jpg",
};

const BASES = [
  {
    key: "ramen" as const,
    name: "ラーメン",
    unitPrice: PRICES.ramen,
    image: "/images/ramen.png",
  },
  {
    key: "chashu_ramen" as const,
    name: "チャーシューラーメン",
    unitPrice: PRICES.chashu_ramen,
    image: "/images/chashu-ramen.png",
  },
];

function calcBowlPrice(bowl: Bowl) {
  const base = bowl.base.unitPrice;
  const rice = PRICES.rice[bowl.options.rice] ?? 0;
  const noodlesize = PRICES.noodlesize[bowl.options.noodlesize] ?? 0;
  const toppings = bowl.options.toppings.reduce((sum, t) => sum + PRICES.toppings[t], 0);
  return base + noodlesize + rice + toppings;
}

function defaultBowl(baseKey: MenuBaseKey): Bowl {
  const base = BASES.find((b) => b.key === baseKey)!;
  const bowl: Bowl = {
    bowlId: crypto.randomUUID(),
    base,
    options: {
      noodle: "普通",
      flavor: "普通",
      oil: "普通",
      noodlesize: "普通",
      rice: "なし",
      toppings: [],
    },
    price: base.unitPrice,
  };
  bowl.price = calcBowlPrice(bowl);
  return bowl;
}

export default function Page() {
  const [bowls, setBowls] = useState<Bowl[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const total = useMemo(() => bowls.reduce((sum, b) => sum + b.price, 0), [bowls]);

  const editing = useMemo(
    () => bowls.find((b) => b.bowlId === editingId) ?? null,
    [bowls, editingId]
  );

  const updateEditing = (patch: Partial<Bowl["options"]>) => {
    if (!editing) return;
    setBowls((prev) =>
      prev.map((b) => {
        if (b.bowlId !== editing.bowlId) return b;
        const next: Bowl = {
          ...b,
          options: { ...b.options, ...patch },
          price: b.price,
        };
        next.price = calcBowlPrice(next);
        return next;
      })
    );
  };

  const toggleTopping = (t: ToppingKey) => {
    if (!editing) return;
    const has = editing.options.toppings.includes(t);
    const next = has
      ? editing.options.toppings.filter((x) => x !== t)
      : [...editing.options.toppings, t];
    updateEditing({ toppings: next });
  };

  const addBowl = (baseKey: MenuBaseKey) => {
    setBowls((prev) => [...prev, defaultBowl(baseKey)]);
  };

  const removeBowl = (bowlId: string) => {
    setBowls((prev) => prev.filter((b) => b.bowlId !== bowlId));
    if (editingId === bowlId) setEditingId(null);
  };

  const submitOrder = async () => {
    if (bowls.length === 0) return alert("ラーメンを追加してください");

    const res = await fetch("/api/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bowls }),
    });

    const data = await res.json();
    if (!res.ok) return alert(data?.error ?? "checkout error");

    window.location.href = data.url;
  };

  return (
    <main className="min-h-screen bg-white p-6">
      <div className="max-w-3xl mx-auto space-y-6">
        <h1 className="text-3xl font-bold">🍜 注文</h1>

        {/* 価格表 */}
        <section className="rounded-2xl">
          <div className="text-xl font-bold mb-3">価格表</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {BASES.map((b) => (
              <div key={b.key} className="flex items-center gap-3 border rounded-xl p-3">
                <div className="relative w-16 h-16 rounded-lg overflow-hidden bg-gray-100">
                  <Image src={b.image} alt={b.name} fill className="object-cover" />
                </div>
                <div className="flex-1">
                  <div className="font-semibold">{b.name}</div>
                  <div className="text-sm text-gray-600">{b.unitPrice}円</div>
                </div>
                <button
                  className="px-3 py-2 rounded-xl bg-black text-white"
                  onClick={() => addBowl(b.key)}
                >
                  追加
                </button>
              </div>
            ))}
          </div>

          <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-2 text-sm">
            <div className="border rounded-xl p-2">麺大盛り +{PRICES.rice.大盛り}円</div>
            <div className="border rounded-xl p-2">味玉 +{PRICES.toppings.ajitama}円</div>
            <div className="border rounded-xl p-2">チャーシュー増し +{PRICES.toppings.chashu}円</div>
            <div className="border rounded-xl p-2">のり増し +{PRICES.toppings.nori}円</div>
          </div>
        </section>

        {/* カート（ラーメン単位） */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold">カート（ラーメン単位）</h2>
            <div className="text-lg font-extrabold">合計 {total}円</div>
          </div>

          {bowls.length === 0 ? (
            <div className="text-gray-600">まだ追加されていません</div>
          ) : (
            <div className="space-y-3">
              {bowls.map((b, idx) => (
                <div key={b.bowlId} className="border rounded-2xl p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="relative w-16 h-16 rounded-lg overflow-hidden bg-gray-100">
                        <Image src={b.base.image} alt={b.base.name} fill className="object-cover" />
                      </div>
                      <div>
                        <div className="font-bold">
                          {b.base.name} #{idx + 1}
                        </div>
                        <div className="text-sm text-gray-600">
                          麺:{b.options.noodle} / 味:{b.options.flavor} / 油:{b.options.oil}
                        </div>
                        <div className="text-sm text-gray-600">
                          量:{b.options.noodlesize}
                        </div>
                        <div className="text-sm text-gray-600">
                          ライス:{b.options.rice}
                        </div>
                        <div className="text-sm text-gray-600">
                          トッピング:{" "}
                          {b.options.toppings.length === 0
                            ? "なし"
                            : b.options.toppings.map((t) => TOPPING_LABEL[t]).join("、")}
                        </div>
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="font-extrabold">{b.price}円</div>
                      <div className="mt-2 flex gap-2 justify-end">
                        <button
                          className="px-3 py-2 rounded-xl border"
                          onClick={() => setEditingId(b.bowlId)}
                        >
                          カスタム
                        </button>
                        <button
                          className="px-3 py-2 rounded-xl border text-red-600"
                          onClick={() => removeBowl(b.bowlId)}
                        >
                          削除
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <button
            className="w-full px-4 py-3 rounded-2xl bg-black text-white disabled:opacity-50"
            onClick={submitOrder}
            disabled={submitting || bowls.length === 0}
          >
            {submitting ? "送信中..." : "注文する"}
          </button>
        </section>

        {/* カスタム モーダル */}
        {editing && (
          <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center p-4">
            <div className="bg-white w-full max-w-lg rounded-2xl p-4 space-y-4">
              <div className="flex items-center justify-between">
                <div className="text-xl font-bold">カスタム：{editing.base.name}</div>
                <button className="px-3 py-2 rounded-xl border" onClick={() => setEditingId(null)}>
                  閉じる
                </button>
              </div>

              <div className="space-y-3">
                <div>
                  <div className="font-semibold mb-2">麺の硬さ</div>
                  <div className="flex gap-2">
                    {(["硬め", "普通", "柔らかめ"] as Noodle[]).map((v) => (
                      <button
                        key={v}
                        className={[
                          "px-3 py-2 rounded-xl border",
                          editing.options.noodle === v ? "bg-black text-white" : "bg-white",
                        ].join(" ")}
                        onClick={() => updateEditing({ noodle: v })}
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="font-semibold mb-2">味の濃さ</div>
                  <div className="flex gap-2">
                    {(["濃いめ", "普通", "薄め"] as Flavor[]).map((v) => (
                      <button
                        key={v}
                        className={[
                          "px-3 py-2 rounded-xl border",
                          editing.options.flavor === v ? "bg-black text-white" : "bg-white",
                        ].join(" ")}
                        onClick={() => updateEditing({ flavor: v })}
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="font-semibold mb-2">油の量</div>
                  <div className="flex gap-2">
                    {(["多め", "普通", "少なめ"] as Oil[]).map((v) => (
                      <button
                        key={v}
                        className={[
                          "px-3 py-2 rounded-xl border",
                          editing.options.oil === v ? "bg-black text-white" : "bg-white",
                        ].join(" ")}
                        onClick={() => updateEditing({ oil: v })}
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="font-semibold mb-2">麺の量</div>
                  <div className="flex gap-2">
                    {(["普通", "大盛り"] as NoodleSize[]).map((v) => (
                      <button
                        key={v}
                        className={[
                          "px-3 py-2 rounded-xl border",
                          editing.options.noodlesize === v ? "bg-black text-white" : "bg-white",
                        ].join(" ")}
                        onClick={() => updateEditing({ noodlesize: v })}
                      >
                        {v}
                        {PRICES.noodlesize[v] > 0 && ` (+${PRICES.noodlesize[v]}円)`}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="font-semibold mb-2">ライス</div>
                  <div className="flex gap-2">
                    {(["なし", "大盛り", "普通", "少なめ"] as Rice[]).map((v) => (
                      <button
                        key={v}
                        className={[
                          "px-3 py-2 rounded-xl border",
                          editing.options.rice === v ? "bg-black text-white" : "bg-white",
                        ].join(" ")}
                        onClick={() => updateEditing({ rice: v })}
                      >
                        {v}
                        {PRICES.rice[v] > 0 && ` (+${PRICES.rice[v]}円)`}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="font-semibold mb-2">トッピング</div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {(["ajitama", "chashu", "nori"] as ToppingKey[]).map((t) => {
                      const active = editing.options.toppings.includes(t);
                      return (
                        <button
                          key={t}
                          className={[
                            "border rounded-xl p-2 text-left",
                            active ? "bg-black text-white" : "bg-white",
                          ].join(" ")}
                          onClick={() => toggleTopping(t)}
                        >
                          <div className="flex items-center gap-2">
                            <div className="relative w-10 h-10 rounded-lg overflow-hidden bg-gray-100">
                              <Image src={TOPPING_IMAGE[t]} alt={TOPPING_LABEL[t]} fill className="object-cover" />
                            </div>
                            <div>
                              <div className="font-semibold">{TOPPING_LABEL[t]}</div>
                              <div className={active ? "text-white/80 text-xs" : "text-gray-600 text-xs"}>
                                +{PRICES.toppings[t]}円
                              </div>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="pt-2 border-t flex items-center justify-between">
                  <div className="text-sm text-gray-600">この1杯の合計</div>
                  <div className="text-xl font-extrabold">{editing.price}円</div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
