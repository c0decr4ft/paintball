# Host PAIN - FIELD on Render

Render must serve **PAIN - FIELD** with the two playable maps (`pvp_map.glb` and
`castle_wars_pavlov_vr.glb`), not `cs_office` / `de_dust2`.

The only gun is the original blaster (`public/models/blaster.glb`).

Render runs the Vite client **and** the multiplayer WebSocket on one URL. GitHub Pages cannot host rooms.

Play URL after a blueprint deploy named `paintfield`: **https://paintfield.onrender.com**

If you rename the service, the URL is `https://<service-name>.onrender.com`. Same-origin WebSockets still work; only `public/online.json` and the keep-alive ping need the new host.

---

## 1. Push the game to GitHub

The deploy clone must include the runtime GLBs. They are no longer gitignored:

- `public/models/pvp_map.glb` (abandoned village — required)
- `public/models/castle_wars_pavlov_vr.glb`
- `public/models/clone_commando.glb`
- `public/models/phoenix.glb`
- `public/models/blaster.glb`
- `public/models/cs_go_bomb.glb`

Commit those files on the branch you deploy (often `cursor/village-pvp-bomb-gameplay` or `main`), plus `render.yaml`, `server/index.mjs`, `public/online.json`, and `package.json` scripts `build` / `start`.

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
   - **Branch:** the branch you pushed
5. Click **Apply** / **Create**

Wait until the service is **Live** (first build is 3–8 minutes). Do **not** set `PORT` yourself — Render injects it. The process binds `0.0.0.0` and `process.env.PORT`.

---

## 4. Or create the Web Service by hand

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
| Health check path | `/health` |
| Plan | Free |

4. Environment:

| Key | Value |
| --- | --- |
| `NODE_ENV` | `production` |
| `NODE_VERSION` | `22` |
| `HOST` | `0.0.0.0` |

Leave `PORT` unset. `--include=dev` is required so Vite is installed when `NODE_ENV=production`.

5. **Create Web Service** → wait until Live.

Optional: `VITE_WS_URL` (baked in at **build** time) if you must pin a socket host. Same-origin play on Render does not need it.

---

## 5. Check it is up

- Game: [https://paintfield.onrender.com](https://paintfield.onrender.com)
- Health: [https://paintfield.onrender.com/health](https://paintfield.onrender.com/health) → `{"ok":true,...}`
- A model: [https://paintfield.onrender.com/models/pvp_map.glb](https://paintfield.onrender.com/models/pvp_map.glb) should download, not 404

In the game: **Online** → create or join a room. Two browsers on that URL should see each other.

Free instances sleep after ~15 minutes idle. The first request can take ~30s to wake.

If the page 404s or is an old build: service → **Manual Deploy** → **Deploy latest commit**.

---

## 6. Client WebSocket URL

On Render (or any `npm start` production build), the page uses **same-origin** `wss://` / `ws://` on `https` / `http`. You do not need `online.json` for that.

`public/online.json` is a fallback for GitHub Pages:

```json
{ "wsUrl": "wss://paintfield.onrender.com" }
```

If your Render URL is different and you still use GitHub Pages, change `wsUrl` and redeploy Pages.

---

## 7. Keep the free instance awake (optional)

`.github/workflows/keep-alive.yml` pings `/health` every 10 minutes. Scheduled workflows only run on the **default** branch.

1. GitHub repo → **Actions** → enable workflows
2. If the live URL is not `https://paintfield.onrender.com`, add Actions variable `RENDER_HEALTH_URL` = `https://YOUR-SERVICE.onrender.com/health`
3. **Actions** → **Keep Render awake** → **Run workflow** once to test

For no sleep, upgrade the Render plan.

---

## 8. Update after you change the game

```bash
git add -A
git commit -m "Describe the change"
git push
```

Render rebuilds on push if auto-deploy is on. Hard-refresh the game (`Cmd+Shift+R`) so hashed JS and GLBs reload.

---

## Local production (same path as Render)

```bash
RENDER=true npm run build
HOST=127.0.0.1 PORT=4174 npm start
```

Open `http://127.0.0.1:4174`. This is the Render path (Node serves `dist/` + WebSocket). Vite on port 5173 is **dev only**.

Local multiplayer with HMR:

```bash
npm run start:local
```

Open the Vite URL (usually `http://127.0.0.1:5173`). The client talks to `ws://127.0.0.1:8787`.

---

## Common failures

| Symptom | Fix |
| --- | --- |
| Build: `vite: not found` | Build command must be `npm ci --include=dev && npm run build` |
| Service starts then dies | Start command must be `npm start` (`node server/index.mjs`), not `vite`. Do not override `PORT`. |
| Game loads, Online never connects | Confirm `/health` on the same host; wait for a cold start; console should show `wss://` to **this** origin |
| Blank page / missing guns | Logs: `missing models in dist/`. Commit the GLBs listed above. |
| `/health` 404 | Health path must be `/health` (older docs used `/healthz`, still aliased) |
| Keep-alive hits a dead host | Set `RENDER_HEALTH_URL` or rename the service back to `paintfield` |
