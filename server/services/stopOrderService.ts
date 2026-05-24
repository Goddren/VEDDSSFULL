/**
 * stopOrderService.ts
 * Manages pending stop (breakout) orders: creation, trigger scanning,
 * and cancellation. Wired into the MT5 chart-data price feed so every
 * incoming price tick checks whether any PENDING orders have crossed.
 */

import { db } from "../db";
import { stopOrders } from "../../shared/schema";
import { eq, and, sql } from "drizzle-orm";
import type { StopOrder, InsertStopOrder } from "../../shared/schema";

// ── Create ────────────────────────────────────────────────────────────────────

/**
 * Validate and insert a new stop order.
 * BUY_STOP  → trigger must be ABOVE current price
 * SELL_STOP → trigger must be BELOW current price
 */
export async function createStopOrder(
  params: InsertStopOrder & { currentPrice?: number },
): Promise<StopOrder> {
  const { currentPrice, ...insertData } = params;

  // Direction vs price validation (when currentPrice is supplied)
  if (currentPrice != null && currentPrice > 0) {
    if (insertData.direction === "BUY_STOP" && insertData.triggerPrice <= currentPrice) {
      throw new Error(
        `BUY_STOP trigger price (${insertData.triggerPrice}) must be above current price (${currentPrice})`,
      );
    }
    if (insertData.direction === "SELL_STOP" && insertData.triggerPrice >= currentPrice) {
      throw new Error(
        `SELL_STOP trigger price (${insertData.triggerPrice}) must be below current price (${currentPrice})`,
      );
    }
  }

  const [order] = await db
    .insert(stopOrders)
    .values({ ...insertData, status: "PENDING", updatedAt: new Date() })
    .returning();

  console.log(
    `[StopOrders] Created ${order.direction} @ ${order.triggerPrice} for ${order.symbol} (id=${order.id})`,
  );
  return order;
}

// ── Trigger scanner ───────────────────────────────────────────────────────────

/**
 * Scans all PENDING stop orders for a given symbol and fires any whose
 * trigger price has been crossed by currentPrice.
 *
 * Called on every MT5 chart-data tick — must be non-blocking (fire & forget).
 * Returns the list of orders that were triggered so callers can log/notify.
 */
export async function checkBreakoutTriggers(
  symbol: string,
  currentPrice: number,
): Promise<StopOrder[]> {
  if (!currentPrice || currentPrice <= 0) return [];

  const normalised = symbol.toUpperCase().replace("/", "");

  // Fetch all PENDING orders for this symbol
  let pending: StopOrder[];
  try {
    pending = await db
      .select()
      .from(stopOrders)
      .where(
        and(
          eq(stopOrders.symbol, normalised),
          eq(stopOrders.status, "PENDING"),
        ),
      );
  } catch (err) {
    console.error("[StopOrders] DB error reading pending orders:", (err as Error).message);
    return [];
  }

  if (pending.length === 0) return [];

  const triggered: StopOrder[] = [];

  for (const order of pending) {
    const shouldFire =
      (order.direction === "BUY_STOP"  && currentPrice >= order.triggerPrice) ||
      (order.direction === "SELL_STOP" && currentPrice <= order.triggerPrice);

    if (!shouldFire) continue;

    try {
      const [updated] = await db
        .update(stopOrders)
        .set({
          status:      "TRIGGERED",
          triggeredAt: new Date(),
          updatedAt:   new Date(),
        })
        .where(and(eq(stopOrders.id, order.id), eq(stopOrders.status, "PENDING")))
        .returning();

      if (updated) {
        triggered.push(updated);
        console.log(
          `[StopOrders] TRIGGERED ${updated.direction} id=${updated.id} ` +
          `symbol=${updated.symbol} trigger=${updated.triggerPrice} current=${currentPrice}`,
        );
      }
    } catch (err) {
      console.error(`[StopOrders] Failed to trigger order id=${order.id}:`, (err as Error).message);
    }
  }

  return triggered;
}

// ── Cancel ────────────────────────────────────────────────────────────────────

/**
 * Soft-cancel a stop order. userId guard prevents cross-user cancellations.
 */
export async function cancelStopOrder(
  orderId: number,
  userId: number,
): Promise<StopOrder> {
  const [existing] = await db
    .select()
    .from(stopOrders)
    .where(and(eq(stopOrders.id, orderId), eq(stopOrders.userId, userId)));

  if (!existing) {
    throw new Error(`Stop order id=${orderId} not found for this user`);
  }
  if (existing.status !== "PENDING") {
    throw new Error(`Stop order id=${orderId} is already ${existing.status}`);
  }

  const [cancelled] = await db
    .update(stopOrders)
    .set({ status: "CANCELLED", cancelledAt: new Date(), updatedAt: new Date() })
    .where(and(eq(stopOrders.id, orderId), eq(stopOrders.userId, userId)))
    .returning();

  console.log(`[StopOrders] Cancelled id=${orderId} userId=${userId}`);
  return cancelled;
}

// ── Queries (used by REST handlers + storage) ─────────────────────────────────

export async function getStopOrdersForUser(
  userId: number,
  filters: { symbol?: string; status?: string } = {},
): Promise<StopOrder[]> {
  // Build conditions array dynamically
  const conditions = [eq(stopOrders.userId, userId)];

  if (filters.symbol) {
    conditions.push(eq(stopOrders.symbol, filters.symbol.toUpperCase().replace("/", "")));
  }
  if (filters.status) {
    conditions.push(eq(stopOrders.status, filters.status.toUpperCase()));
  }

  return db
    .select()
    .from(stopOrders)
    .where(and(...conditions))
    .orderBy(sql`${stopOrders.createdAt} DESC`);
}
