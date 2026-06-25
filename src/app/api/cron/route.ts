import { NextResponse } from "next/server";
import { captureAll } from "../../../lib/coc/capture";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const result = await captureAll();
  return NextResponse.json(result);
}
