import { supabase } from "./supabaseClient";

// Central place to define which schema each logical table actually lives in.
// This matches the ERD you shared: sensor_data/weather_data are in `public`,
// most experiment metadata and ML tables live in the `experiment` schema.
const TABLE_SCHEMA = {
  sensor_data: "public",
  weather_data: "public",
  // core experiment objects
  tubs: "experiment",
  experiments: "experiment",
  mapping: "experiment",
  tub_config: "experiment",
  // derived / ML tables
  processed_readings: "ml",
  computed_scores: "ml",
  plant_health_labels: "ml",
  wifi_status: "public",
  // sensor status lives in public
  sensor_status: "public",
};

function getSchemasFor(table, fallback) {
  const preferred = TABLE_SCHEMA[table];
  if (preferred) return [preferred];
  return fallback && fallback.length ? fallback : ["experiment", "public"];
}

export async function fromAnySchema(table, select, opts = {}) {
  const schemas = getSchemasFor(table, opts.schemas);
  let lastError = null;

  for (const schema of schemas) {
    const q = schema ? supabase.schema(schema).from(table) : supabase.from(table);
    // eslint-disable-next-line no-await-in-loop
    const res = await q.select(select);
    if (!res.error) return { ...res, schemaUsed: schema };
    lastError = { ...res.error, schemaTried: schema };
  }

  return { data: null, error: lastError, schemaUsed: null };
}

export async function queryAnySchema(table, buildQuery, opts = {}) {
  const schemas = getSchemasFor(table, opts.schemas);
  let lastError = null;

  for (const schema of schemas) {
    const base = schema ? supabase.schema(schema).from(table) : supabase.from(table);
    const q = buildQuery(base);
    // eslint-disable-next-line no-await-in-loop
    const res = await q;
    if (!res.error) return { ...res, schemaUsed: schema };
    lastError = { ...res.error, schemaTried: schema };
  }

  return { data: null, error: lastError, schemaUsed: null };
}

export function normalizeSupabaseError(err) {
  if (!err) return null;
  return {
    message: err.message ?? "Unknown error",
    code: err.code ?? null,
    hint: err.hint ?? null,
    details: err.details ?? null,
    schemaTried: err.schemaTried ?? null,
  };
}

export function isValidDate(d) {
  return d instanceof Date && !Number.isNaN(d.getTime());
}

export function safeDate(iso) {
  const d = new Date(iso);
  return isValidDate(d) ? d : null;
}

