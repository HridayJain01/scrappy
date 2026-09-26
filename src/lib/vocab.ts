// On-device "AI": CLIP scores a photo against every label below, then writeUp() turns the winners into
// a title, caption, tags, sticker and extra — the same shape Gemini returns. Pure data + pure functions.
// Changed a label? Regenerate the embeddings: see scripts/embed-labels.ts.
import type { Category } from './db.ts'
import type { AiResult } from './gemini.ts'

/** OpenAI CLIP ViT-B/32 image encoder (MIT licence), 4-bit weights, pinned to one revision. */
export const MODEL = {
  id: 'Xenova/clip-vit-base-patch32',
  url: 'https://huggingface.co/Xenova/clip-vit-base-patch32/resolve/d15189d7028b43f1d3e65039190477f6af591c2a/onnx/vision_model_bnb4.onnx',
  bytes: 58_310_402,
  cache: 'scrappy-ai-v1', // Cache Storage bucket for the model + runtime
}

export interface Label {
  text: string // what CLIP compares the photo against
  cat: Category
  name?: string // for captions; unset = generic label
  emoji?: string
  group?: string // food: meal | sweet | drink; random: pet | animal | thing | people
  vibes?: string[] // views only
}

// [what, name, emoji, group-or-vibes]
type Row = [string, string, string, (string | string[])?]

const food = (rows: Row[], group = 'meal') =>
  rows.map(([what, name, emoji, g]): Label => ({ text: `a photo of ${what}, a type of ${group === 'drink' ? 'drink' : 'food'}.`, cat: 'food', name, emoji, group: (g as string) ?? group }))

const MEALS: Row[] = [
  ['pizza', 'pizza', '🍕'], ['a burger', 'burger', '🍔'], ['a sandwich', 'sandwich', '🥪'], ['a hot dog', 'hot dog', '🌭'],
  ['tacos', 'tacos', '🌮'], ['a burrito', 'burrito', '🌯'], ['sushi', 'sushi', '🍣'], ['ramen', 'ramen', '🍜'],
  ['noodles', 'noodles', '🍜'], ['pasta', 'pasta', '🍝'], ['fried rice', 'fried rice', '🍚'], ['biryani', 'biryani', '🍛'],
  ['curry', 'curry', '🍛'], ['butter chicken', 'butter chicken', '🍛'], ['dal', 'dal', '🍲'], ['paneer tikka', 'paneer tikka', '🧀'],
  ['a masala dosa', 'dosa', '🫓'], ['idli with chutney', 'idli', '🍚'], ['samosas', 'samosa', '🥟'], ['momos', 'momos', '🥟'],
  ['dumplings', 'dumplings', '🥟'], ['pani puri', 'pani puri', '🥙'], ['chaat', 'chaat', '🥗'], ['pav bhaji', 'pav bhaji', '🍛'],
  ['vada pav', 'vada pav', '🍔'], ['paratha', 'paratha', '🫓'], ['naan bread', 'naan', '🫓'], ['an Indian thali', 'thali', '🍱'],
  ['a bento box', 'bento', '🍱'], ['dim sum', 'dim sum', '🥟'], ['pho', 'pho', '🍜'], ['soup', 'soup', '🍲'],
  ['a salad', 'salad', '🥗'], ['steak', 'steak', '🥩'], ['fried chicken', 'fried chicken', '🍗'], ['chicken wings', 'wings', '🍗'],
  ['kebabs', 'kebabs', '🍢'], ['a shawarma wrap', 'shawarma', '🥙'], ['falafel', 'falafel', '🧆'], ['french fries', 'fries', '🍟'],
  ['nachos', 'nachos', '🌮'], ['popcorn', 'popcorn', '🍿'], ['fried eggs', 'eggs', '🍳'], ['an omelette', 'omelette', '🍳'],
  ['toast', 'toast', '🍞'], ['a croissant', 'croissant', '🥐'], ['a bagel', 'bagel', '🥯'], ['bread', 'bread', '🍞'],
  ['a bowl of cereal', 'cereal', '🥣'], ['a fruit bowl', 'fruit', '🍓'], ['mangoes', 'mango', '🥭'], ['watermelon', 'watermelon', '🍉'],
  ['cheese', 'cheese', '🧀'], ['shrimp', 'shrimp', '🍤'], ['grilled fish', 'fish', '🐟'], ['barbecue', 'barbecue', '🍖'],
]
const SWEETS: Row[] = [
  ['ice cream', 'ice cream', '🍨'], ['cake', 'cake', '🍰'], ['a birthday cake', 'birthday cake', '🎂'], ['cupcakes', 'cupcake', '🧁'],
  ['donuts', 'donut', '🍩'], ['cookies', 'cookies', '🍪'], ['chocolate', 'chocolate', '🍫'], ['brownies', 'brownie', '🍫'],
  ['pancakes', 'pancakes', '🥞'], ['waffles', 'waffles', '🧇'], ['gulab jamun', 'gulab jamun', '🍡'], ['jalebi', 'jalebi', '🥨'],
  ['kulfi', 'kulfi', '🍦'], ['Indian sweets', 'mithai', '🍬'], ['pie', 'pie', '🥧'], ['candy', 'candy', '🍬'],
  ['a fortune cookie', 'fortune cookie', '🥠'], ['gingerbread cookies', 'gingerbread', '🍪'],
]
const DRINKS: Row[] = [
  ['coffee', 'coffee', '☕'], ['a latte with latte art', 'latte', '☕'], ['iced coffee', 'iced coffee', '🧋'], ['tea', 'tea', '🍵'],
  ['masala chai', 'chai', '☕'], ['a matcha latte', 'matcha', '🍵'], ['bubble tea', 'bubble tea', '🧋'], ['a smoothie', 'smoothie', '🥤'],
  ['a milkshake', 'milkshake', '🥤'], ['fresh juice', 'juice', '🧃'], ['lemonade', 'lemonade', '🍋'], ['coconut water', 'coconut water', '🥥'],
  ['a cocktail', 'cocktail', '🍹'], ['beer', 'beer', '🍺'], ['wine', 'wine', '🍷'], ['a soda', 'soda', '🥤'],
]

