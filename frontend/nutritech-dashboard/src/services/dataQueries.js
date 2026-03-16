import { supabase } from "./supabaseClient";

/**
 * DATABASE SCHEMA MAPPING
 * This object defines which table belongs to which Postgres schema in Supabase.
 * - 'public': Standard tables (sensors, weather).
 * - 'experiment': Business logic and metadata.
 * - 'ml': Machine learning outputs and scores.
 */
const TABLE_SCHEMA = {
  sensor_data: "public",
  weather_data: "public",
  // Core experiment objects (buckets, settings, etc.)
  tubs: "experiment",
  experiments: "experiment",
  mapping: "experiment",
  tub_config: "experiment",
  // Derived / Machine Learning tables
  processed_readings: "ml",
  computed_scores: "ml",
  plant_health_labels: "ml",
  wifi_status: "public",
  // Hardware status
  sensor_status: "public",
};


function getSchemasFor(table, fallback) {
  const preferred = TABLE_SCHEMA[table];
  if (preferred) return [preferred];
  return fallback && fallback.length ? fallback : ["experiment", "public"];
}

/**
 * Fetches data from a table, searching across multiple schemas if necessary.
 * @param {string} table - Table name.
 * @param {string} select - Columns to select.
 * @param {object} opts - Options including fallback schemas.
 */
export async function fromAnySchema(table, select, opts = {}) {
  const schemas = getSchemasFor(table, opts.schemas);
  let lastError = null;

  // Iterate through potential schemas until a successful query or all fail
  for (const schema of schemas) {
    const q = schema ? supabase.schema(schema).from(table) : supabase.from(table);
    // eslint-disable-next-line no-await-in-loop
    const res = await q.select(select);
    
    // If query succeeds (no error), return the data and identify the schema used
    if (!res.error) return { ...res, schemaUsed: schema };
    lastError = { ...res.error, schemaTried: schema };
  }

  return { data: null, error: lastError, schemaUsed: null };
}

/**
 * Executes a custom query builder across multiple schemas.
 * @param {string} table - Table name.
 * @param {function} buildQuery - Callback to add filters/order/limit to the query.
 */
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

