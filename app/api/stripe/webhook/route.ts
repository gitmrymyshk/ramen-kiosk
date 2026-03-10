import Stripe from "stripe";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs"; // 念のため

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2024-06-20",
});

export async function POST(req: Request) {
  const sig = req.headers.get("stripe-signature");
  if (!sig) return NextResponse.json({ error: "no signature" }, { status: 400 });

  const rawBody = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      rawBody,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err: any) {
    console.error("Webhook signature verify failed:", err?.message);
    return NextResponse.json({ error: "invalid signature" }, { status: 400 });
  }

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const orderId = session.metadata?.orderId;

      if (!orderId) {
        console.error("No orderId in metadata");
        return NextResponse.json({ received: true });
      }

      // ✅ 決済完了 → 注文を new にする（フロントが待ちとして拾う）
      const { error } = await supabaseAdmin
        .from("orders")
        .update({
          status: "new",
          // デバッグ用に残したければ
          // paid_at: new Date().toISOString(),
          // stripe_session_id: session.id,
          // payment_intent: session.payment_intent,
        })
        .eq("id", orderId);

      if (error) console.error("supabase update error:", error.message);
    }

    return NextResponse.json({ received: true });
  } catch (e: any) {
    console.error("Webhook handler error:", e?.message);
    return NextResponse.json({ error: "webhook handler failed" }, { status: 500 });
  }
}