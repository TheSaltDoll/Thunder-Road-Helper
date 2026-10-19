# Thunder Road Companion

A phone-friendly helper for **Thunder Road: Vendetta**. It tracks the three road tiles in play, shuffles and draws road tiles (base, Carnage at Devil’s Run and Ignition, keeping the road 3 to 3.5 lengths long and curves alternating), tracks the turn and road die, rolls the dice for Slam, Slam Direction, Shoot, On Fire, Oil Slick, Shrapnel, Dazed, Blast Off, Quake and Ramp, and keeps per-game die statistics.

## Put it on GitHub Pages

1. Create a new repository on GitHub (it can be public or private with Pages enabled).
2. Upload everything in this folder to the root of the repository, keeping the `icons` folder.
3. In the repository, go to **Settings → Pages**. Under "Build and deployment", choose **Deploy from a branch**, pick `main` and `/ (root)`, and save.
4. After a minute the site is live at `https://<your-username>.github.io/<repository-name>/`.

## Add it to your iPhone home screen

Open the site in Safari, tap the **Share** button, then **Add to Home Screen**. It launches full-screen, works offline after the first visit, and keeps the screen awake while open.

## Notes

- The game saves automatically on the phone. Closing the app or locking the screen won't lose it. Use the **⋯** menu → **New Game** to start over.
- After you publish an update, open the app once while online to pick up the new version.

## Files

| File | Purpose |
| --- | --- |
| `index.html` | Page layout |
| `style.css` | Look and feel |
| `app.js` | Game logic, dice and saving |
| `sw.js` | Offline support |
| `manifest.webmanifest`, `icons/` | Home-screen name and icon |
