import { FAMILIES, FAMILY_CREDIT } from './types';

const CREDITS = FAMILIES.map((f) => `${f.label.toLowerCase()} ${FAMILY_CREDIT[f.key]}`).join(', ');

/** Plain-language explanations for every piece of information on the trial screen (shown on hover or tap, and in the tour). */
export const HELP = {
  origin: { title: 'Where this comes from', text: 'A real protein, picked at random. Which protein it is stays hidden until you answer, so you work from the clues alone, just like the AI.' },
  window: { title: 'The sequence window', text: 'A short stretch of the protein chain: 5 amino acids either side of the hidden one (the ?). The small numbers count positions away from it. The neighbours along the chain often hint at what fits in the middle.' },
  windowStruct: { title: 'The sequence window', text: 'The 5 amino acids either side of the hidden one along the chain. In this game they are one clue among several: the 3D surroundings matter more.' },
  picker: { title: 'Pick an amino acid', text: 'All 20 amino acids, grouped into families with similar chemistry. Each key shows the side chain, the part that makes each amino acid different. Click one or type its one-letter code. After you answer, each key shows how likely the AI thought it was.' },
  family: { title: 'Families', text: 'Amino acids in the same family have similar chemistry, so they can often swap for one another. Picking the right family but the wrong member counts as a near miss.' },
  familyStruct: { title: 'Families and points', text: `Amino acids in the same family have similar chemistry. The exact amino acid scores 1 point; another member of the right family scores partial credit: ${CREDITS}. Rarer families are worth more, so always picking the commonest kind does not pay.` },
  structure: { title: 'Structure', text: "The protein's 3D shape (an AlphaFold prediction) around the hidden spot. The hidden amino acid is shown as its backbone only, in yellow; its 16 nearest neighbours show their side chains, labelled with their letter. Drag to rotate, scroll to zoom, and press Reset view if you get lost. Hide side chains to see exactly what ProteinMPNN sees. After you answer, the real side chain appears in yellow." },
  backbone: { title: 'Backbone', text: 'The shape of the chain right at the hidden spot. Some shapes favour some amino acids: helices like alanine and leucine, strands like valine and isoleucine, and unusual twists often need glycine.' },
  rama: { title: 'Ramachandran plot', text: 'The two twist angles of the backbone at this spot (φ across, ψ up), shown as the yellow dot. Shaded areas are the common shapes: α (helix), β (strand) and αL, a left-handed twist that glycine makes most easily.' },
  shape: { title: 'Shape', text: 'The local structure the chain forms here: a helix (a spiral), a strand (stretched out, pairing with other strands), or a loop.' },
  angles: { title: 'φ and ψ', text: 'The two backbone twist angles, in degrees. Together they place the dot on the plot.' },
  burial: { title: 'Neighbours within 10 Å', text: 'How many amino acids sit within 10 Å. Many neighbours means buried in the core, where oily (hydrophobic) amino acids are common; few means near the surface, where water-loving ones are common.' },
  neighbours: { title: '3D neighbours', text: 'The 16 amino acids closest in space to the hidden spot, nearest first. The bar shows how close each one is; the number on the right is how far along the chain it is. Close in space but far along the chain shows the protein folding back on itself.' },
  board: { title: 'Live leaderboard', text: 'Your score so far next to AI models scored on exactly the same sites, by their top pick and under the same rules as you. Choose which model to race.' },
} as const;
export type HelpKey = keyof typeof HELP;
