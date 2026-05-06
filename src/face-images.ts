/**
 * Face images configuration for Rémi UrbanHello device
 * Maps face states to their corresponding images
 */

import sleepyFace from './face/face_sleepy.png';
import awakeFace from './face/face_awake.png';
import semiAwakeFace from './face/face_semi_awake.png';
import smilyFace from './face/face_smily.png';
import blankFace from './face/face_blank.png';

/**
 * Available face states — values match HA select entity options (snake_case)
 */
export const FACE_STATES = [
  'sleepy_face',
  'awake_face',
  'semi_awake_face',
  'smily_face',
  'blank_face',
] as const;

export type FaceState = typeof FACE_STATES[number];

/**
 * Mapping of HA face state names to their imported image assets
 */
export const FACE_ICONS: Record<string, string> = {
  sleepy_face: sleepyFace,
  awake_face: awakeFace,
  semi_awake_face: semiAwakeFace,
  smily_face: smilyFace,
  blank_face: blankFace,
};

/**
 * Get the icon URL for a given face state
 * @param faceState - The face state identifier (e.g., 'sleepy_face', 'awake_face')
 * @returns The URL of the face icon image, defaults to blank face if state not found
 */
export function getFaceIcon(faceState: string): string {
  return FACE_ICONS[faceState] ?? FACE_ICONS.blank_face;
}
