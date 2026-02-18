"use client";

import { supabase } from "@/lib/supabase";
import { useMemo, useState } from "react";

type MenuItem = {
  id: string;
  name: string;
  price: number;
  customizable?: boolean;
};

const MENU: MenuItem[] = [
  { id: "shoyu", name: "醤油ラーメン", price: 900, customizable: true },
  { id: "aji", name: "味玉", price: 150 },
  { id: "chashu", name: "チャーシュー増し", price: 300 },
];

type NoodleHardness = "やわめ" | "普通" | "硬め" | "バリカタ";

type CartKey = string; // 例: "shoyu|硬め" / "aji"
type CartItem = {
  key: CartKey;
  menuId: string;
  name: string;
  unitPrice: number;
  quantity: number;
  options?: {
    hardness?: NoodleHardness;
  };
};

const HARDNESS_OPTIONS: NoodleHardness[] = ["やわめ", "普通", "硬め", "バリカタ"];

function makeKey(menuId: string, hardness?: NoodleHardness) {
  return hardness ? `${menuId}|${hardness}` : menuId;
}

export default function Home() {
  // key -> CartItem
  const [cart, setCart] = useState<Record<CartKey, CartItem>>({});
  const [customizing, setCustomizing] = useState<{
    open: boolean;
    menu?: MenuItem;
    hardness: NoodleHardness;
  }>({ open: false, hardness: "普通" });

  const total = useMemo(() => {
    return Object.values(cart).reduce((sum, it) => sum + it.unitPrice * it.quantity, 0);
  }, [cart]);

  const addSimple = (menu: MenuItem) => {
    const key = makeKey(menu.id);
    setCart((c) => {
      const cur = c[key];
      const nextQty = (cur?.quantity ?? 0) + 1;
      return {
        ...c,
        [key]: {
          key,
          menuId: menu.id,
          name: menu.name,
          unitPrice: menu.price,
          quantity: nextQty,
        },
      };
    });
  };

  const addCustomized = (menu: MenuItem, hardness: NoodleHardness) => {
    const key = makeKey(menu.id, hardness);
    const label = `${menu.name}（麺：${hardness}）`;
    setCart((c) => {
      const cur = c[key];
      const nextQty = (cur?.quantity ?? 0) + 1;
      return {
        ...c,
        [key]: {
          key,
          menuId: menu.id,
          name: label,
          unitPrice: menu.price,
          quantity: nextQty,
          options: { hardness },
        },
      };
    });
  };

  const removeOne = (key: CartKey) => {
    setCart((c) => {
      const cur = c[key];
      if (!cur) return c;
      const nextQty = cur.quantity - 1;
      const copy = { ...c };
      if (nextQty <= 0) delete copy[key];
      else copy[key] = { ...cur, quantity: nextQty };
      return copy;
    });
  };

  const openCustomize = (menu: MenuItem) => {
    setCustomizing({ open: true, menu, hardness: "普通" });
  };

  const closeCustomize = () => setCustomizing((s) => ({ ...s, open: false }));

  const confirmCustomize = () => {
    if (!customizing.menu) return;
    addCustomized(customizing.menu, customizing.hardness);
    closeCustomize();
  };

  return (
    <main className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-md mx-auto space-y-4">
        <h1 className="text-2xl font-bold text-center">🍜 デモラーメン</h1>

        {/* メニュー一覧 */}
        <div className="space-y-3">
          {MENU.map((item) => (
            <div
              key={item.id}
              className="bg-white rounded-xl shadow p-4 flex justify-between items-center"
            >
              <div>
                <div className="font-semibold text-black">{item.name}</div>
                <div className="text-sm text-gray-600">{item.price}円</div>
                {item.customizable && (
                  <div className="text-xs text-gray-500 mt-1">麺の硬さを選べます</div>
                )}
              </div>

              <div className="flex items-center gap-2">
                {item.customizable ? (
                  <button
                    onClick={() => openCustomize(item)}
                    className="px-3 py-2 rounded-lg border bg-white"
                  >
                    カスタム
                  </button>
                ) : (
                  <>
                    <button
                      onClick={() => removeOne(makeKey(item.id))}
                      className="w-9 h-9 rounded-full border bg-white"
                    >
                      −
                    </button>
                    <div className="w-6 text-center text-black">
                      {cart[makeKey(item.id)]?.quantity ?? 0}
                    </div>
                    <button
                      onClick={() => addSimple(item)}
                      className="w-9 h-9 rounded-full border bg-white"
                    >
                      ＋
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* カート */}
        <div className="bg-white rounded-xl shadow p-4 space-y-3">
          <div className="font-bold text-black">カート</div>

          {Object.keys(cart).length === 0 ? (
            <div className="text-sm text-gray-600">まだ何も入っていません</div>
          ) : (
            <div className="space-y-2">
              {Object.values(cart).map((it) => (
                <div key={it.key} className="flex items-center justify-between">
                  <div className="pr-2">
                    <div className="text-sm font-medium text-black">{it.name}</div>
                    <div className="text-xs text-gray-600">
                      {it.unitPrice}円 × {it.quantity}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => removeOne(it.key)}
                      className="w-8 h-8 rounded-full border bg-white"
                    >
                      −
                    </button>
                    <div className="w-6 text-center text-black">{it.quantity}</div>
                    <button
                      onClick={() => {
                        // 同じキーのものを +1
                        setCart((c) => ({
                          ...c,
                          [it.key]: { ...it, quantity: it.quantity + 1 },
                        }));
                      }}
                      className="w-8 h-8 rounded-full border bg-white"
                    >
                      ＋
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="pt-2 border-t flex justify-between font-bold text-black">
            <span>合計</span>
            <span>{total}円</span>
          </div>
        </div>

        <button
          disabled={total === 0}
          className="w-full bg-black text-white py-3 rounded-xl disabled:opacity-30"
          onClick={async () => {
            const items = Object.values(cart);

            const { error } = await supabase.from("orders").insert({
              items,
              total,
              status: "queued", // 席が未確定＝待ち
              seat_no: null,
            });

            if (error) {
              alert("保存失敗: " + error.message);
            } else {
              alert("注文が保存されました！");
              setCart({});
            }
          }}
        >
          注文する
        </button>
      </div>

      {/* カスタムモーダル */}
      {customizing.open && (
        <div className="fixed inset-0 bg-black/40 flex items-end justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-2xl p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div className="font-bold text-black">
                {customizing.menu?.name} のカスタム
              </div>
              <button onClick={closeCustomize} className="text-gray-600">
                閉じる
              </button>
            </div>

            <div className="space-y-2">
              <div className="text-sm font-medium text-black">麺の硬さ</div>
              <div className="grid grid-cols-2 gap-2">
                {HARDNESS_OPTIONS.map((h) => {
                  const selected = customizing.hardness === h;
                  return (
                    <button
                      key={h}
                      onClick={() => setCustomizing((s) => ({ ...s, hardness: h }))}
                      className={[
                        "border rounded-xl p-3 text-left",
                        selected ? "border-black bg-gray-100" : "bg-white",
                      ].join(" ")}
                    >
                      <div className="font-medium text-black">{h}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            <button
              onClick={confirmCustomize}
              className="w-full bg-black text-white py-3 rounded-xl"
            >
              この内容で追加
            </button>

            <div className="text-xs text-gray-500">
              ※ MVPなので「醤油ラーメンのみ」硬さ指定できるようにしています
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