const views = (rows: Row[]) => rows.map(([what, name, emoji, vibes]): Label => ({ text: `a photo of ${what}.`, cat: 'views', name, emoji, vibes: vibes as string[] }))
const VIEWS: Row[] = [
  ['a beach', 'beach', '🏖️', ['salty breeze calm', 'sandy toes mode']], ['the ocean', 'ocean', '🌊', ['big blue calm', 'wave-watching hours']],
  ['a sunset', 'sunset', '🌇', ['golden hour calm', 'pink sky glow']], ['a sunrise', 'sunrise', '🌅', ['early bird glow', 'soft morning gold']],
  ['mountains', 'mountains', '🏔️', ['big sky energy', 'summit daydreams']], ['green hills', 'hills', '⛰️', ['rolling green calm', 'wide open quiet']],
  ['a forest', 'forest', '🌲', ['green therapy', 'deep woods hush']], ['a lake', 'lake', '🏞️', ['still water calm', 'mirror lake peace']],
  ['a river', 'river', '🏞️', ['riverside drift', 'slow flow mood']], ['a waterfall', 'waterfall', '💦', ['misty magic', 'splashy wonder']],
  ['a desert', 'desert', '🏜️', ['sun-baked stillness', 'dune daydream']], ['a snowy landscape', 'snow', '❄️', ['frosty quiet', 'winter wonderland']],
  ['countryside fields', 'fields', '🌾', ['open field peace', 'slow village mood']], ['a park', 'park', '🌳', ['lazy afternoon green', 'picnic energy']],
  ['a flower garden', 'garden', '🌷', ['blooming soft vibes', 'petal-pretty calm']], ['a city skyline', 'skyline', '🏙️', ['skyline main character', 'city dreamer']],
  ['a busy city street', 'city street', '🏙️', ['city buzz', 'urban wander']], ['city lights at night', 'city lights', '🌃', ['neon night buzz', 'after-dark glow']],
  ['a street with traffic and cyclists', 'traffic', '🚦', ['rush hour buzz', 'city in motion']], ['a street seen from above', 'streets', '🏙️', ['bird’s-eye buzz', 'city in motion']],
  ['a rainy street', 'rain', '🌧️', ['moody drizzle', 'monsoon mood']], ['dramatic clouds in the sky', 'clouds', '☁️', ['soft sky mood', 'cloud-watching calm']],
  ['a clear blue sky', 'blue sky', '🌤️', ['blue sky optimism', 'bright and breezy']], ['a starry night sky', 'stars', '🌌', ['stargazing hush', 'cosmic calm']],
  ['the moon at night', 'moon', '🌙', ['moonlit calm', 'midnight glow']], ['a bridge', 'bridge', '🌉', ['crossing into calm', 'river crossing mood']],
  ['a Hindu temple', 'temple', '🛕', ['peaceful and grand', 'bells and calm']], ['a church', 'church', '⛪', ['quiet grandeur', 'stained glass calm']],
  ['a mosque', 'mosque', '🕌', ['serene domes', 'peaceful arches']], ['an old fort or castle', 'fort', '🏰', ['history buff mode', 'royal throwback']],
  ['historic architecture', 'old architecture', '🏛️', ['time-travel feels', 'old-world charm']], ['a modern building', 'building', '🏢', ['glass and ambition', 'clean-lines calm']],
  ['a house', 'house', '🏠', ['cozy corner vibes', 'home sweet home']], ['an old stone cottage', 'cottage', '🏡', ['storybook calm', 'countryside charm']], ['a road trip highway', 'open road', '🛣️', ['road trip freedom', 'window-down mood']],
  ['an airport', 'airport', '✈️', ['wanderlust loading', 'gate-side excitement']], ['a train station', 'station', '🚉', ['next stop adventure', 'platform daydreams']],
  ['a harbor with boats', 'harbor', '⛵', ['salt and sails', 'dockside calm']], ['an amusement park', 'fairground', '🎡', ['sugar rush fun', 'ferris wheel joy']],
  ['a street market', 'market', '🛍️', ['bargain hunter buzz', 'market chaos charm']], ['the view from an airplane window', 'plane window', '✈️', ['cloud-level daydream', 'window seat bliss']],
]

