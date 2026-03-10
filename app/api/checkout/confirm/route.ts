import Stripe from "stripe";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const STRIPE_KEY = process.env.STRIPE_SECRET_KEY;

const supabaseUrl =
  process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export async function POST(req: Request) {
  try {
    if (!STRIPE_KEY) {
      return NextResponse.json({ error: "STRIPE_SECRET_KEY is missing" }, { status: 500 });
    }
    if (!STRIPE_KEY.startsWith("sk_")) {
      return NextResponse.json({ error: "STRIPE_SECRET_KEY must start with sk_" }, { status: 500 });
    }
    if (!supabaseUrl || !supabaseUrl.startsWith("http")) {
      return NextResponse.json(
        { error: `Supabase URL is invalid: ${supabaseUrl ?? "(empty)"}` },
        { status: 500 }
      );
    }
    if (!serviceKey) {
      return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY is missing" }, { status: 500 });
    }

    const stripe = new Stripe(STRIPE_KEY, { apiVersion: "2024-06-20" });

    const { session_id } = await req.json();
    if (!session_id) {
      return NextResponse.json({ error: "session_id required" }, { status: 400 });
    }

    const session = await stripe.checkout.sessions.retrieve(session_id);

    if (session.payment_status !== "paid") {
      return NextResponse.json(
        { ok: false, payment_status: session.payment_status },
        { status: 400 }
      );
    }

    const orderId = session.metadata?.orderId || session.client_reference_id;
    if (!orderId) {
      return NextResponse.json(
        { error: "orderId not found (metadata.orderId / client_reference_id missing)" },
        { status: 400 }
      );
    }

    const { error } = await supabaseAdmin
      .from("orders")
      .update({ status: "new" })
      .eq("id", orderId);

    if (error) {
      return NextResponse.json({ error: "Supabase update failed: " + error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, orderId });
  } catch (e: any) {
    console.error("confirm error:", e);
    return NextResponse.json(
      { error: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}