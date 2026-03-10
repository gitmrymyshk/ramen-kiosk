"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type Order = {
  id: string;
  status: string;
  seat_no: number | null;
  seat_nos?: number[] | null;
};

export default function ShopDemoPage() {
  const [orders, setOrders] = useState<Order[]>([]);

  const fetchOrders = async () => {
    const { data, error } = await supabase
      .from("orders")
      .select("id,status,seat_no,seat_nos");

    if (error) {
      console.error("fetchOrders error:", error.message);
      return;
    }

    if (data) setOrders(data as any);
  };

  useEffect(() => {
    fetchOrders();

    const ch = supabase
      .channel("shop-demo-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders" },
        () => fetchOrders()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(ch);
    };
  }, []);

  // 待ち組数
  // 「new」の注文で、まだ席が1つも割り当たっていないものを待ち扱い
  const waitingCount = useMemo(() => {
    return orders.filter((o) => {
      if (o.status !== "new") return false;

      const hasSeatNos = Array.isArray(o.seat_nos) && o.seat_nos.length > 0;
      const hasSeatNo = o.seat_no != null;

      return !hasSeatNos && !hasSeatNo;
    }).length;
  }, [orders]);

  // 使用中の席数
  const occupiedCount = useMemo(() => {
    const s = new Set<number>();

    for (const o of orders) {
      if (["closed", "canceled", "refunded"].includes(o.status)) continue;

      // 新方式: seat_nos
      if (Array.isArray(o.seat_nos)) {
        for (const n of o.seat_nos) {
          if (typeof n === "number") s.add(n);
        }
      }

      // 旧方式: seat_no
      if (o.seat_no != null) {
        s.add(o.seat_no);
      }
    }

    return s.size;
  }, [orders]);

  const isFull = occupiedCount >= 5;

  return (
    <main className="min-h-screen bg-white p-6">
      <div className="max-w-md mx-auto space-y-4">
        <h1 className="text-3xl font-bold">🍜 デモラーメン</h1>

        <div className="rounded-2xl border p-4 space-y-4">
          <div>
            <div className="text-sm text-gray-600">現在の待ち</div>
            <div className="text-5xl font-extrabold">{waitingCount}</div>
          </div>

          <div>
            <div className="text-sm text-gray-600">席状況</div>
            <div className="text-lg font-semibold">
              {occupiedCount}/5 {isFull ? "（満席）" : "（空きあり）"}
            </div>
          </div>
        </div>

        <div className="text-xs text-gray-500">
          ※ デモ表示（本番は店ごとに集計します）
        </div>
      </div>
    </main>
  );
}