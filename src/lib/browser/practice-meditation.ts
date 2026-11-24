import type { WoodenFishTempoPreset } from '$lib/domain/practice/guided-sessions';
import type { AmbientSoundType } from './ambient-sound';
import type { MeditationTrack } from './practice-audio';

export interface MeditationSetup {
  durationMinutes: number;
  fullscreenVisual: boolean;
  motionEnabled: boolean;
  musicTrack: MeditationTrack | null;
  musicVolume?: number;
  ambientSound?: AmbientSoundType;
  ambientVolume?: number;
  woodenFishBpm: number;
  woodenFishEnabled: boolean;
  woodenFishPreset: WoodenFishTempoPreset;
}

export const DEFAULT_MEDITATION_SETUP: MeditationSetup = {
  durationMinutes: 15,
  fullscreenVisual: true,
  motionEnabled: false,
  musicTrack: null,
  musicVolume: 0.8,
  ambientSound: 'none',
  ambientVolume: 0.6,
  woodenFishBpm: 45,
  woodenFishEnabled: false,
  woodenFishPreset: 'slow',
};

export function formatPracticeTime(totalSeconds: number): string {
  const seconds = Math.max(0, Math.ceil(totalSeconds));
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}
