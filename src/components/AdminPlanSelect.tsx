"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Select } from "@/components/ui/select";

const PLANS = ["FREE", "BASIC", "PRO"] as const;
const LABEL: Record<string, string> = { FREE: "Free", BASIC: "Štart", PRO: "Pro" };

// Admin control to change a user's subscription plan inline.
export function AdminPlanSelect({
  userId,
  plan,
}: {
  userId: string;
  plan: string;
}) {
  const router = useRouter();
  const [value, setValue] = useState(plan);
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState(false);

  async function change(next: string) {
    const prev = value;
    setValue(next);
    setBusy(true);
    setOk(false);
    const res = await fetch(`/api/admin/users/${userId}/plan`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ plan: next }),
    }).catch(() => null);
    setBusy(false);
    if (!res || !res.ok) {
      setValue(prev); // revert on failure
      return;
    }
    setOk(true);
    setTimeout(() => setOk(false), 2000);
    router.refresh();
  }

  return (
    <div className="flex items-center gap-2">
      <Select
        value={value}
        disabled={busy}
        onChange={(e) => change(e.target.value)}
        className="h-8 w-24 py-1 text-xs"
      >
        {PLANS.map((p) => (
          <option key={p} value={p}>
            {LABEL[p]}
          </option>
        ))}
      </Select>
      {ok && <span className="text-xs text-success">✓</span>}
    </div>
  );
}
