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
 * Mapping of HA snake_case face state to API camelCase key.
 * Used to convert the select entity state back to the card's face keys.
 */
export const FACE_HA_TO_API: Record<string, string> = {
  sleepy_face: 'sleepyFace',
  awake_face: 'awakeFace',
  blank_face: 'blankFace',
  semi_awake_face: 'semiAwakeFace',
  smily_face: 'smilyFace',
};

/**
 * Mapping of API camelCase face key to HA snake_case option.
 * Used to send the selected face to the HA select entity.
 */
export const FACE_API_TO_HA: Record<string, string> = {
  sleepyFace: 'sleepy_face',
  awakeFace: 'awake_face',
  blankFace: 'blank_face',
  semiAwakeFace: 'semi_awake_face',
  smilyFace: 'smily_face',
};

/**
 * Get the icon URL for a given face state
 * @param faceState - The face state identifier (e.g., 'sleepy_face', 'awake_face')
 * @returns The URL of the face icon image, defaults to blank face if state not found
 */
export function getFaceIcon(faceState: string): string {
  return FACE_ICONS[faceState] ?? FACE_ICONS.blank_face;
}
