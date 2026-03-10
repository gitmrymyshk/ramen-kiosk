"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type Order = {
    id: string;
    total: number;
    status: string;
    seat_no: number | null;
    created_at: string;
    items: any[];
};

type BowlLike = {
    base?: { name?: string };
    options?: {
        toppings?: string[];
        rice?: string; // "なし" | "大盛り" | "普通" | "少なめ" など
    };
};

const isValidStatus = (status: string) =>
    ["new", "seated", "done", "closed"].includes(status);

const toppingLabel = (t: string) => {
    switch (t) {
        case "ajitama":
            return "味玉";
        case "chashu":
            return "チャーシュー増し";
        case "nori":
            return "のり増し";
        default:
            return String(t);
    }
};

function requiredSeats(o: any) {
    if (!Array.isArray(o?.items)) return 1;

    const bowls = o.items.filter((it: any) => it?.bowlId && it?.base?.name && it?.options);
    return Math.max(1, bowls.length);
}

export default function FrontPage() {
    const [orders, setOrders] = useState<Order[]>([]);
    const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    const fetchOrders = async () => {
        const { data, error } = await supabase
            .from("orders")
            .select("id,total,status,seat_no,seat_nos,created_at,items")
            .order("created_at", { ascending: false });

        if (error) {
            console.error("fetchOrders error:", error.message);
            return;
        }
        setOrders((data ?? []) as any);
    };

    useEffect(() => {
        fetchOrders();

        const ch = supabase
            .channel("orders-front-realtime")
            .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => {
                fetchOrders();
            })
            .subscribe();

        return () => {
            supabase.removeChannel(ch);
        };
    }, []);

    const waitingOrders = useMemo(() => {
        return orders.filter((o: any) => {
            if (o.status !== "new") return false;
            const need = requiredSeats(o);
            const assigned = Array.isArray(o.seat_nos) ? o.seat_nos.length : 0;
            return assigned < need;
        });
    }, [orders]);

    const occupiedSeats = useMemo(() => {
        const s = new Set<number>();
        for (const o of orders) {
            if (["closed", "canceled", "refunded"].includes(o.status)) continue;

            // 新: seat_nos
            const arr = Array.isArray((o as any).seat_nos) ? (o as any).seat_nos : [];
            for (const n of arr) if (typeof n === "number") s.add(n);

            // 旧: seat_no（互換）
            if (o.seat_no != null) s.add(o.seat_no);
        }
        return s;
    }, [orders]);

    const seats = useMemo(() => Array.from({ length: 5 }, (_, i) => i + 1), []);

    // ダッシュボード
    const dashboard = useMemo(() => {
        const today = new Date();
        const isToday = (d: Date) => d.toDateString() === today.toDateString();

        // キャンセル系除外
        const validOrders = orders.filter((o) => isValidStatus(o.status));
        const todayOrders = validOrders.filter((o) => isToday(new Date(o.created_at)));

        const todaySales = todayOrders.reduce((sum, o) => sum + (o.total ?? 0), 0);

        const itemMap = new Map<string, number>();

        for (const o of todayOrders) {
            if (!Array.isArray(o.items)) continue;

            for (const it of o.items as any[]) {
                const bowl = it as BowlLike;
                const isBowl = !!(bowl?.base?.name && bowl?.options);

                if (isBowl) {
                    // ベース
                    const baseName = String(bowl.base!.name ?? "ラーメン");
                    itemMap.set(baseName, (itemMap.get(baseName) ?? 0) + 1);

                    // トッピング
                    const toppings = Array.isArray(bowl.options?.toppings) ? bowl.options!.toppings! : [];
                    for (const t of toppings) {
                        const label = toppingLabel(t);
                        itemMap.set(label, (itemMap.get(label) ?? 0) + 1);
                    }

                    // ライス（"なし" は集計しない）
                    const rice = bowl.options?.rice;
                    if (rice && rice !== "なし") {
                        const key = `ライス（${rice}）`;
                        itemMap.set(key, (itemMap.get(key) ?? 0) + 1);
                    }

                    continue;
                }

                // 旧形式: name × quantity
                const name = it?.name ?? it?.key ?? "unknown";
                const qty = Number(it?.quantity ?? 1);
                itemMap.set(String(name), (itemMap.get(String(name)) ?? 0) + qty);
            }
        }

        const items = Array.from(itemMap.entries())
            .map(([name, qty]) => ({ name, qty }))
            .sort((a, b) => b.qty - a.qty);

        return { todaySales, todayOrderCount: todayOrders.length, items };
    }, [orders]);

    const assignSeat = async (seatNo: number) => {
        const order = orders.find((o) => o.id === selectedOrderId) as any;
        if (!order) return alert("注文が見つかりません");
        if (occupiedSeats.has(seatNo)) return alert(`席${seatNo}は使用中です`);

        const need = requiredSeats(order);
        const current: number[] = Array.isArray(order.seat_nos) ? order.seat_nos : [];

        if (current.includes(seatNo)) return alert(`席${seatNo}は既に割当済みです`);
        if (current.length >= need) return alert("この注文の席割当は完了しています");

        const next = [...current, seatNo];
        const nextStatus = next.length === need ? "seated" : "new";

        setBusy(true);
        try {
            const { error } = await supabase
                .from("orders")
                .update({ seat_nos: next, status: nextStatus })
                .eq("id", order.id);

            if (error) return alert("割当失敗: " + error.message);

            if (nextStatus === "seated") setSelectedOrderId(null);
            await fetchOrders();
        } finally {
            setBusy(false);
        }
    };

    const freeSeat = async (seatNo: number) => {
        const target = orders.find(
            (o: any) => Array.isArray(o.seat_nos) && o.seat_nos.includes(seatNo)
        );

        if (!target) {
            return alert(`席${seatNo}に紐づく注文が見つかりません`);
        }

        const next = (target as any).seat_nos.filter((n: number) => n !== seatNo);

        // done の注文は空席化したら closed にする
        const nextStatus = target.status === "done" ? "closed" : "new";

        setBusy(true);
        try {
            const { error } = await supabase
                .from("orders")
                .update({
                    seat_nos: next,
                    seat_no: null, // 旧カラムも念のため空にしておく
                    status: nextStatus,
                })
                .eq("id", target.id);

            if (error) {
                return alert("空席化失敗: " + error.message);
            }

            await fetchOrders();
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

                    <div className="rounded-xl border p-3 bg-white space-y-2">
                        <div className="text-sm text-gray-600">📊 今日の売上</div>
                        <div className="text-2xl font-extrabold">{dashboard.todaySales.toLocaleString()}円</div>
                        <div className="text-sm text-gray-600">注文数：{dashboard.todayOrderCount}件</div>

                        <div className="pt-2 border-t">
                            <div className="text-sm font-semibold">商品別（数量）</div>
                            {dashboard.items.length === 0 ? (
                                <div className="text-sm text-gray-500">まだありません</div>
                            ) : (
                                <div className="space-y-1">
                                    {dashboard.items.slice(0, 10).map((x) => (
                                        <div key={x.name} className="flex justify-between text-sm">
                                            <span>{x.name}</span>
                                            <span className="font-semibold">{x.qty}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="grid grid-cols-5 gap-2">
                        {seats.map((n) => {
                            const isOcc = occupiedSeats.has(n);
                            return (
                                <div
                                    key={n}
                                    onClick={() => !isOcc && assignSeat(n)}
                                    className={[
                                        "rounded-xl p-3 border text-center cursor-pointer",
                                        isOcc ? "bg-gray-200 text-gray-500" : "bg-white text-black",
                                        selectedOrderId ? "hover:bg-gray-50" : "",
                                    ].join(" ")}
                                >
                                    <div className="text-lg font-bold">{n}</div>
                                    <div className="text-xs">{isOcc ? "使用中" : "空席"}</div>

                                    {isOcc && (
                                        <div className="mt-2">
                                            <button
                                                className="text-xs underline"
                                                onClick={(e) => {
                                                    e.stopPropagation(); // 親クリック（assignSeat）を止める
                                                    freeSeat(n);
                                                }}
                                                disabled={busy}
                                            >
                                                空席にする
                                            </button>
                                        </div>
                                    )}
                                </div>
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
                                            {new Date(o.created_at).toISOString().slice(0, 16).replace("T", " ")} / status:{" "}
                                            {o.status}
                                        </div>
                                        <div className="text-xs text-gray-500">
                                            必要席数：{requiredSeats(o)} / 割当済：{Array.isArray((o as any).seat_nos) ? (o as any).seat_nos.length : 0}
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    )}

                    <div className="text-sm text-gray-600">使い方：右で注文を選ぶ → 左の席番号を押す（割当）</div>
                </section>
            </div>
        </main>
    );
}