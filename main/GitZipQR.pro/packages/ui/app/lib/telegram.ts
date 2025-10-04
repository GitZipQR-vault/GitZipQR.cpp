"use client";
export async function getCoinsTelegram(_n: number): Promise<{ok: boolean; timeout?: boolean}> {
  await new Promise(r => setTimeout(r, 1200));
  return { ok: false, timeout: true };
}
