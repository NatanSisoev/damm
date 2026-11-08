"use client";

import { useId, useState } from "react";
import type { QueryDelivery } from "@damm/shared";
import { useT } from "@/lib/i18n/client";
import { hrDict, type HrKey } from "@/lib/i18n/hr";
import { DEFAULT_DELIVERY, DELIVERIES } from "@/lib/delivery";

interface Props {
  /** Controlled value; leave out to let the picker keep its own state (starts on the default). */
  value?: QueryDelivery;
  onChange?: (d: QueryDelivery) => void;
  /** Inline variant for one-click forms: no heading or hint line, the hint moves to a tooltip. */
  compact?: boolean;
}

/** Daily or one-time (campaign) choice, posted as the `delivery` form field. Shared by the new-query form and the suggested follow-ups. */
export function DeliveryPicker({ value, onChange, compact }: Props) {
  const t = useT(hrDict);
  const id = useId();
  const [own, setOwn] = useState<QueryDelivery>(DEFAULT_DELIVERY);
  const delivery = value ?? own;
  const set = (d: QueryDelivery) => {
    setOwn(d);
    onChange?.(d);
  };
  const labelId = `${id}-label`;
  const hintId = `${id}-hint`;
  return (
    <div>
      {compact ? (
        <span id={labelId} className="sr-only">{t("nf_delivery")}</span>
      ) : (
        <span id={labelId} className="label">{t("nf_delivery")}</span>
      )}
      <input type="hidden" name="delivery" value={delivery} />
      <div role="radiogroup" aria-labelledby={labelId} aria-describedby={compact ? undefined : hintId} className="flex gap-2">
        {DELIVERIES.map((d) => (
          <button
            key={d} type="button" role="radio" aria-checked={delivery === d}
            title={compact ? t(`nf_delivery_${d}_hint` as HrKey) : undefined}
            className={`btn ${compact ? "" : "flex-1 "}${delivery === d ? "btn-primary" : "btn-ghost"}`}
            onClick={() => set(d)}
          >
            {t(`nf_delivery_${d}` as HrKey)}
          </button>
        ))}
      </div>
      {!compact && <p id={hintId} className="mt-1 text-xs text-subtle" aria-live="polite">{t(`nf_delivery_${delivery}_hint` as HrKey)}</p>}
    </div>
  );
}
