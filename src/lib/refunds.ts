/** Hours after payment during which a 1-star buyer may ask for a refund. */
export const REFUND_WINDOW_HOURS = 24;

export function withinRefundWindow(paidAt: string, now = Date.now()): boolean {
  return now - new Date(paidAt).getTime() < REFUND_WINDOW_HOURS * 3600 * 1000;
}
