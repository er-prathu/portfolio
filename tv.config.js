/*
 * The television on the desk (room.html).
 *
 * Clicking the TV powers it on and plays a short introduction on its screen. By default that introduction is an
 * animated title sequence drawn live on the screen. To use your own video instead:
 *   1. Put the file next to room.html, e.g. media/intro.mp4 (MP4/H.264 plays everywhere; a WebM can be added as well).
 *   2. Set introVideo below to its path, e.g. 'media/intro.mp4'.
 * The video is drawn onto the same CRT screen (scanlines, curvature and all). If it fails to load, the title sequence
 * plays instead, so the TV never shows an error.
 */
window.DESK_TV_CONFIG = {
  introVideo: '',            // e.g. 'media/intro.mp4'; '' = use the built-in title sequence
  introVideoWebm: '',        // optional WebM alternative, tried first where supported
  soundDefault: false,       // false = silent until the visitor presses SOUND on the remote; true = sound plays when the TV turns on
  volume: 0.6,               // starting volume (0–1) once sound is on
};