const fits = (rows: Row[]) => rows.map(([what, name, emoji]): Label => ({ text: what.startsWith('a photo') ? what : `a photo of a person wearing ${what}.`, cat: 'fits', name, emoji }))
const FITS: Row[] = [
  ['a photo of a mirror selfie showing an outfit.', 'mirror selfie', '🤳'], ['a photo of a person showing off their outfit.', 'outfit', '👕'],
  ['a full body stylish outfit', 'outfit', '👕'], ['streetwear', 'streetwear', '🧢'], ['a formal suit', 'suit', '🤵'], ['a dress', 'dress', '👗'],
  ['a saree', 'saree', '🥻'], ['a kurta', 'kurta', '✨'], ['a lehenga', 'lehenga', '💃'], ['a denim jacket', 'denim', '👖'],
  ['jeans and a t-shirt', 'jeans and tee', '👖'], ['a hoodie', 'hoodie', '🧥'], ['gym clothes', 'gym fit', '🏋️'], ['a winter coat', 'winter coat', '🧥'],
  ['a summer outfit', 'summer fit', '☀️'], ['an all-black outfit', 'all black', '🖤'], ['a colorful outfit', 'colour pop', '🌈'], ['a party outfit', 'party fit', '🪩'],
  ['traditional clothes', 'traditional wear', '✨'], ["a photo of someone's sneakers.", 'sneakers', '👟'], ['sunglasses and a hat', 'accessories', '🕶️'],
]

