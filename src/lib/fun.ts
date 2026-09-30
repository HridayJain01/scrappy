// Daily challenges and badges. Pure data + pure functions (tested in logic.test.ts).
import type { Category, Photo } from './db.ts'

export interface Challenge {
  text: string
  emoji: string
  hit: (p: Pick<Photo, 'aiCategory' | 'tags'>) => boolean
}

// The on-device AI "checks" a challenge through the tags and album it gave the photo.
const cat = (c: Category) => (p: Pick<Photo, 'aiCategory'>) => p.aiCategory === c
const tagged =
  (...names: string[]) =>
  (p: Pick<Photo, 'tags'>) =>
    !!p.tags?.some((t) => names.includes(t))

export const CHALLENGES: Challenge[] = [
  { text: 'Snap your outfit of the day', emoji: '👕', hit: cat('fits') },
  { text: 'Photograph something you ate', emoji: '🍽️', hit: cat('food') },
  { text: 'Catch a view worth keeping', emoji: '🌅', hit: cat('views') },
  { text: 'Find something weird', emoji: '🌀', hit: cat('random') },
  { text: 'Say hi to an animal', emoji: '🐾', hit: tagged('animals', 'cat', 'dog', 'bird', 'cow', 'bunny', 'squirrel', 'butterfly', 'bug') },
  { text: 'Grab a coffee or tea', emoji: '☕', hit: tagged('coffee', 'latte', 'iced coffee', 'tea', 'chai', 'matcha') },
  { text: 'Find a flower or a plant', emoji: '🌸', hit: tagged('flower', 'plant', 'cactus', 'garden') },
  { text: 'Look up at the sky', emoji: '☁️', hit: tagged('clouds', 'blue sky', 'stars', 'moon', 'sunset', 'sunrise') },
  { text: 'Treat yourself to something sweet', emoji: '🍰', hit: tagged('dessert') },
  { text: 'Snap your people', emoji: '👯', hit: tagged('squad', 'crowd', 'concert', 'selfie', 'baby') },
  { text: 'Spot something with wheels', emoji: '🚗', hit: tagged('car', 'motorbike', 'bicycle', 'bus', 'train', 'auto rickshaw', 'traffic') },
  { text: 'Find some art in the wild', emoji: '🎨', hit: tagged('graffiti', 'painting', 'statue', 'cartoon') },
  { text: 'Find some water', emoji: '🌊', hit: tagged('beach', 'ocean', 'lake', 'river', 'waterfall', 'harbor', 'rain') },
]

/** Same challenge all day, a different one (usually) tomorrow. */
export function challengeFor(day: string) {
  let h = 5381
  for (const ch of day) h = (h * 33 + ch.charCodeAt(0)) | 0
  return CHALLENGES[Math.abs(h) % CHALLENGES.length]
}

export interface Stats {
  longest: number // best streak ever
  photos: number
  challenges: number
  favs: number
}

export const BADGES: { emoji: string; name: string; stat: keyof Stats; need: number }[] = [
  { emoji: '📸', name: 'First snap', stat: 'photos', need: 1 },
  { emoji: '🔥', name: '3-day streak', stat: 'longest', need: 3 },
  { emoji: '⚡', name: '7-day streak', stat: 'longest', need: 7 },
  { emoji: '🌟', name: '30-day streak', stat: 'longest', need: 30 },
  { emoji: '👑', name: '100-day streak', stat: 'longest', need: 100 },
  { emoji: '🎞️', name: '50 photos', stat: 'photos', need: 50 },
  { emoji: '📚', name: '250 photos', stat: 'photos', need: 250 },
  { emoji: '🎯', name: 'First challenge', stat: 'challenges', need: 1 },
  { emoji: '🏹', name: '10 challenges', stat: 'challenges', need: 10 },
  { emoji: '⭐', name: 'First favourite', stat: 'favs', need: 1 },
]

/** The streak badge you just earned, if today's streak is exactly one of the milestones. */
export const streakBadge = (streak: number) => BADGES.find((b) => b.stat === 'longest' && b.need === streak)

/** Snaps a sticker onto whichever edge of the frame is nearest, so it never lands on the photo itself. */
export function snapToEdge(x: number, y: number, ratio: number): [number, number] {
  // Compare distances in real proportions: the polaroid is `ratio` (w/h) wide.
  const d = [x * ratio, (100 - x) * ratio, y, 100 - y]
  const edge = d.indexOf(Math.min(...d))
  const clamp = (v: number) => Math.max(4, Math.min(96, v))
  return edge === 0 ? [0, clamp(y)] : edge === 1 ? [100, clamp(y)] : edge === 2 ? [clamp(x), 0] : [clamp(x), 100]
}
