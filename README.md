# Nova Lane

A neon space shooter that runs in your browser. No install, no build step, no server.

## Play

Open `index.html` in any modern browser, or play the hosted version once you publish it (see below).

**Controls**

| Action | Keyboard / mouse | Touch |
| --- | --- | --- |
| Fly (guns fire automatically) | WASD, arrow keys, or mouse | Drag |
| Bomb | Space | BOMB button |
| Pause | P or Esc | PAUSE button |
| Sound on / off | M | SND button |

**Pickups:** W raises weapon level (up to 5), S gives a one-hit shield, B adds a bomb, H restores hull.
Kills within 2 seconds of each other build a score multiplier up to x8. Every fifth wave brings the Warden boss.

## Project files

```
index.html   page markup
style.css    layout and menu styling
game.js      all game logic, drawing and sound
```

The game is fully client-side. The best score is stored in the browser's `localStorage`, and all sound is synthesised with the Web Audio API, so there are no asset files. Fonts (Chakra Petch, IBM Plex Mono) load from Google Fonts; offline, the game falls back to system fonts.

## Publish on GitHub Pages

1. Create a new repository on GitHub and upload `index.html`, `style.css`, `game.js` and `README.md` to the root of the repository.
2. Open the repository's **Settings → Pages**.
3. Under **Build and deployment**, set **Source** to **Deploy from a branch**, choose the `main` branch and the `/ (root)` folder, then save.
4. After a minute the game is live at `https://<your-username>.github.io/<repository-name>/`.

From the command line:

```bash
git init
git add .
git commit -m "Add Nova Lane"
git branch -M main
git remote add origin https://github.com/<your-username>/<repository-name>.git
git push -u origin main
```

## Run locally with a server (optional)

Opening `index.html` directly works. If you prefer a local server:

```bash
python3 -m http.server 8000
```

Then visit `http://localhost:8000`.

## License

Add a license file (for example MIT) before publishing if you want others to reuse the code.