const random = (rows: Row[], group: string) => rows.map(([what, name, emoji]): Label => ({ text: `a photo of ${what}.`, cat: 'random', name, emoji, group }))
const PETS: Row[] = [['a cat', 'cat', '🐱'], ['a dog', 'dog', '🐶'], ['a rabbit', 'bunny', '🐰'], ['a parrot', 'parrot', '🦜'], ['a fish in an aquarium', 'fish', '🐠']]
const ANIMALS: Row[] = [
  ['a bird', 'bird', '🐦'], ['a butterfly', 'butterfly', '🦋'], ['an insect', 'bug', '🐞'], ['a cow', 'cow', '🐄'], ['a monkey', 'monkey', '🐒'],
  ['a horse', 'horse', '🐴'], ['an elephant', 'elephant', '🐘'], ['a tiger', 'tiger', '🐯'], ['a lion', 'lion', '🦁'], ['a zebra', 'zebra', '🦓'],
  ['a squirrel', 'squirrel', '🐿️'], ['a turtle', 'turtle', '🐢'], ['an eagle', 'eagle', '🦅'], ['a penguin', 'penguin', '🐧'],
]
const THINGS: Row[] = [
  ['a flower', 'flower', '🌸'], ['a house plant', 'plant', '🪴'], ['a cactus', 'cactus', '🌵'], ['a car', 'car', '🚗'], ['a motorbike', 'motorbike', '🏍️'],
  ['a bicycle', 'bicycle', '🚲'], ['an auto rickshaw', 'auto rickshaw', '🛺'], ['a bus', 'bus', '🚌'], ['a train', 'train', '🚆'], ['a laptop', 'laptop', '💻'],
  ['a smartphone', 'phone', '📱'], ['a screenshot of a phone screen', 'screenshot', '📱'], ['a video game', 'video game', '🎮'], ['headphones', 'headphones', '🎧'],
  ['a camera', 'camera', '📷'], ['a computer keyboard', 'keyboard', '⌨️'], ['a book', 'book', '📚'], ['a meme with text', 'meme', '😂'], ['a funny sign', 'sign', '🪧'],
  ['graffiti', 'graffiti', '🎨'], ['a painting', 'painting', '🖼️'], ['a statue', 'statue', '🗿'], ['a cartoon character', 'cartoon', '🎨'], ['a toy', 'toy', '🧸'],
  ['a stuffed animal', 'teddy', '🧸'], ['a ball', 'ball', '⚽'], ['a guitar', 'guitar', '🎸'], ['a musical instrument', 'instrument', '🎹'], ['a candle', 'candle', '🕯️'],
  ['a lamp', 'lamp', '💡'], ['a chair', 'chair', '🪑'], ['a bed', 'bed', '🛏️'], ['a clock', 'clock', '⏰'], ['keys', 'keys', '🔑'], ['a handbag', 'bag', '👜'],
  ['a receipt', 'receipt', '🧾'], ['a document with text', 'document', '📄'], ['handwritten notes', 'notes', '📝'], ['balloons', 'balloons', '🎈'],
  ['a wrapped gift', 'gift', '🎁'], ['a traffic cone', 'traffic cone', '🚧'], ['a decorative bowl or vase', 'vase', '🏺'], ['fireworks', 'fireworks', '🎆'],
]
const PEOPLE: Row[] = [
  ['a close-up selfie of a face', 'selfie', '🤳'], ['a group photo of friends', 'squad', '👯'], ['a baby', 'baby', '👶'], ['a crowd of people', 'crowd', '👥'],
  ['people playing a sport', 'game day', '🏅'], ['a concert', 'concert', '🎤'],
]

const generic = (cat: Category, texts: string[]) => texts.map((text): Label => ({ text, cat }))

export const LABELS: Label[] = [
  ...food(MEALS), ...food(SWEETS, 'sweet'), ...food(DRINKS, 'drink'),
  ...generic('food', ['a photo of food.', 'a photo of a meal on a plate.', 'a photo of a drink.']),
  ...views(VIEWS),
  ...generic('views', ['a photo of a landscape.', 'a scenic travel photo.', 'a photo of the sky.']),
  ...fits(FITS),
  ...random(PETS, 'pet'), ...random(ANIMALS, 'animal'), ...random(THINGS, 'thing'), ...random(PEOPLE, 'people'),
  ...generic('random', ['a photo of an object.', 'a close-up photo of a random thing.']),
]

// ---------------- scoring ----------------

export interface Scored {
  category: Category
  confidence: number // share of the probability mass that went to the winning album
  best: Label // most likely label inside the winning album
  runnerUps: Label[] // next labels in that album, for extra tags
}

