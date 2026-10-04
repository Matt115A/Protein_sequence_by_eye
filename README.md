# Fill the mask

**Try it: https://matt115a.github.io/Protein_sequence_by_eye/**

**Can a person learn to predict a hidden amino acid the way protein AI models are trained — and how do they compare?**

Two games on the same 2,520 sites in 36 real proteins (AlphaFold2 structures from ProteinGym):

- **Sequence game — like ESM2.** You see 10 amino acids from inside a protein with the middle one masked, and pick the
  hidden amino acid. This is masked language modelling, the task ESM2 is trained on. Feedback: the real answer plus ESM2-650M's
  probabilities for all 20 amino acids, both with exactly your 10-residue window and with the whole protein.
- **Structure game — like ProteinMPNN.** You see the backbone around the hidden residue (no side chains anywhere, like ProteinMPNN),
  the amino acids of its 16 nearest 3D neighbours, its φ/ψ angles and burial, and the local sequence. Feedback: ProteinMPNN's
  probabilities given backbone + neighbours (how it scores a residue) and given the backbone alone.

Pick from the 20 amino acids drawn as structures and grouped by family (hydrophobic, aromatic, polar, positive, negative, special),
by clicking/tapping or typing the one-letter code. Learn on 28 proteins, then test on 8 new ones. A live leaderboard lets you race a model
as you go. The analysis compares you with every model on identical sites, with learners that see only your trials, the
"how much context does ESM2 need?" curve, model size, your confusion matrix and which model you think like.

**A finding worth knowing:** with only the 10-residue window, ESM2-650M is no better than always guessing leucine (~10%).
Given 50 residues it gets 34%; given the whole protein, 56%. Its skill comes from long-range context.

```bash
npm install && npm run dev        # ?debug adds a simulate button
npm test
npm run deploy                    # build the public version and push it to gh-pages
```

Rebuild the data with the scripts in `pipeline/` (see [DATA.md](DATA.md)).
