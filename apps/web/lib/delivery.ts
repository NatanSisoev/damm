import type { QueryDelivery } from "@damm/shared";

/** The delivery choices of a query, in display order. Labels live in hrDict as nf_delivery_<mode>. */
export const DELIVERIES: readonly QueryDelivery[] = ["daily", "campaign"];

/** Default for every flow that creates a query: it joins the daily set. */
export const DEFAULT_DELIVERY: QueryDelivery = "daily";

/** Reads the delivery field of a submitted form; anything unknown falls back to the default. */
export function parseDelivery(value: FormDataEntryValue | null): QueryDelivery {
  return value === "campaign" ? "campaign" : DEFAULT_DELIVERY;
}
