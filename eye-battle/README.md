# Eye Battle: The Eyebrow Duel
Two-player, one-webcam fighting game controlled by eyebrows. Pure HTML/CSS/JS, no build step.

## Run locally
Camera access needs `localhost` or HTTPS, so serve the folder (not file://):
```
cd eye-battle
python3 -m http.server 8000      # or: npx serve .
```
Open http://localhost:8000 in Chrome/Edge/Firefox and allow the camera. Internet is needed once to load MediaPipe (CDN) and the face model.

## Control modes
Each player picks Eyebrow or Mouth control on the name screen (they can differ). Mouth mode uses the `jawOpen` blendshape against the calibrated neutral mouth, so keep your mouth closed during calibration.

## How to play
Stand side by side, Player 1 on the left, Player 2 on the right. Calibrate with relaxed faces.
- Raise eyebrows (or open mouth wide in Mouth mode): attack (10 damage, 0.6 s cooldown)
- Do it twice within 0.7 s: special (20 damage, 4 s cooldown)
- Close both eyes about 0.3 s and hold: shield (blocks 70% of damage)
- Best of 3 rounds, 100 HP each.
Dev fallback keys: A/S (P1 attack/special), J/K (P2).

## Tech stack
- MediaPipe Tasks Vision `FaceLandmarker` (2 faces, blendshapes on) for tracking
- `getUserMedia` webcam; Canvas API for fighters, effects and result card
- Eyebrow score = mean of `browInnerUp`, `browOuterUpLeft`, `browOuterUpRight`, minus each player's calibrated neutral value. Blink score = mean of `eyeBlinkLeft/Right`.
- Players are assigned by horizontal position in the mirrored frame (the two largest faces, leftmost = P1), so one player's gestures never drive the other fighter.

## Files
`index.html` screens, `style.css` neon theme, `game.js` tracking, gestures, game loop, rendering.

## Tuning
Edit `CFG` at the top of `game.js` (raise threshold `on`/`off`, cooldowns, shield hold time).
