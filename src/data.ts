export const examples = [
  { word: 'WEARY', states: ['absent','present','absent','correct','correct'] },
  { word: 'PILLS', states: ['absent','present','present','absent','correct'] },
  { word: 'VIGOR', states: ['correct','correct','correct','correct','correct'] },
] as const;

export const defaultStats = { played: 0, won: 0, streak: 0, maxStreak: 0, totalPoints: 0, distribution: [0,0,0,0,0,0] };
