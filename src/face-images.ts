// Face images configuration
import sleepyFace from './face/face_sleepy.png';
import awakeFace from './face/face_awake.png';
import semiAwakeFace from './face/face_semi_awake.png';
import smilyFace from './face/face_smily.png';
import blankFace from './face/face_blank.png';

export const FACE_NAMES: { [key: string]: string } = {
  sleepyFace: 'Sommeil',
  awakeFace: 'Éveil',
  semiAwakeFace: 'Semi-éveil',
  smilyFace: 'Sourire',
  blankFace: 'Neutre',
};

export const FACE_ICONS: { [key: string]: string } = {
  sleepyFace,
  awakeFace,
  semiAwakeFace,
  smilyFace,
  blankFace,
};

// Helper to get face icon with fallback
export function getFaceIcon(faceState: string): string {
  const primaryIcon = FACE_ICONS[faceState];
  if (primaryIcon) {
    return primaryIcon;
  }
  // Return blank face
  return FACE_ICONS.blankFace;
}
