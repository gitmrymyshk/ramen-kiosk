"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export default function SuccessPage() {
  const [msg, setMsg] = useState("決済確認中...");

  useEffect(() => {
    const session_id = new URLSearchParams(window.location.search).get("session_id");
    if (!session_id) {
      setMsg("session_id がありません");
      return;
    }

    (async () => {
      const res = await fetch("/api/checkout/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id }),
      });
      const json = await res.json();

      if (res.ok) setMsg("🎉 決済が完了しました！");
      else setMsg("確認失敗: " + (json?.error ?? json?.status ?? "unknown"));
    })();
  }, []);

  return (
    <main className="min-h-screen bg-white p-6 flex items-center justify-center">
      <div className="text-center space-y-6">
        <div className="text-2xl font-bold">{msg}</div>

        <Link
          href="/"
          className="inline-block px-6 py-3 rounded-2xl bg-black text-white"
        >
          メニューに戻る
        </Link>
      </div>
    </main>
  );
}