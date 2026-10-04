# Data and models

- **Structures and sequences:** AlphaFold2 models distributed with ProteinGym v1.3 (Notin et al. 2023; originally AlphaFold DB, CC BY 4.0).
  36 proteins (length 80–600, mean pLDDT ≥ 85, near-duplicates removed by 3-mer similarity); 70 sites per protein with pLDDT ≥ 80, at least 5 residues from either end.
  28 proteins are used for learning and 8 held out as "new proteins".
- **What the browser gets:** `public/data/structures/*.pdb` contain only N, Cα, C, O and a *virtual* Cβ (ProteinMPNN's ideal-geometry formula) for every residue,
  with every residue named ALA, so the 3D view cannot leak the hidden amino acid (no side chains, and glycines don't stand out by missing a Cβ).
- **ESM2** (Lin et al. 2023; MIT), 8M / 35M / 150M / 650M: masked-token probabilities at each site, (a) on exactly the 11-residue window the player sees and
  (b) on the whole protein with only that site masked. ESM2-650M is also run with 20, 30, 50, 100 and 200 residues of context for the context curve.
- **ProteinMPNN** (Dauparas et al. 2022; MIT), `v_48_020`, no backbone noise, run on the original AlphaFold models:
  p(aa | backbone + all other residues) — the site decoded last, as when scoring a residue — and p(aa | backbone only) — the site decoded first.
- **Simple baselines:** always the commonest amino acid in the learning set (L); a logistic regression on the 10-residue window and a gradient-boosting model on
  the structure-game cues, both trained on ~27k sites from the 149 ProteinGym structures *not* used in the game.

Pipeline (run from the project root, with ProteinGym's `AF2.zip` and `DMS_substitutions.csv` in `data/raw/` or `$PROTEINGYM_RAW` and ProteinMPNN cloned into `tools/`):
`select_sites.py` → `esm_logits.py` → `window_sweep.py` → `mpnn_sites.py` → `corpus_models.py` → `aa_icons.py` → `build_dataset.py`.
