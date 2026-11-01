/**
 * Background presets for Content Studio generation.
 *
 * One-tap settings that perform on TikTok / Reels instead of leaving the
 * setting to chance: the shot planner (clips), the reel scene and the
 * explainer script all take the chosen preset's scene text verbatim, so
 * the place on screen is the place the user picked. Scene text describes
 * only what the camera sees — no signage or readable words (the video
 * models garble on-screen text, and prompts elsewhere ban it too).
 *
 * The studio UI fetches id+label from GET /api/content-studio/backgrounds;
 * the scene text itself never leaves the server.
 */

export interface BackgroundPreset {
  id: string;
  label: string;
  scene: string;
}

export const BACKGROUND_PRESETS: BackgroundPreset[] = [
  { id: 'podcast-studio', label: 'Podcast Studio', scene: 'a podcast studio with a broadcast microphone on a boom arm in front of the presenter, warm amber lighting, acoustic panels and a softly lit city window behind' },
  { id: 'barbershop', label: 'Barbershop', scene: 'a neighborhood barbershop with barber chairs, big mirrors and bright shop lights' },
  { id: 'rooftop-skyline', label: 'Rooftop Skyline', scene: 'a city rooftop at golden hour with brick buildings, fire escapes and the skyline behind' },
  { id: 'corner-store', label: 'Corner Store', scene: 'the front of a corner store on a city block, awning and store windows behind' },
  { id: 'car-interior', label: 'Luxury Car', scene: 'the driver seat of a clean luxury car at night, soft dashboard glow and city lights through the windshield' },
  { id: 'gym', label: 'Gym', scene: 'a modern gym with dumbbell racks and mirrors behind, bright energetic light' },
  { id: 'coffee-shop', label: 'Coffee Shop', scene: 'a cozy coffee shop corner table with a laptop and a coffee cup, warm window light' },
  { id: 'night-street', label: 'City Street at Night', scene: 'a city street at night with graffiti walls, streetlights and wet pavement reflections' },
  { id: 'brownstone-stoop', label: 'Brownstone Stoop', scene: 'the stoop of a brownstone building on a tree-lined city block, late afternoon light' },
  { id: 'basketball-court', label: 'Basketball Court', scene: 'an outdoor basketball court with a chain-link fence and city buildings behind' },
];

export function getBackgroundPreset(id?: string | null): BackgroundPreset | null {
  if (!id) return null;
  return BACKGROUND_PRESETS.find((b) => b.id === id) ?? null;
}
