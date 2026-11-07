// Scout: the CRT head with headphones. Maintained by hand: a letter is a palette key, a dot is transparent.
/* eslint-disable */
import type { Patch } from './types';

/** Palette key -> colour. Keys map to material tones (see TONES). R* tones appear only in alert patches. */
export const PALETTE: Record<string, string> = {"A": "#25302b", "B": "#34423b", "C": "#14241f", "D": "#18302a", "E": "#234a3d", "F": "#2c5a48", "G": "#6fbf8f", "H": "#b4e8c0", "I": "#eaffe9", "J": "#1d2622", "K": "#b4aa8f", "L": "#c8bea2", "M": "#d6cdb4", "N": "#eae3cf", "O": "#f6f1e2", "P": "#a8501c", "Q": "#e2711d", "R": "#f08f43", "S": "#f6b27a", "T": "#8a3d1d", "U": "#b9562a", "V": "#d67a45", "W": "#d8342a", "X": "#ff7a66", "Y": "#ffb8b0", "Z": "#16201c", "a": "#8d846b", "b": "#5c2c10", "c": "#5c2a14", "d": "#6c1812", "e": "#ffd166", "f": "#ffe9a8", "g": "#fff7d6"};

/** Palette key -> material tone name (K outline, l* line, L shell, P headphones, C cushion, D glass, G glow, O status, R alert). */
export const TONES: Record<string, string> = {"A": "C0", "B": "C1", "C": "D0", "D": "D1", "E": "D2", "F": "D3", "G": "G0", "H": "G1", "I": "G2", "J": "K", "K": "L0", "L": "L1", "M": "L2", "N": "L3", "O": "L4", "P": "O0", "Q": "O1", "R": "O2", "S": "O3", "T": "P0", "U": "P1", "V": "P2", "W": "R1", "X": "R2", "Y": "R3", "Z": "lC", "a": "lL", "b": "lO", "c": "lP", "d": "lR", "e": "O1", "f": "O2", "g": "O3"};

/** 32×32 head, idle: steady eyes, flat mouth, status light on. */
export const HEAD: string[] = [
  '................................',
  '................................',
  '..............cbbc..............',
  '.............cVSRUJ.............',
  '............cUURQUUJ............',
  '.........cccVVUTTTVVJcc.........',
  '.......ccVVVTTTTTTTTVVVJc.......',
  '......cVVTTTJJJJJJJJTTTVVJ......',
  '.....cVUTJJJaaaaaaaaJJJTUVJ.....',
  '....cVTTNNNNNNNNNNNNNNNMTTVJ....',
  '...cVUJNMOOMMMMMMMMMMMMMMJUVJ...',
  '..cVUTNMMOKKKKKKKKKKKKMMMMTUVJ..',
  '.cVUTJNMMKCCCCCCCCCCCCKMMLJTUVJ.',
  '.cVUJaNMKCFFCCCCCCCCCCCNMLJJUVJ.',
  '.cVUJZNMKDFDDDDDDDDDDDDNMLJcVUJ.',
  'cVUUUBNMKCCCCCCCCCCCCCCNMLBVUUUJ',
  'cVUUTANMKDDGGGDDDDGGGDDNMLAVUUTJ',
  'cVVUTANMKCEHHHECCEHHHECNMLAVUTTJ',
  'cVVUTANMKDDDDDDDDDDDDDDNMLAVUTTJ',
  'cVVUTANMKCCCCCCCCCCCCCCNMLAVUTTJ',
  'cVVUTANMKDDDDDDGGDDDDDDNMLAVUTTJ',
  'cVVUTANMKCCCCCCCCCCCCCCNMLAVUTTJ',
  'cVVUTANMKDDDDDDDDDDDDDDNMLAVUTTJ',
  'cVUUTANMMKCCCCCCCCCCCCKMMLAVUUTJ',
  'cUTTTANMMMNNNNNNNNNNNNMMMLAUTTTJ',
  '.JUTJJMLMMUTMMMMMKMKMKMMLLJJUTJ.',
  '..JJ..JMLLLLLLLLLNLNLNLLLJ..JJ..',
  '.......JMLLLLLLLLLLLLLLLJ.......',
  '........JJJJJJJJJJJJJJJJ........',
  '................................',
  '................................',
  '................................',
];