/** CLIP cosine similarities (one per LABELS entry) → album + best label. */
export function score(sims: ArrayLike<number>): Scored {
  const max = Math.max(...Array.from(sims))
  const p = Array.from(sims, (s) => Math.exp(100 * (s - max))) // CLIP's logit scale is 100
  const total = p.reduce((a, b) => a + b, 0)
  const mass: Record<string, number> = {}
  LABELS.forEach((l, i) => (mass[l.cat] = (mass[l.cat] ?? 0) + p[i] / total))
  const category = (Object.keys(mass) as Category[]).reduce((a, b) => (mass[a] >= mass[b] ? a : b))
  const inCat = LABELS.map((l, i) => [l, p[i]] as const)
    .filter(([l]) => l.cat === category)
    .sort((a, b) => b[1] - a[1])
  const named = inCat.filter(([l]) => l.name)
  // Only name something specific when CLIP clearly prefers it; otherwise stay generic rather than be wrong.
  const sure = named[0] && named[0][1] / total >= 0.25 * mass[category]
  const best = sure ? named[0][0] : (inCat.find(([l]) => !l.name)?.[0] ?? named[0][0])
  const runnerUps = sure ? named.slice(1, 3).filter(([, pr]) => pr >= 0.3 * named[0][1]).map(([l]) => l) : []
  return { category, confidence: mass[category], best, runnerUps }
}

// ---------------- writing ----------------

const hash = (s: string) => {
  let h = 2166136261
  for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619)
  return h >>> 0
}
/** Stable per-photo choice, so re-sorting a photo gives the same words. */
const choose = <T>(items: T[], seed: string) => items[hash(seed) % items.length]
const cap = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase())
const fill = (t: string, name: string) => t.replaceAll('{Name}', cap(name)).replaceAll('{name}', name)

const T = {
  food: {
    titles: ['{Name} O’Clock', '{Name} Appreciation Post', 'Behold: {Name}', '{Name} Supremacy', 'The {Name} Chronicles', 'Snack Report: {Name}'],
    generic: ['Delicious Evidence', 'Plate of the Day', 'Snack Report', 'Food Diary Entry'],
    meal: ['Ate the {name}. Regret nothing.', '{Name} fixed my whole mood, honestly.', 'Self-care, but make it {name}.', 'Photo first, then the {name} vanished.', 'Current mood: {name} and zero plans.'],
    sweet: ['Dessert first. Life is short.', 'Sugar rush loading, no regrets.', 'Sweet tooth: fully satisfied. For now.', 'I deserved the {name}. Science agrees.'],
    drink: ['Sip, sip, hooray.', 'Hydration, but make it {name}.', 'Fuelled by {name} and good intentions.', 'This {name} is carrying my whole day.'],
    unsure: ['This plate had my full attention.', 'Delicious evidence, captured before it disappeared.', 'Food first, photos… wait, photos first.'],
  },
  views: {
    titles: ['{Name} State of Mind', 'Big {Name} Energy', 'Postcard: {Name}', '{Vibe}'],
    generic: ['Somewhere Nice', 'Postcard Moment', 'Worth the Detour', 'Screensaver Material'],
    captions: ['Stood here and forgot to check my phone.', 'The {name} said hi, so I took a picture.', 'Screensaver material, and it’s all mine.', 'Pausing the whole day for this view.', 'Saving this view for a rainy day.'],
    unsure: ['Stood here and forgot to check my phone.', 'Screensaver material, and it’s all mine.', 'Saving this view for a rainy day.'],
  },
  fits: {
    titles: ['Fit Check: {Name}', 'Outfit of the Day', 'Main Character Arc', 'Certified Drip', 'Dressed to Impress', 'Runway, Who?'],
    captions: ['Dressed like the week owes me money.', 'Wore this and walked slower on purpose.', 'Outfit said confident, so I listened.', 'Serving looks, accepting compliments.', 'The mirror and I agree: this works.', 'Not overdressed, just ahead of the plan.'],
    scores: ['main character energy', 'certified drip', 'runway ready', 'effortlessly iconic', 'cozy but make it cool', 'clean and crisp'],
  },
  random: {
    titles: ['Exhibit A: {Name}', 'The {Name} Files', 'Unexpected {Name}', 'Field Notes: {Name}'],
    generic: ['Tiny Mysteries', 'Filed Under Weird', 'Exhibit A', 'Unsolved Case'],
    captions: ['No idea why I took this, but here we are.', '{Name} spotted. Documenting for science.', 'This demanded a photo. I obeyed.', 'Filed under: things only I find fascinating.', 'Somebody had to capture the {name}.'],
    pet: ['Cutest thing in the room, and it knows it.', 'Would pet. Did pet? No comment.', 'The {name} is the boss here. I just live here.'],
    people: ['Good people, good times, blurry memories.', 'Proof that this actually happened.', 'Core memory unlocked, with witnesses.'],
    unsure: ['No idea why I took this, but here we are.', 'This demanded a photo. I obeyed.', 'Filed under: things only I find fascinating.'],
    weird: ['totally normal, suspiciously', 'mildly curious', 'a little odd', 'why is this here', 'peak chaos'],
  },
}

