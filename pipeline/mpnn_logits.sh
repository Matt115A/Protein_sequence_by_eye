#!/bin/bash
# Step 3: ProteinMPNN (v_48_020) conditional probabilities for every residue of every game structure (chain A).
#   seq+bb : p(aa_i | backbone, all other residues)      — how it is trained (teacher forcing) and used for scoring
#   bb     : p(aa_i | backbone only)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MPNN="$ROOT/tools/ProteinMPNN/protein_mpnn_run.py"
for f in "$ROOT"/data/work/pdb_orig/*.pdb; do
  k=$(basename "$f" .pdb)
  [ -f "$ROOT/data/work/mpnn_seqbb/conditional_probs_only/$k.npz" ] || python3 "$MPNN" --pdb_path "$f" --pdb_path_chains A --out_folder "$ROOT/data/work/mpnn_seqbb" --conditional_probs_only 1 --seed 1 --batch_size 1 --num_seq_per_target 1 >/dev/null 2>&1
  [ -f "$ROOT/data/work/mpnn_bb/conditional_probs_only/$k.npz" ] || python3 "$MPNN" --pdb_path "$f" --pdb_path_chains A --out_folder "$ROOT/data/work/mpnn_bb" --conditional_probs_only 1 --conditional_probs_only_backbone 1 --seed 1 --batch_size 1 --num_seq_per_target 1 >/dev/null 2>&1
  echo "$k done"
done