/** Scout at night: the same head and size, so the same patches apply, with the band's light burning bright like a headlamp. */
export const NIGHT: string[] = [
  '................................',
  '................................',
  '..............cbbc..............',
  '.............cVgfUJ.............',
  '............cUUfeUUJ............',
  '.........cccVVUTTTVVJcc.........',
  '.......ccVVVTTTTTTTTVVVJc.......',
  '......cVVTTTJJJJJJJJTTTVVJ......',
  '.....cVUTJJJaaaaaaaaJJJTUVJ.....',
  '....cVTTNNNNNNNNNNNNNNNMTTVJ....',
  '...cVUJNMOOMMMMMMMMMMMMMMJUVJ...',
  '..cVUTNMMOKKKKKKKKKKKKMMMMTUVJ..',
  '.cVUTJNMMKCCCCCCCCCCCCKMMLJTUVJ.',
  '.cVUJaNMKCFFCCCCCCCCCCCNMLJJUVJ.',
  '.cVUJZNMKDFDDDDDDDDDDDDNMLJcVUJ.',
  'cVUUUBNMKCCCCCCCCCCCCCCNMLBVUUUJ',
  'cVUUTANMKDDGGGDDDDGGGDDNMLAVUUTJ',
  'cVVUTANMKCEHHHECCEHHHECNMLAVUTTJ',
  'cVVUTANMKDDDDDDDDDDDDDDNMLAVUTTJ',
  'cVVUTANMKCCCCCCCCCCCCCCNMLAVUTTJ',
  'cVVUTANMKDDDDDDGGDDDDDDNMLAVUTTJ',
  'cVVUTANMKCCCCCCCCCCCCCCNMLAVUTTJ',
  'cVVUTANMKDDDDDDDDDDDDDDNMLAVUTTJ',
  'cVUUTANMMKCCCCCCCCCCCCKMMLAVUUTJ',
  'cUTTTANMMMNNNNNNNNNNNNMMMLAUTTTJ',
  '.JUTJJMLMMUTMMMMMKMKMKMMLLJJUTJ.',
  '..JJ..JMLLLLLLLLLNLNLNLLLJ..JJ..',
  '.......JMLLLLLLLLLLLLLLLJ.......',
  '........JJJJJJJJJJJJJJJJ........',
  '................................',
  '................................',
  '................................',
];

export const HEAD_PATCHES = {
  eyes: {
    closed: [[16,11,"DDD"],[16,18,"DDD"],[17,10,"CGGGC"],[17,17,"CGGGC"]],
    aside: [[16,11,"D"],[16,14,"G"],[16,18,"D"],[16,21,"G"],[17,10,"CE"],[17,14,"HE"],[17,17,"CE"],[17,21,"HE"]],
    wide: [[15,11,"GGG"],[15,18,"GGG"],[16,10,"EHHHE"],[16,17,"EHHHE"],[17,12,"I"],[17,19,"I"]],
  },
  mouths: {
    open: [[20,13,"EHHHHE"],[21,15,"GG"]],
    mid: [[20,14,"EHHE"]],
    aside: [[20,15,"D"],[20,17,"G"]],
  },
  lights: {
    dim: [[3,15,"QP"],[4,15,"PP"]],
    alert: [[2,15,"dd"],[3,15,"YX"],[4,15,"XW"]],
  },
} satisfies Record<string, Record<string, Patch>>;

/** Hand-simplified 16×16 head for xs and favicons. Never animates. */
export const MINI: string[] = [
  '................',
  '.......JJ.......',
  '....JJJQQJJJ....',
  '...JUUUUUUUUJ...',
  '..JUJJJJJJJJUJ..',
  '.JUJMMMMMMMMJUJ.',
  'JUUMMMMMMMMMMUUJ',
  'JUUMDDDDDDDDMUUJ',
  'JUUMDHHDDHHDMUUJ',
  'JUUMDDDDDDDDMUUJ',
  'JUUMDDDGGDDDMUUJ',
  'JUUMDDDDDDDDMUUJ',
  '.JJMMMMMMMMMMJJ.',
  '...JMMMMMMMMJ...',
  '....JJJJJJJJ....',
  '................',
];

export const MINI_ALERT: Patch = [[2,7,"WW"]];
