export type Mode = 'seq' | 'struct';
export type Group = 'learn' | 'new';
export type FeedbackMode = 'none' | 'reveal';

export interface PhaseSpec {
  name: string;
  label: string;
  trials: number;
  group: Group;
  /** reveal = the right answer + the model's probabilities for all 20 amino acids. */
  feedback: FeedbackMode;
  intro: string;
}

export interface Config {
  mode: Mode;
  phases: PhaseSpec[];
  maxDurationMin: number;
  hudWindow: number;
  excludeSeen: boolean;
}

export const MODE_INFO: Record<Mode, { title: string; short: string; like: string; rival: string; description: string }> = {
  seq: {
    title: 'Sequence game', short: 'Sequence', like: 'like ESM2 (masked language model)', rival: 'esm650_w',
    description: 'You see 10 amino acids from inside a real protein with the middle one hidden. Guess the hidden amino acid. This is exactly the task a masked protein language model like ESM2 is trained on — billions of times.',
  },
  struct: {
    title: 'Structure game', short: 'Structure', like: 'like ProteinMPNN (inverse folding)', rival: 'mpnn',
    description: 'You see the structure around a hidden residue — its own side chain removed, the side chains of its 3D neighbours shown — plus its backbone shape and the local sequence. Guess the hidden amino acid. This is how ProteinMPNN is trained to design sequences for a structure.',
  },
};

export const PRESETS: Record<Mode, PhaseSpec[]> = {
  seq: [
    { name: 'learn', label: 'Learning (28 proteins)', trials: 100, group: 'learn', feedback: 'reveal',
      intro: 'Part 1 of 2 — learning.\nTen amino acids from inside a real protein; the middle one is hidden. Pick the amino acid you think belongs there.\nAfter each guess you\'ll see the real answer and what ESM2 would have guessed, with its probabilities for all 20.' },
    { name: 'new', label: 'New proteins', trials: 40, group: 'new', feedback: 'reveal',
      intro: 'Part 2 of 2 — eight proteins you haven\'t seen.\nSame task. Use what you learned.' },
  ],
  struct: [
    { name: 'learn', label: 'Learning (28 proteins)', trials: 80, group: 'learn', feedback: 'reveal',
      intro: 'Part 1 of 2 — learning.\nA residue in a real protein structure has had its side chain hidden. You see its backbone, its 3D neighbours and the local sequence.\nPick the amino acid you think belongs there. After each guess you\'ll see the real answer and ProteinMPNN\'s probabilities.' },
    { name: 'new', label: 'New proteins', trials: 30, group: 'new', feedback: 'reveal',
      intro: 'Part 2 of 2 — eight proteins you haven\'t seen.\nSame task. Use what you learned.' },
  ],
};

export const defaultConfig = (mode: Mode): Config => ({ mode, phases: PRESETS[mode], maxDurationMin: 60, hudWindow: 20, excludeSeen: true });

export interface Protein { key: string; group: Group; name: string; organism: string; uid: string; seq: string }

export type SS = 'helix' | 'strand' | 'loop' | 'left';

export interface Site {
  id: number;
  protein: Protein;
  /** 0-based index in protein.seq */
  i: number;
  aa: string;
  /** 11 characters: 5 context, the hidden residue, 5 context */
  w: string;
  ss: SS;
  phi: number | null;
  psi: number | null;
  /** residues with Cβ within 10 Å */
  nbr: number;
  plddt: number;
  /** 16 nearest residues by (virtual) Cβ distance: [index, Å] */
  nbrs: [number, number][];
  /** probabilities (‰, order = Dataset.aa) for the models shown in feedback */
  pr: Record<string, number[]>;
  /** each benchmark's top-1 call (a one-letter code), keyed by model name */
  calls: Record<string, string>;
  /** structure-game cues as numbers (for the same-experience learners) */
  f: number[];
}

export type ModelKind = 'simple' | 'window' | 'full' | 'structure' | 'sweep';
export interface ModelInfo { name: string; label: string; kind: ModelKind; games: Mode[] }

