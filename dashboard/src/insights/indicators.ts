// Readable names for the eight macro indicators (keys as in macro.json), shared by Macro lead / lag and What-if.
//  unit  = the unit of a shift or a change ("points" for rates and diffusion indices, where changes are read in
//          points, never as a % change of a percentage);
//  level = what the value itself is measured in (the caption under a path);
//  rate  = the value is a rate or a diffusion index: its changes print in points ("−2.1 pts"), levels print in %;
//  plural = the short name takes a plural verb ("Vehicle orders lead", "PMI leads").
export const IND: Record<string, { short: string; name: string; unit: string; level: string; rate?: boolean; plural?: boolean }> = {
  ism_manufacturing_pmi: { short: "PMI", name: "ISM manufacturing PMI", unit: "points", level: "index points (50 = no change)", rate: true },
  auto_production_yoy_pct: { short: "Auto production", name: "Auto production, year on year", unit: "points", level: "year-on-year % change", rate: true },
  vehicle_inventory_days: { short: "Inventory days", name: "Vehicle inventory days", unit: "days", level: "days", plural: true },
  raw_material_cost_index: { short: "Raw material cost", name: "Raw material cost index", unit: "index points", level: "index points" },
  new_vehicle_orders_index: { short: "Vehicle orders", name: "New vehicle orders index", unit: "index points", level: "index points", plural: true },
  industrial_util_rate_pct: { short: "Utilisation", name: "Industrial utilisation rate", unit: "points", level: "% of capacity", rate: true },
  fuel_price_index: { short: "Fuel price", name: "Fuel price index", unit: "index points", level: "index points" },
  ev_adoption_index: { short: "EV adoption", name: "EV adoption index", unit: "index points", level: "index points" },
};
export const indShort = (k: string): string => IND[k]?.short ?? k.replace(/_/g, " ");
export const indName = (k: string): string => IND[k]?.name ?? k.replace(/_/g, " ");
/** True when the indicator's changes are read in points (rates, diffusion indices). */
export const indIsRate = (k: string): boolean => IND[k]?.rate === true || /_pct$/.test(k);
/** Subject-verb agreement for the short name: verb("new_vehicle_orders_index", "lead", "leads") -> "lead". */
export const indVerb = (k: string, plural: string, singular: string): string => (IND[k]?.plural ? plural : singular);
