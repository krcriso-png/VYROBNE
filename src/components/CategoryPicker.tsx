"use client";

import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { BAZOS_CATEGORIES } from "@/lib/bazos-categories";

// Two-step "click-through" category picker like on Bazoš: pick a Section, then
// a Subcategory. The parent stores the section key + subcategory label; the
// publisher uses them to route to the right section and pick the on-page option.
export function CategoryPicker({
  section,
  subcategory,
  onChange,
}: {
  section: string;
  subcategory: string;
  onChange: (section: string, subcategory: string) => void;
}) {
  const current = BAZOS_CATEGORIES.find((s) => s.key === section);

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div className="space-y-1.5">
        <Label htmlFor="bazos-section">Sekcia *</Label>
        <Select
          id="bazos-section"
          required
          value={section}
          onChange={(e) => onChange(e.target.value, "")}
        >
          <option value="">— vyber sekciu —</option>
          {BAZOS_CATEGORIES.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="bazos-subcategory">Podkategória *</Label>
        <Select
          id="bazos-subcategory"
          required
          disabled={!current}
          value={subcategory}
          onChange={(e) => onChange(section, e.target.value)}
        >
          <option value="">
            {current ? "— vyber podkategóriu —" : "najprv vyber sekciu"}
          </option>
          {current?.subcategories.map((sub) => (
            <option key={sub} value={sub}>
              {sub}
            </option>
          ))}
        </Select>
      </div>
    </div>
  );
}
