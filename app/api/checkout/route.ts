import Stripe from "stripe";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2024-06-20",
});

// サーバー専用（RLS回避）
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: Request) {
  try {
    const { bowls } = await req.json();

    if (!Array.isArray(bowls) || bowls.length === 0) {
      return NextResponse.json({ error: "bowls is empty" }, { status: 400 });
    }

    const total = bowls.reduce((sum: number, b: any) => sum + Number(b.price ?? 0), 0);

    // ① 先に注文を作る（pending_payment）
    const { data: order, error: orderErr } = await supabaseAdmin
      .from("orders")
      .insert({
        items: bowls,
        total,
        status: "pending_payment",
        seat_no: null,
      })
      .select("id")
      .single();

    if (orderErr || !order?.id) {
      return NextResponse.json({ error: orderErr?.message ?? "order insert failed" }, { status: 500 });
    }

    const orderId = order.id;

    // ② Stripe checkout session（orderIdを紐づける）
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: bowls.map((b: any) => ({
        price_data: {
          currency: "jpy",
          product_data: { name: b.base?.name ?? "ラーメン" },
          unit_amount: Number(b.price ?? 0),
        },
        quantity: 1,
      })),

      // ★重要：これで confirm が orders.id を特定できる
      metadata: { orderId },
      client_reference_id: orderId,

      // ★重要：successにsession_idを自動で付ける
      success_url: `${process.env.NEXT_PUBLIC_BASE_URL}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.NEXT_PUBLIC_BASE_URL}/?canceled=1`,
    });

    return NextResponse.json({ url: session.url });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: e?.message ?? "unknown error" }, { status: 500 });
  }
}