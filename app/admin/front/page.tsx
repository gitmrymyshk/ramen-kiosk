"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type Order = {
  id: string;
  total: number;
  status: string;
  seat_no: number | null;
  created_at: string;
};

export default function FrontPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const fetchOrders = async () => {
    const { data, error } = await supabase
      .from("orders")
      .select("id,total,status,seat_no,created_at")
      .order("created_at", { ascending: false });

    if (!error && data) setOrders(data as any);
  };

  useEffect(() => {
    fetchOrders();

    // リアルタイム反映
    const ch = supabase
      .channel("orders-front-realtime")
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

  const waitingOrders = useMemo(
    () => orders.filter((o) => (o.status === "queued" || o.status === "new") && o.seat_no == null),
    [orders]
  );

  const occupiedSeats = useMemo(() => {
    const s = new Set<number>();
    for (const o of orders) {
      if (o.seat_no != null && o.status !== "closed" && o.status !== "canceled" && o.status !== "refunded") {
        s.add(o.seat_no);
      }
    }
    return s;
  }, [orders]);

  const seats = useMemo(() => Array.from({ length: 20 }, (_, i) => i + 1), []);

  const assignSeat = async (seatNo: number) => {
    if (!selectedOrderId) {
      alert("先に待ち注文を選んでください");
      return;
    }
    if (occupiedSeats.has(seatNo)) {
      alert(`席${seatNo}は使用中です`);
      return;
    }

    setBusy(true);
    try {
      const { error } = await supabase
        .from("orders")
        .update({ seat_no: seatNo, status: "seated" })
        .eq("id", selectedOrderId);

      if (error) {
        alert("割当失敗: " + error.message);
        return;
      }

      setSelectedOrderId(null);
    } finally {
      setBusy(false);
    }
  };

  const freeSeat = async (seatNo: number) => {
    // その席を使っている注文を探す（closed以外）
    const target = orders.find(
      (o) => o.seat_no === seatNo && o.status !== "closed"
    );

    if (!target) {
      alert(`席${seatNo}に紐づく注文が見つかりません`);
      return;
    }

    // done（調理完了）以外は空席にしない
    if (target.status !== "done") {
      alert(
        `席${seatNo}はまだ完了していません（status: ${target.status}）`
      );
      return;
    }

    setBusy(true);
    try {
      const { error } = await supabase
        .from("orders")
        .update({ status: "closed", seat_no: null })
        .eq("id", target.id);
  
      if (error) alert("空席化失敗: " + error.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="min-h-screen bg-gray-100 p-6">
      <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* 左：席一覧 */}
        <section className="bg-white rounded-2xl shadow p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold">🪑 フロント（席割当）</h1>
            <button className="border rounded-lg px-3 py-2" onClick={fetchOrders} disabled={busy}>
              更新
            </button>
          </div>

          <div className="text-sm text-gray-600">
            待ち：<span className="font-semibold text-black">{waitingOrders.length}</span> 件
          </div>

          <div className="grid grid-cols-5 gap-2">
            {seats.map((n) => {
              const isOcc = occupiedSeats.has(n);
              return (
                <button
                  key={n}
                  onClick={() => assignSeat(n)}
                  disabled={busy}
                  className={[
                    "rounded-xl p-3 border text-center",
                    isOcc ? "bg-gray-200 text-gray-500" : "bg-white text-black",
                    selectedOrderId ? "hover:bg-gray-50" : "",
                  ].join(" ")}
                  title={isOcc ? "使用中（空席化は右の操作で）" : "空席（選択中の注文に割当）"}
                >
                  <div className="text-lg font-bold">{n}</div>
                  <div className="text-xs">{isOcc ? "使用中" : "空席"}</div>

                  {isOcc && (
                    <div className="mt-2">
                      <button
                        className="text-xs underline"
                        onClick={(e) => {
                          e.stopPropagation();
                          freeSeat(n);
                        }}
                        disabled={busy}
                      >
                        空席にする
                      </button>
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          <div className="text-xs text-gray-500">
            ※ MVPは「席＝使用中/空席」を注文から推定しています（後で seats テーブルに分離できます）
          </div>
        </section>

        {/* 右：待ち注文 */}
        <section className="bg-white rounded-2xl shadow p-4 space-y-4">
          <h2 className="text-xl font-bold">⏳ 待ち注文（席未割当）</h2>

          {waitingOrders.length === 0 ? (
            <div className="text-gray-600">待ち注文はありません</div>
          ) : (
            <div className="space-y-2">
              {waitingOrders.map((o) => {
                const selected = selectedOrderId === o.id;
                return (
                  <button
                    key={o.id}
                    onClick={() => setSelectedOrderId(o.id)}
                    className={[
                      "w-full text-left border rounded-xl p-3",
                      selected ? "border-black bg-gray-50" : "bg-white",
                    ].join(" ")}
                  >
                    <div className="flex justify-between items-center">
                      <div className="font-semibold">注文 {o.id.slice(0, 6)}</div>
                      <div className="font-bold">{o.total}円</div>
                    </div>
                    <div className="text-xs text-gray-500">
                      {new Date(o.created_at).toLocaleString()} / status: {o.status}
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          <div className="text-sm text-gray-600">
            使い方：右で注文を選ぶ → 左の席番号を押す（割当）
          </div>
        </section>
      </div>
    </main>
  );
}
