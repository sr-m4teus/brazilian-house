"use server";
import { captureAll } from "../../lib/coc/capture";

export async function forceRefresh() {
  return captureAll();
}
