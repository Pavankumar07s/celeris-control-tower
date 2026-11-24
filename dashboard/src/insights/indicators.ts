// Readable names for the eight macro indicators (keys as in macro.json), shared by Macro lead / lag and What-if.
export const IND: Record<string, { short: string; name: string; unit: string }> = {
  ism_manufacturing_pmi: { short: "PMI", name: "ISM manufacturing PMI", unit: "points" },
  auto_production_yoy_pct: { short: "Auto production", name: "Auto production, year on year", unit: "pts" },
  vehicle_inventory_days: { short: "Inventory days", name: "Vehicle inventory days", unit: "days" },
  raw_material_cost_index: { short: "Raw material cost", name: "Raw material cost index", unit: "index points" },
  new_vehicle_orders_index: { short: "Vehicle orders", name: "New vehicle orders index", unit: "index points" },
  industrial_util_rate_pct: { short: "Utilisation", name: "Industrial utilisation rate", unit: "pts" },
  fuel_price_index: { short: "Fuel price", name: "Fuel price index", unit: "index points" },
  ev_adoption_index: { short: "EV adoption", name: "EV adoption index", unit: "index points" },
};
export const indShort = (k: string): string => IND[k]?.short ?? k.replace(/_/g, " ");
export const indName = (k: string): string => IND[k]?.name ?? k.replace(/_/g, " ");
