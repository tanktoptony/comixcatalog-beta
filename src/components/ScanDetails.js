"use client";

import { trackEvent } from "@/lib/analytics";

export const RAW_CONDITIONS = ["", "Poor", "Fair", "Good", "Very Good", "Fine", "Very Fine", "Near Mint", "Mint"];
export const SLAB_COMPANIES = ["", "CGC", "CBCS", "PGX"];
export const SLAB_GRADES = [0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6, 6.5, 7, 7.5, 8, 8.5, 9, 9.2, 9.4, 9.6, 9.8, 10];

export default function ScanDetails({ value, onChange, collapsed = false, onOpen }) {
  const slabbed = Boolean(value.slab_company);
  function change(key, next) {
    const patch = { ...value, [key]: next };
    if (key === "slab_company" && !next) Object.assign(patch, { grade_numeric: "", slab_cert_number: "" });
    onChange(patch); trackEvent("scan_details_set");
  }
  if (collapsed) return <button type="button" className="scan-details-toggle" onClick={onOpen}>Add details</button>;
  return <div className="scan-details">
    <label>Book type<select value={value.slab_company} onChange={(e) => change("slab_company", e.target.value)}>{SLAB_COMPANIES.map((company) => <option key={company} value={company}>{company || "Raw"}</option>)}</select></label>
    {slabbed ? <>
      <label>Grade<select value={value.grade_numeric} onChange={(e) => change("grade_numeric", e.target.value)}><option value="">Select grade</option>{SLAB_GRADES.map((grade) => <option key={grade} value={grade}>{grade.toFixed(1)}</option>)}</select></label>
      <label>Cert number<input value={value.slab_cert_number} onChange={(e) => change("slab_cert_number", e.target.value)} inputMode="numeric" /></label>
    </> : <label>Grade<select value={value.condition} onChange={(e) => change("condition", e.target.value)}>{RAW_CONDITIONS.map((condition) => <option key={condition} value={condition}>{condition || "Not set"}</option>)}</select></label>}
    <label>Price paid<input type="number" min="0" step="0.01" inputMode="decimal" value={value.purchase_price} onChange={(e) => change("purchase_price", e.target.value)} placeholder="0.00" /></label>
  </div>;
}
