# Host Paintfield on Render

Render runs the game **and** the multiplayer WebSocket on one URL. GitHub Pages cannot do rooms.

Your repo already has `render.yaml`. Play URL after deploy: `https://paintfield.onrender.com`

---

## 1. Push the game to GitHub

If this machine is already `c0decr4ft/paintball`, skip to step 2.

```bash
git add -A
git commit -m "Ready for Render"
git push -u origin HEAD
```

The branch you deploy should include `render.yaml`, `server/index.mjs`, `public/online.json`, and `package.json` scripts `build` / `start`.

---

## 2. Create a Render account

1. Open [https://dashboard.render.com](https://dashboard.render.com)
2. Sign up with **GitHub**
3. Allow Render to see the `paintball` repo

---

## 3. Deploy from the blueprint (easiest)

1. Open [New Blueprint](https://dashboard.render.com/select-repo?type=blueprint)
2. Pick **c0decr4ft/paintball**
3. Render reads `render.yaml` and creates a web service named **paintfield**
4. Confirm:
   - **Region:** Frankfurt
   - **Plan:** Free
   - **Branch:** the branch you pushed (often `main`, or `cursor/village-pvp-bomb-gameplay`)
5. Click **Apply** / **Create**

Wait until the service is **Live** (first build is 3–8 minutes).

---

## 4. Or create the Web Service by hand

If the blueprint is not used:

1. Dashboard → **New** → **Web Service**
2. Connect `c0decr4ft/paintball`
3. Settings:

| Field | Value |
| --- | --- |
| Name | `paintfield` |
| Region | Frankfurt |
| Branch | your game branch |
| Runtime | Node |
| Build command | `npm ci --include=dev && npm run build` |
| Start command | `npm start` |
| Health check path | `/healthz` |
| Plan | Free |

4. Environment:

| Key | Value |
| --- | --- |
| `NODE_ENV` | `production` |
| `HOST` | `0.0.0.0` |
| `PORT` | `10000` |

`--include=dev` is required. With `NODE_ENV=production`, plain `npm ci` skips Vite and the build fails.

5. **Create Web Service** → wait until Live.

---

## 5. Check it is up

In a browser:

- Game: [https://paintfield.onrender.com](https://paintfield.onrender.com)
- Health: [https://paintfield.onrender.com/healthz](https://paintfield.onrender.com/healthz) should return `{"ok":true,...}`

In the game: **Online** → create or join a room. Two browsers on that URL should see each other.

If the page 404s or is an old build, open the service → **Manual Deploy** → **Deploy latest commit**.

---

## 6. Point the client at Render (already done for this repo)

`public/online.json` is:

```json
{ "wsUrl": "wss://paintfield.onrender.com" }
```

Same-origin play on Render does not need this file (the page talks to its own host). Keep it so GitHub Pages can still reach the cloud socket.

If your Render URL is different, change `wsUrl` to `wss://YOUR-SERVICE.onrender.com` and redeploy.

---

## 7. Keep the free instance awake (optional)

Free Render **sleeps after ~15 minutes idle**. The next join can take ~30s to wake.

This repo has `.github/workflows/keep-alive.yml`. It pings `/healthz` on a schedule.

1. GitHub repo → **Actions** → enable workflows if asked
2. Push the workflow file to the default branch
3. **Actions** → **Keep Render awake** → **Run workflow** once to test

For no sleep, upgrade the Render plan.

---

## 8. Update after you change the game

```bash
git add -A
git commit -m "Describe the change"
git push
```

Render rebuilds on push if auto-deploy is on (default). Otherwise: service → **Manual Deploy** → **Deploy latest commit**.

Hard-refresh the game (`Cmd+Shift+R`) so the new JS/textures load.

---

## Local multiplayer (your PC stays on)

```bash
npm run start:local
```

Open `http://127.0.0.1:5173` (or the port Vite prints). Do **not** use `online.json` against Render while testing on localhost — the client already prefers `ws://127.0.0.1:8787`.

---

## Common failures

| Symptom | Fix |
| --- | --- |
| Build: `vite: not found` | Build command must be `npm ci --include=dev && npm run build` |
| Service starts then dies | Start command must be `npm start` (`node server/index.mjs`), not `vite` |
| Game loads, Online never connects | Confirm `/healthz` on the same host; wait for a cold start; check browser console for `wss://` errors |
| Blank page | Open the service logs; a failed `npm run build` still “deploys” an empty `dist/` |
| Old map/textures | Hard-refresh; `loadGameAssets` caches the GLB in the tab |