const DEFAULT_STICKER: Record<Category, string> = { fits: '👕', food: '🍽️', views: '🌅', random: '🌀' }

const timeTag = (hour: number, drink: boolean) =>
  drink
    ? hour < 5 ? 'late night sip' : hour < 12 ? 'morning fuel' : 'sip break'
    : hour < 5 || hour >= 23 ? 'midnight snack' : hour < 11 ? 'breakfast' : hour < 16 ? 'lunch' : hour < 18 ? 'snack time' : 'dinner'

/** Turns CLIP's verdict into scrapbook words. `seed` is the photo id, so the result is stable per photo. */
export function writeUp({ category, best, runnerUps }: Scored, seed: string, takenAt: number): AiResult {
  const name = best.name
  const pick = <V>(items: V[], salt: string) => choose(items, seed + salt)
  const words = (l?: Label) => l?.name?.toLowerCase() ?? ''
  const tags = (extra: string[]) => [...new Set([words(best), ...runnerUps.map(words), ...extra].filter(Boolean))].slice(0, 5)
  const sticker = best.emoji ?? DEFAULT_STICKER[category]
  const hour = new Date(takenAt).getHours()

  if (category === 'food') {
    const t = T.food
    const lines = name ? t[(best.group as 'meal' | 'sweet' | 'drink') ?? 'meal'] : t.unsure
    return {
      category, sticker,
      title: name ? fill(pick(t.titles, 't'), name) : pick(t.generic, 't'),
      caption: fill(pick(lines, 'c'), name ?? ''),
      tags: tags([best.group === 'drink' ? 'drinks' : best.group === 'sweet' ? 'dessert' : 'food', timeTag(hour, best.group === 'drink')]),
      extra: { label: 'Dish', value: name ? cap(name) : 'Mystery deliciousness' },
    }
  }
  if (category === 'views') {
    const t = T.views
    const vibe = best.vibes ? pick(best.vibes, 'v') : pick(['quiet wonder', 'wide open calm', 'soft travel glow'], 'v')
    return {
      category, sticker,
      title: name ? fill(pick(t.titles, 't'), name).replace('{Vibe}', cap(vibe)) : pick(t.generic, 't'),
      caption: name ? fill(pick(t.captions, 'c'), name) : pick(t.unsure, 'c'),
      tags: tags(['view', hour < 5 || hour >= 21 ? 'night' : hour >= 17 ? 'evening' : 'daytime']),
      extra: { label: 'Vibe', value: vibe },
    }
  }
  if (category === 'fits') {
    const t = T.fits
    return {
      category, sticker,
      title: fill(pick(name ? t.titles : t.titles.slice(1), 't'), name ?? ''),
      caption: pick(t.captions, 'c'),
      tags: tags(['outfit', 'ootd']),
      extra: { label: 'Fit score', value: `${7 + (hash(seed + 's') % 4)}/10 · ${pick(t.scores, 'p')}` },
    }
  }
  const t = T.random
  const level = hash(seed + 'w') % 5
  const lines = !name ? t.unsure : best.group === 'pet' ? t.pet : best.group === 'people' ? t.people : t.captions
  return {
    category, sticker,
    title: name ? fill(pick(t.titles, 't'), name) : pick(t.generic, 't'),
    caption: fill(pick(lines, 'c'), name ?? ''),
    tags: tags([best.group === 'pet' || best.group === 'animal' ? 'animals' : 'random']),
    extra: { label: 'Weirdness', value: `${level + 1}/5 · ${t.weird[level]}` },
  }
}
