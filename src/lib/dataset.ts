import type { Dataset, ModelInfo, Protein, Site } from './types';

const BASE = import.meta.env.BASE_URL;

interface RawSite extends Omit<Site, 'protein' | 'calls'> { p: string; c: string }
interface RawDataset { version: string; source: string; aa: string; models: ModelInfo[]; model_order: string[]; proteins: Protein[]; sites: RawSite[] }

export function parseDataset(raw: RawDataset): Dataset {
  const byKey = new Map(raw.proteins.map((p) => [p.key, p]));
  const sites: Site[] = raw.sites.map(({ p, c, ...s }) => ({ ...s, protein: byKey.get(p)!, calls: Object.fromEntries(raw.model_order.map((m, k) => [m, c[k]])) }));
  return { version: raw.version, source: raw.source, aa: raw.aa, models: raw.models, proteins: raw.proteins, sites };
}

export async function loadDataset(): Promise<Dataset> {
  const r = await fetch(`${BASE}data/dataset.json`);
  if (!r.ok) throw new Error(`dataset.json: HTTP ${r.status}`);
  return parseDataset(await r.json());
}

let icons: Promise<Record<string, string>> | null = null;
export function loadIcons(): Promise<Record<string, string>> {
  icons ??= fetch(`${BASE}data/aa_icons.json`).then((r) => r.json());
  return icons;
}

const pdbCache = new Map<string, Promise<string>>();
export function loadStructure(key: string): Promise<string> {
  if (!pdbCache.has(key)) pdbCache.set(key, fetch(`${BASE}data/structures/${key}.pdb`).then((r) => { if (!r.ok) throw new Error(`structure ${key}: HTTP ${r.status}`); return r.text(); }));
  return pdbCache.get(key)!;
}

/** Probabilities (0–1) over the 20 amino acids for a model shown in feedback, keyed by letter. */
export function probsOf(site: Site, model: string, aa: string): Record<string, number> | null {
  const p = site.pr[model];
  return p ? Object.fromEntries([...aa].map((a, k) => [a, p[k] / 1000])) : null;
}
