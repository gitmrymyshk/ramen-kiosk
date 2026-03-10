"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Noodle = "硬め" | "普通" | "柔らかめ";
type Flavor = "濃いめ" | "普通" | "薄め";
type Oil = "多め" | "普通" | "少なめ";
type NoodleSize = "普通" | "大盛り";
type Rice = "なし" | "大盛り" | "普通" | "少なめ";

type ToppingKey = "ajitama" | "chashu" | "nori";

const TOPPING_LABEL: Record<ToppingKey, string> = {
  ajitama: "味玉",
  chashu: "チャーシュー増し",
  nori: "のり増し",
};

type Bowl = {
  bowlId: string;
  base: {
    key: string;
    name: string;
    unitPrice: number;
    image?: string;
  };
  options: {
    noodle: Noodle;
    flavor: Flavor;
    oil: Oil;
    noodlesize?: NoodleSize;
    rice: Rice;
    toppings: ToppingKey[];
  };
  price: number;
};

type Order = {
  id: string;
  items: Bowl[];
  total: number;
  created_at: string;
  status: string;
  seat_no: number | null;
  seat_nos?: number[] | null;
};

export default function KitchenPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fetchOrders = async () => {
    setErrorMsg(null);

    const { data, error } = await supabase
      .from("orders")
      .select("id, items, total, created_at, seat_no, seat_nos, status")
      .order("created_at", { ascending: false });

    if (error) {
      setErrorMsg(error.message);
      return;
    }

    setOrders((data ?? []) as Order[]);
  };

  useEffect(() => {
    fetchOrders();

    const channel = supabase
      .channel("orders-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders" },
        () => {
          fetchOrders();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const visibleOrders = orders
    .filter((o) => ["new", "seated", "done"].includes(o.status))
    .sort((a, b) => {
      if (a.status === "done" && b.status !== "done") return 1;
      if (a.status !== "done" && b.status === "done") return -1;
      return 0;
    });

  return (
    <main className="min-h-screen bg-gray-100 p-6">
      <div className="max-w-2xl mx-auto space-y-4">
        <h1 className="text-3xl font-bold">🍜 キッチン画面</h1>

        <button
          onClick={fetchOrders}
          className="border rounded-lg px-3 py-2 bg-white"
        >
          更新
        </button>

        {errorMsg && (
          <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded">
            エラー: {errorMsg}
          </div>
        )}

        <div className="space-y-4">
          {visibleOrders.map((order) => {
            const seatLabel =
              Array.isArray(order.seat_nos) && order.seat_nos.length > 0
                ? order.seat_nos.join(", ")
                : order.seat_no ?? "未割当";

            const hasSeat =
              (Array.isArray(order.seat_nos) && order.seat_nos.length > 0) ||
              order.seat_no != null;

            return (
              <div
                key={order.id}
                className={[
                  "p-4 rounded-xl shadow",
                  order.status === "done"
                    ? "bg-gray-100 text-gray-500"
                    : "bg-white",
                ].join(" ")}
              >
                <div className="text-xs text-gray-500">注文ID: {order.id}</div>

                <div className="text-xs text-gray-500">
                  注文時刻:{" "}
                  {new Date(order.created_at)
                    .toISOString()
                    .slice(0, 16)
                    .replace("T", " ")}
                </div>

                <div className="text-sm">
                  状態：
                  {order.status === "new" && (
                    <span className="ml-2 px-2 py-0.5 text-xs font-bold text-white bg-red-600 rounded">
                      NEW
                    </span>
                  )}

                  {order.status === "seated" && (
                    <span className="ml-2 px-2 py-0.5 text-xs font-bold text-white bg-blue-600 rounded">
                      SEATED
                    </span>
                  )}

                  {order.status === "done" && (
                    <span className="ml-2 px-2 py-0.5 text-xs font-bold text-white bg-gray-500 rounded">
                      DONE
                    </span>
                  )}

                  {!["new", "seated", "done"].includes(order.status) && (
                    <span className="ml-2 px-2 py-0.5 text-xs font-bold text-white bg-black rounded">
                      {order.status.toUpperCase()}
                    </span>
                  )}
                </div>

                <div className="text-sm">
                  席：<span className="font-semibold">{seatLabel}</span>
                </div>

                <div className="mt-3 space-y-2">
                  {Array.isArray(order.items) && order.items.length > 0 ? (
                    order.items.map((b: any, idx: number) => {
                      const isBowl = b?.base?.name && b?.options;

                      if (!isBowl) {
                        return (
                          <div key={idx} className="text-sm text-gray-700">
                            {b?.name ?? "item"} × {b?.quantity ?? 1}
                          </div>
                        );
                      }

                      const bowl = b as Bowl;
                      const noodlesize = bowl.options?.noodlesize ?? "普通";
                      const toppings = (bowl.options?.toppings ?? []).map(
                        (t) => TOPPING_LABEL[t] ?? t
                      );

                      return (
                        <div
                          key={bowl.bowlId ?? idx}
                          className="border rounded-xl p-3 bg-white/60"
                        >
                          <div className="font-bold">
                            {bowl.base.name} #{idx + 1}
                            <span className="ml-2 text-sm font-semibold text-gray-600">
                              {bowl.price}円
                            </span>
                          </div>

                          <div className="text-sm text-gray-700">
                            麺:{bowl.options.noodle} / 味:{bowl.options.flavor} /
                            油:{bowl.options.oil}
                          </div>

                          <div className="text-sm text-gray-700">
                            量:{noodlesize}
                          </div>

                          <div className="text-sm text-gray-700">
                            ライス:{bowl.options.rice}
                          </div>

                          <div className="text-sm text-gray-700">
                            トッピング:{" "}
                            {toppings.length ? toppings.join("、") : "なし"}
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="text-sm text-gray-600">
                      内容がありません
                    </div>
                  )}
                </div>

                <div className="mt-3 font-bold">合計: {order.total}円</div>

                <div className="mt-4 flex gap-2">
                  {order.status !== "done" ? (
                    <button
                      disabled={!hasSeat}
                      className={[
                        "px-3 py-2 rounded-lg text-white",
                        hasSeat
                          ? "bg-black"
                          : "bg-gray-400 cursor-not-allowed",
                      ].join(" ")}
                      onClick={async () => {
                        if (!hasSeat) return;

                        const { error } = await supabase
                          .from("orders")
                          .update({ status: "done" })
                          .eq("id", order.id);

                        if (error) {
                          alert("更新失敗: " + error.message);
                        }
                      }}
                    >
                      調理完了
                    </button>
                  ) : (
                    <span className="text-sm text-gray-500">完了済み</span>
                  )}
                </div>
              </div>
            );
          })}

          {orders.length === 0 && (
            <div className="text-gray-600">注文がまだありません</div>
          )}
        </div>
      </div>
    </main>
  );
}