export interface Dataset { version: string; source: string; aa: string; models: ModelInfo[]; proteins: Protein[]; sites: Site[] }

export interface TrialRecord {
  trial: number;
  timestamp: string;
  elapsed_ms: number;
  mode: Mode;
  phase: string;
  feedback: FeedbackMode;
  site_id: number;
  protein: string;
  group: Group;
  /** 1-based residue number */
  position: number;
  truth: string;
  response: string;
  correct: boolean;
  same_family: boolean;
  input: string;
  rt_ms: number;
  rolling_accuracy: number | null;
  onset_perf_ms: number;
  response_perf_ms: number;
}

export interface PriorExperience { sessions: number; trials: number; session_ids: string[]; excluded_sites: number }

export interface SessionMeta {
  app: string;
  app_version: string;
  session_id: string;
  seed: number;
  simulated: boolean;
  config: Config;
  dataset_version: string;
  phase_starts?: Record<string, number>;
  prior?: PriorExperience;
  start_time: string;
  end_time: string | null;
  end_reason: string | null;
  total_trials: number;
  active_duration_ms: number;
  paused_ms: number;
  environment: { user_agent: string; screen: string };
  timing_notes: string;
}

export interface Session { meta: SessionMeta; trials: TrialRecord[] }

export type Family = 'hydrophobic' | 'aromatic' | 'polar' | 'positive' | 'negative' | 'special';
/** Picker layout and the "right family" score. */
export const FAMILIES: { key: Family; label: string; aas: string; note: string }[] = [
  { key: 'hydrophobic', label: 'Hydrophobic', aas: 'AVLIM', note: 'greasy, often buried' },
  { key: 'aromatic', label: 'Aromatic', aas: 'FWY', note: 'flat rings' },
  { key: 'polar', label: 'Polar', aas: 'STNQ', note: 'H-bonding, no charge' },
  { key: 'positive', label: 'Positive', aas: 'KRH', note: 'basic' },
  { key: 'negative', label: 'Negative', aas: 'DE', note: 'acidic' },
  { key: 'special', label: 'Special', aas: 'GPC', note: 'backbone & disulfides' },
];
export const FAMILY_OF: Record<string, Family> = Object.fromEntries(FAMILIES.flatMap((f) => [...f.aas].map((a) => [a, f.key])));
/** Amino acids in picker order (grouped by family). */
export const AA_ORDER = FAMILIES.map((f) => f.aas).join('');

export const AA_INFO: Record<string, { name: string; three: string }> = {
  A: { name: 'Alanine', three: 'Ala' }, R: { name: 'Arginine', three: 'Arg' }, N: { name: 'Asparagine', three: 'Asn' }, D: { name: 'Aspartate', three: 'Asp' },
  C: { name: 'Cysteine', three: 'Cys' }, Q: { name: 'Glutamine', three: 'Gln' }, E: { name: 'Glutamate', three: 'Glu' }, G: { name: 'Glycine', three: 'Gly' },
  H: { name: 'Histidine', three: 'His' }, I: { name: 'Isoleucine', three: 'Ile' }, L: { name: 'Leucine', three: 'Leu' }, K: { name: 'Lysine', three: 'Lys' },
  M: { name: 'Methionine', three: 'Met' }, F: { name: 'Phenylalanine', three: 'Phe' }, P: { name: 'Proline', three: 'Pro' }, S: { name: 'Serine', three: 'Ser' },
  T: { name: 'Threonine', three: 'Thr' }, W: { name: 'Tryptophan', three: 'Trp' }, Y: { name: 'Tyrosine', three: 'Tyr' }, V: { name: 'Valine', three: 'Val' },
};

export const FAMILY_COLOR: Record<Family, string> = {
  hydrophobic: '#c98500', aromatic: '#e87ba4', polar: '#199e70', positive: '#3987e5', negative: '#ef5350', special: '#9a9a90',
};
export const aaColor = (a: string) => FAMILY_COLOR[FAMILY_OF[a]] ?? '#666';

export const SS_TEXT: Record<SS, string> = { helix: 'α-helix', strand: 'β-strand', loop: 'loop', left: 'left-handed (φ > 0)' };
