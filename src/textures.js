import * as THREE from "three";

function canvas(size, draw) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d");
  draw(ctx, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 1;
  return tex;
}

export function grassTexture() {
  const tex = canvas(512, (ctx, s) => {
    ctx.fillStyle = "#3a6b32";
    ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 9000; i++) {
      const x = Math.random() * s;
      const y = Math.random() * s;
      const h = 4 + Math.random() * 10;
      ctx.strokeStyle = Math.random() > 0.5 ? "#4d8640" : "#2f5829";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + (Math.random() - 0.5) * 3, y - h);
      ctx.stroke();
    }
    ctx.globalAlpha = 0.12;
    for (let i = 0; i < 40; i++) {
      ctx.fillStyle = Math.random() > 0.5 ? "#6a9a4a" : "#2a4a24";
      ctx.fillRect(Math.random() * s, Math.random() * s, 40, 28);
    }
  });
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(18, 18);
  return tex;
}

export function dirtTexture() {
  const tex = canvas(256, (ctx, s) => {
    ctx.fillStyle = "#6b5438";
    ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 1200; i++) {
      ctx.fillStyle = `rgba(${90 + Math.random() * 50},${70 + Math.random() * 30},${40},0.4)`;
      ctx.beginPath();
      ctx.arc(Math.random() * s, Math.random() * s, Math.random() * 4, 0, Math.PI * 2);
      ctx.fill();
    }
  });
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(4, 8);
  return tex;
}

export function gravelTexture() {
  const tex = canvas(512, (ctx, s) => {
    ctx.fillStyle = "#b7b2a6";
    ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 2200; i++) {
      const g = 140 + Math.random() * 70;
      ctx.fillStyle = `rgb(${g + 8},${g},${g - 14})`;
      ctx.beginPath();
      ctx.ellipse(Math.random() * s, Math.random() * s, 1 + Math.random() * 4, 1 + Math.random() * 3, Math.random() * 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 0.18;
    for (let i = 0; i < 40; i++) {
      ctx.fillStyle = Math.random() > 0.5 ? "#9a9488" : "#d2cdc2";
      ctx.fillRect(Math.random() * s, Math.random() * s, 50, 24);
    }
  });
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(16, 16);
  return tex;
}

export function concreteTexture() {
  const tex = canvas(512, (ctx, s) => {
    ctx.fillStyle = "#7c7c78";
    ctx.fillRect(0, 0, s, s);
    const tile = 128;
    for (let y = 0; y < s; y += tile) {
      for (let x = 0; x < s; x += tile) {
        const n = 150 + ((x * 3 + y * 7) % 18);
        ctx.fillStyle = `rgb(${n},${n - 1},${n - 5})`;
        ctx.fillRect(x + 3, y + 3, tile - 6, tile - 6);
        for (let i = 0; i < 40; i++) {
          const g = n - 8 + Math.random() * 16;
          ctx.fillStyle = `rgba(${g},${g - 1},${g - 4},0.28)`;
          ctx.fillRect(x + 6 + Math.random() * (tile - 12), y + 6 + Math.random() * (tile - 12), 4, 3);
        }
      }
    }
    ctx.fillStyle = "#6a6a66";
    for (let i = 0; i <= s; i += tile) {
      ctx.fillRect(i, 0, 3, s);
      ctx.fillRect(0, i, s, 3);
    }
  });
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(10, 8);
  return tex;
}

export function corrugatedTexture() {
  const tex = canvas(256, (ctx, s) => {
    ctx.fillStyle = "#9aa0a4";
    ctx.fillRect(0, 0, s, s);
    for (let x = 0; x < s; x += 10) {
      ctx.fillStyle = x % 20 === 0 ? "#7c8286" : "#b4b9bc";
      ctx.fillRect(x, 0, 6, s);
    }
    ctx.globalAlpha = 0.15;
    ctx.fillStyle = "#3a2208";
    for (let i = 0; i < 30; i++) ctx.fillRect(Math.random() * s, Math.random() * s, 40, 18);
  });
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 1);
  return tex;
}

export function cautionTexture() {
  const tex = canvas(128, (ctx, s) => {
    ctx.fillStyle = "#111111";
    ctx.fillRect(0, 0, s, s);
    ctx.fillStyle = "#f5c400";
    for (let i = -s; i < s * 2; i += 28) {
      ctx.save();
      ctx.translate(i, 0);
      ctx.transform(1, 0, 0.7, 1, 0, 0);
      ctx.fillRect(0, 0, 14, s);
      ctx.restore();
    }
  });
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(8, 1);
  return tex;
}

/** Unbranded cardboard/wood crate faces — no logos or lettering. */
export function crateTexture() {
  const tex = canvas(256, (ctx, s) => {
    ctx.fillStyle = "#c4a06a";
    ctx.fillRect(0, 0, s, s);
    for (let y = 0; y < s; y += 42) {
      const shade = 168 + ((y * 3) % 18);
      ctx.fillStyle = `rgb(${shade + 18},${shade - 8},${shade - 48})`;
      ctx.fillRect(0, y + 2, s, 36);
      ctx.strokeStyle = "rgba(90,58,22,0.35)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, y + 2);
      ctx.lineTo(s, y + 2);
      ctx.stroke();
      for (let x = 0; x < s; x += 7) {
        ctx.strokeStyle = `rgba(70,42,12,${0.08 + (x % 21) * 0.006})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x + Math.sin((y + x) * 0.08) * 1.2, y + 4);
        ctx.lineTo(x, y + 36);
        ctx.stroke();
      }
    }
    ctx.fillStyle = "#6a5640";
    ctx.fillRect(0, 18, s, 10);
    ctx.fillRect(0, s - 28, s, 10);
    ctx.fillStyle = "#8a7358";
    ctx.fillRect(0, 20, s, 6);
    ctx.fillRect(0, s - 26, s, 6);
    ctx.fillStyle = "rgba(40,28,12,0.55)";
    for (const [x, y] of [
      [12, 23],
      [s / 2, 23],
      [s - 12, 23],
      [12, s - 23],
      [s / 2, s - 23],
      [s - 12, s - 23],
    ]) {
      ctx.beginPath();
      ctx.arc(x, y, 2.4, 0, Math.PI * 2);
      ctx.fill();
    }
  });
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

export function plywoodTexture() {
  const tex = canvas(256, (ctx, s) => {
    ctx.fillStyle = "#d2ae6a";
    ctx.fillRect(0, 0, s, s);
    for (let x = 0; x < s; x += 7) {
      ctx.strokeStyle = `rgba(90,58,18,${0.12 + (x % 21) * 0.008})`;
      ctx.lineWidth = 1 + (x % 14 === 0 ? 1 : 0);
      ctx.beginPath();
      ctx.moveTo(x + Math.sin(x * 0.4) * 1.5, 0);
      ctx.lineTo(x, s);
      ctx.stroke();
    }
    ctx.strokeStyle = "rgba(70,42,12,0.55)";
    ctx.lineWidth = 5;
    ctx.strokeRect(4, 4, s - 8, s - 8);
    ctx.fillStyle = "rgba(50,30,10,0.45)";
    for (const [x, y] of [
      [14, 14],
      [s - 14, 14],
      [14, s - 14],
      [s - 14, s - 14],
    ]) {
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  });
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

export function rustTexture() {
  const tex = canvas(256, (ctx, s) => {
    ctx.fillStyle = "#5a4638";
    ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 500; i++) {
      ctx.fillStyle = `rgba(${90 + Math.random() * 80},${40 + Math.random() * 30},${16},0.45)`;
      ctx.beginPath();
      ctx.arc(Math.random() * s, Math.random() * s, Math.random() * 12, 0, Math.PI * 2);
      ctx.fill();
    }
  });
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

export function meshFenceTexture() {
  const tex = canvas(128, (ctx, s) => {
    ctx.fillStyle = "rgba(210, 90, 20, 0.55)";
    ctx.fillRect(0, 0, s, s);
    ctx.strokeStyle = "rgba(255, 160, 60, 0.8)";
    ctx.lineWidth = 2;
    const step = 10;
    for (let y = -s; y < s * 2; y += step) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(s, y + s * 0.35);
      ctx.stroke();
    }
  });
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(24, 4);
  return tex;
}

export function chainlinkTexture() {
  const tex = canvas(128, (ctx, s) => {
    ctx.clearRect(0, 0, s, s);
    ctx.strokeStyle = "rgba(200, 210, 200, 0.7)";
    ctx.lineWidth = 3;
    const step = 16;
    for (let y = -s; y < s * 2; y += step) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(s, y + s);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(s, y);
      ctx.lineTo(0, y + s);
      ctx.stroke();
    }
  });
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(40, 6);
  return tex;
}

export function woodTexture() {
  const tex = canvas(256, (ctx, s) => {
    ctx.fillStyle = "#6a4a2a";
    ctx.fillRect(0, 0, s, s);
    for (let x = 0; x < s; x += 18) {
      ctx.fillStyle = x % 36 === 0 ? "#5a3c22" : "#7a5632";
      ctx.fillRect(x, 0, 16, s);
    }
    ctx.globalAlpha = 0.2;
    for (let i = 0; i < 80; i++) {
      ctx.fillStyle = "#3a2414";
      ctx.fillRect(Math.random() * s, Math.random() * s, 40, 2);
    }
  });
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

let _gymWall = null;
export function gymCourtWallTexture() {
  if (_gymWall) return _gymWall;
  const tex = canvas(512, (ctx, s) => {
    ctx.fillStyle = "#cbb79a";
    ctx.fillRect(0, 0, s, s);
    const bw = 64;
    const bh = 28;
    const mortar = 3;
    for (let row = -1; row < s / bh + 2; row++) {
      const off = (row & 1) * (bw * 0.5);
      for (let col = -1; col < s / bw + 2; col++) {
        const x = col * bw + off;
        const y = row * bh;
        const n = (row * 17 + col * 11) % 9;
        const wash = 214 + n;
        ctx.fillStyle = `rgb(${wash + 6},${wash - 4},${wash - 22})`;
        ctx.fillRect(x + mortar, y + mortar, bw - mortar * 2, bh - mortar * 2);
        if ((row * 7 + col * 13) % 11 === 0) {
          ctx.fillStyle = "rgba(168, 92, 62, 0.32)";
          ctx.fillRect(x + mortar + 6, y + mortar + 4, bw * 0.38, bh - mortar * 2 - 8);
        } else if ((row + col) % 8 === 0) {
          ctx.fillStyle = "rgba(255, 248, 236, 0.22)";
          ctx.fillRect(x + mortar + 2, y + mortar + 2, bw - mortar * 2 - 4, 4);
        }
      }
    }
    ctx.globalAlpha = 0.28;
    ctx.fillStyle = "#e8dcc4";
    ctx.fillRect(0, 0, s, s);
    ctx.globalAlpha = 0.12;
    for (let i = 0; i < 70; i++) {
      const g = 190 + Math.random() * 40;
      ctx.fillStyle = `rgb(${g + 8},${g},${g - 18})`;
      ctx.fillRect(Math.random() * s, Math.random() * s, 18 + Math.random() * 70, 8 + Math.random() * 22);
    }
    ctx.globalAlpha = 0.1;
    ctx.fillStyle = "#6a5340";
    for (let i = 0; i < 18; i++) {
      ctx.fillRect(Math.random() * s, Math.random() * s, 1, 12 + Math.random() * 28);
    }
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = "#8a7060";
    for (let i = 0; i < 14; i++) {
      ctx.fillRect(Math.random() * s, Math.random() * s, 30 + Math.random() * 90, 10 + Math.random() * 24);
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#b6a48c";
    ctx.fillRect(0, 0, 5, s);
    ctx.fillRect(s - 5, 0, 5, s);
    ctx.fillRect(s * 0.5 - 2, 0, 4, s);
  });
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 2;
  _gymWall = tex;
  return tex;
}

let _gymFloor = null;
export function gymCourtFloorTexture() {
  if (_gymFloor) return _gymFloor;
  const tex = canvas(512, (ctx, s) => {
    ctx.fillStyle = "#cfc4b0";
    ctx.fillRect(0, 0, s, s);
    const tile = 128;
    for (let y = 0; y < s; y += tile) {
      for (let x = 0; x < s; x += tile) {
        const n = 196 + ((x * 5 + y * 3) % 16);
        ctx.fillStyle = `rgb(${n + 6},${n},${n - 14})`;
        ctx.fillRect(x + 3, y + 3, tile - 6, tile - 6);
        for (let i = 0; i < 28; i++) {
          const g = n - 10 + Math.random() * 18;
          ctx.fillStyle = `rgba(${g + 4},${g},${g - 10},0.22)`;
          ctx.fillRect(x + 8 + Math.random() * (tile - 16), y + 8 + Math.random() * (tile - 16), 5, 3);
        }
      }
    }
    ctx.fillStyle = "#b4a890";
    for (let i = 0; i <= s; i += tile) {
      ctx.fillRect(i, 0, 3, s);
      ctx.fillRect(0, i, s, 3);
    }
  });
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 2;
  _gymFloor = tex;
  return tex;
}

export function warehouseWallTexture() {
  return gymCourtWallTexture();
}

let _villageWall = null;

export function villageWallTexture() {
  if (_villageWall) return _villageWall;
  const tex = canvas(512, (ctx, s) => {
    ctx.fillStyle = "#6a4a38";
    ctx.fillRect(0, 0, s, s);
    const bw = 42;
    const bh = 22;
    const mortar = 3;
    for (let row = -1; row < s / bh + 2; row++) {
      const off = (row & 1) * (bw * 0.5);
      for (let col = -1; col < s / bw + 2; col++) {
        const x = col * bw + off;
        const y = row * bh;
        const n = (row * 13 + col * 19) % 11;
        const r = 118 + n * 4;
        const g = 72 + n * 2;
        const b = 48 + (n % 4);
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.fillRect(x + mortar, y + mortar, bw - mortar * 2, bh - mortar * 2);
        if (((row + col * 3) % 7) === 0) {
          ctx.fillStyle = "rgba(90, 48, 32, 0.35)";
          ctx.fillRect(x + mortar + 2, y + mortar + 2, bw * 0.45, bh - mortar * 2 - 4);
        }
      }
    }
    ctx.globalAlpha = 0.88;
    ctx.fillStyle = "#cbb392";
    ctx.fillRect(0, 0, s, s);
    ctx.globalAlpha = 1;
    for (let i = 0; i < 14; i++) {
      const x = (i * 97) % s;
      const y = (i * 53) % (s * 0.72);
      const w = 48 + ((i * 17) % 90);
      const h = 36 + ((i * 11) % 70);
      ctx.save();
      ctx.globalAlpha = 0.55 + (i % 5) * 0.08;
      ctx.beginPath();
      ctx.moveTo(x, y + h * 0.2);
      ctx.lineTo(x + w * 0.15, y);
      ctx.lineTo(x + w, y + h * 0.1);
      ctx.lineTo(x + w * 0.92, y + h);
      ctx.lineTo(x + 4, y + h * 0.92);
      ctx.closePath();
      ctx.clip();
      ctx.globalAlpha = 1;
      const row0 = Math.floor(y / bh);
      for (let row = row0 - 1; row < row0 + h / bh + 2; row++) {
        const off = (row & 1) * (bw * 0.5);
        for (let col = -1; col < s / bw + 2; col++) {
          const bx = col * bw + off;
          const by = row * bh;
          const n = (row * 13 + col * 19) % 11;
          ctx.fillStyle = `rgb(${124 + n * 5},${78 + n * 2},${52 + (n % 3)})`;
          ctx.fillRect(bx + mortar, by + mortar, bw - mortar * 2, bh - mortar * 2);
        }
      }
      ctx.restore();
    }
    ctx.globalAlpha = 0.22;
    for (let i = 0; i < 18; i++) {
      const x = (i * 73) % s;
      ctx.fillStyle = i % 2 ? "#6a5340" : "#4a3a2c";
      ctx.fillRect(x, 0, 7 + (i % 3) * 4, s);
    }
    ctx.globalAlpha = 0.28;
    for (let i = 0; i < 12; i++) {
      ctx.fillStyle = "#5a6a40";
      ctx.fillRect((i * 41) % s, s * 0.55 + ((i * 19) % 80), 18 + (i % 5) * 16, 40 + (i % 4) * 28);
    }
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = "#3a2a1c";
    for (let i = 0; i < 16; i++) {
      const x = 20 + ((i * 67) % (s - 40));
      ctx.beginPath();
      ctx.moveTo(x, 8);
      ctx.quadraticCurveTo(x + 6, s * 0.45, x - 4, s);
      ctx.lineTo(x + 10, s);
      ctx.quadraticCurveTo(x + 16, s * 0.4, x + 8, 8);
      ctx.fill();
    }
    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = "#5a4638";
    ctx.lineWidth = 1.4;
    for (let i = 0; i < 10; i++) {
      ctx.beginPath();
      const x = (i * 51) % s;
      const y = (i * 37) % s;
      ctx.moveTo(x, y);
      ctx.lineTo(x + 20 + (i % 5) * 12, y + 40 + (i % 4) * 18);
      ctx.stroke();
    }
    ctx.globalAlpha = 0.2;
    ctx.fillStyle = "#2e4a28";
    ctx.fillRect(0, s * 0.78, s, s * 0.22);
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#8a6a48";
    ctx.fillRect(0, 0, 8, s);
    ctx.fillRect(s - 8, 0, 8, s);
    ctx.fillRect(s * 0.5 - 4, 0, 7, s);
  });
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 2;
  _villageWall = tex;
  return tex;
}

let _pebbleFloor = null;

export function warehouseFloorTexture() {
  return gymCourtFloorTexture();
}

/** Packed pebble gravel — small stones, seamless tile. */
export function villageFloorTexture() {
  if (_pebbleFloor) return _pebbleFloor;
  const tex = canvas(512, (ctx, s) => {
    const h = (i, j) => {
      const n = Math.sin(i * 127.1 + j * 311.7) * 43758.5453;
      return n - Math.floor(n);
    };
    ctx.fillStyle = "#5c564c";
    ctx.fillRect(0, 0, s, s);
    const img = ctx.getImageData(0, 0, s, s);
    const d = img.data;
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        const n = h(x * 0.37, y * 0.41);
        const i = (y * s + x) * 4;
        d[i] = 88 + n * 28;
        d[i + 1] = 82 + n * 22;
        d[i + 2] = 70 + n * 16;
        d[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);

    const palettes = [
      [168, 162, 150],
      [148, 140, 126],
      [186, 178, 162],
      [132, 128, 118],
      [174, 156, 132],
      [158, 152, 138],
      [120, 116, 108],
      [190, 186, 174],
    ];
    const cell = 9;
    const drawPebble = (cx, cy, rx, ry, rot, rgb, n) => {
      for (const ox of [-s, 0, s]) {
        for (const oy of [-s, 0, s]) {
          const x = cx + ox;
          const y = cy + oy;
          if (x < -16 || x > s + 16 || y < -16 || y > s + 16) continue;
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(rot);
          ctx.fillStyle = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
          ctx.beginPath();
          ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = `rgba(${Math.max(0, rgb[0] - 48)},${Math.max(0, rgb[1] - 46)},${Math.max(0, rgb[2] - 40)},0.55)`;
          ctx.lineWidth = 0.7;
          ctx.stroke();
          ctx.fillStyle = `rgba(255,255,248,${0.1 + n * 0.12})`;
          ctx.beginPath();
          ctx.ellipse(-rx * 0.28, -ry * 0.32, rx * 0.32, ry * 0.22, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      }
    };
    for (let row = 0; row < s / cell + 1; row++) {
      for (let col = 0; col < s / cell + 1; col++) {
        const n = h(col + 3, row + 9);
        if (n < 0.08) continue;
        const cx = col * cell + cell * 0.5 + (h(row, col) - 0.5) * cell * 0.62;
        const cy = row * cell + cell * 0.5 + (h(col + 2, row) - 0.5) * cell * 0.62;
        const rx = 2.1 + n * 4.4;
        const ry = 1.7 + h(row, col + 5) * 3.6;
        const rot = h(col * 3, row * 7) * Math.PI;
        const pal = palettes[(col * 13 + row * 7) % palettes.length];
        const shade = 0.82 + n * 0.28;
        drawPebble(
          cx,
          cy,
          rx,
          ry,
          rot,
          [(pal[0] * shade) | 0, (pal[1] * shade) | 0, (pal[2] * shade) | 0],
          n
        );
      }
    }
  });
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(7, 7);
  tex.anisotropy = 2;
  _pebbleFloor = tex;
  return tex;
}

let _fireTex = null;
export function fireTexture() {
  if (_fireTex) return _fireTex;
  _fireTex = canvas(64, (ctx, s) => {
    ctx.clearRect(0, 0, s, s);
    const g = ctx.createRadialGradient(s * 0.5, s * 0.55, 2, s * 0.5, s * 0.5, s * 0.48);
    g.addColorStop(0, "rgba(255, 248, 210, 1)");
    g.addColorStop(0.22, "rgba(255, 180, 50, 0.95)");
    g.addColorStop(0.55, "rgba(255, 70, 12, 0.72)");
    g.addColorStop(0.82, "rgba(80, 8, 0, 0.28)");
    g.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(s * 0.5, s * 0.5, s * 0.48, 0, Math.PI * 2);
    ctx.fill();
  });
  return _fireTex;
}

let _dentTex = null;
export function dentTexture() {
  if (_dentTex) return _dentTex;
  _dentTex = canvas(64, (ctx, s) => {
    ctx.clearRect(0, 0, s, s);
    const g = ctx.createRadialGradient(s * 0.5, s * 0.48, 2, s * 0.5, s * 0.5, s * 0.46);
    g.addColorStop(0, "rgba(18, 16, 14, 0.78)");
    g.addColorStop(0.45, "rgba(40, 34, 28, 0.5)");
    g.addColorStop(0.78, "rgba(70, 62, 52, 0.18)");
    g.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(s * 0.5, s * 0.5, s * 0.38, s * 0.28, 0.2, 0, Math.PI * 2);
    ctx.fill();
  });
  return _dentTex;
}

const _puddleCache = new Map();
export function puddleTexture(hex) {
  const key = new THREE.Color(hex).getHex();
  const hit = _puddleCache.get(key);
  if (hit) return hit;
  const color = new THREE.Color(hex);
  const r = (color.r * 255) | 0;
  const g = (color.g * 255) | 0;
  const b = (color.b * 255) | 0;
  const tex = canvas(128, (ctx, s) => {
    ctx.clearRect(0, 0, s, s);
    const cx = s * 0.5;
    const cy = s * 0.52;
    const pool = ctx.createRadialGradient(cx, cy, s * 0.08, cx, cy, s * 0.46);
    pool.addColorStop(0, `rgba(${Math.max(0, r - 40)},${Math.max(0, g - 12)},${Math.max(0, b - 12)},0.96)`);
    pool.addColorStop(0.45, `rgba(${r},${g},${b},0.88)`);
    pool.addColorStop(0.78, `rgba(${r},${g},${b},0.42)`);
    pool.addColorStop(1, `rgba(${r},${g},${b},0)`);
    ctx.fillStyle = pool;
    ctx.beginPath();
    ctx.ellipse(cx, cy, s * 0.44, s * 0.3, -0.25, 0, Math.PI * 2);
    ctx.fill();
    for (let i = 0; i < 10; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = s * (0.18 + Math.random() * 0.22);
      ctx.fillStyle = `rgba(${r},${g},${b},${0.35 + Math.random() * 0.4})`;
      ctx.beginPath();
      ctx.ellipse(cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.7, 8 + Math.random() * 18, 5 + Math.random() * 10, a, 0, Math.PI * 2);
      ctx.fill();
    }
  });
  _puddleCache.set(key, tex);
  return tex;
}

const _splatCache = new Map();
function makeSplat(hex) {
  const color = new THREE.Color(hex);
  return canvas(128, (ctx, s) => {
    ctx.clearRect(0, 0, s, s);
    const blobs = 7 + Math.floor(Math.random() * 5);
    for (let i = 0; i < blobs; i++) {
      const x = s / 2 + (Math.random() - 0.5) * 50;
      const y = s / 2 + (Math.random() - 0.5) * 50;
      const r = 10 + Math.random() * 28;
      const g = ctx.createRadialGradient(x, y, r * 0.1, x, y, r);
      g.addColorStop(0, `rgba(${(color.r * 255) | 0},${(color.g * 255) | 0},${(color.b * 255) | 0},0.95)`);
      g.addColorStop(0.55, `rgba(${(color.r * 255) | 0},${(color.g * 255) | 0},${(color.b * 255) | 0},0.75)`);
      g.addColorStop(1, `rgba(${(color.r * 255) | 0},${(color.g * 255) | 0},${(color.b * 255) | 0},0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = `rgba(${(color.r * 255) | 0},${(color.g * 255) | 0},${(color.b * 255) | 0},0.85)`;
    for (let i = 0; i < 18; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = 18 + Math.random() * 40;
      const x = s / 2 + Math.cos(a) * d;
      const y = s / 2 + Math.sin(a) * d;
      ctx.beginPath();
      ctx.arc(x, y, 1.5 + Math.random() * 4, 0, Math.PI * 2);
      ctx.fill();
    }
    for (let i = 0; i < 4; i++) {
      const x = s / 2 + (Math.random() - 0.5) * 30;
      ctx.beginPath();
      ctx.moveTo(x, s / 2 + 8);
      ctx.quadraticCurveTo(x + 4, s / 2 + 30, x - 2, s / 2 + 50 + Math.random() * 20);
      ctx.lineWidth = 2 + Math.random() * 3;
      ctx.strokeStyle = `rgba(${(color.r * 255) | 0},${(color.g * 255) | 0},${(color.b * 255) | 0},0.7)`;
      ctx.stroke();
    }
  });
}

export function splatTexture(hex) {
  const key = new THREE.Color(hex).getHex();
  let list = _splatCache.get(key);
  if (!list) {
    list = [makeSplat(hex), makeSplat(hex), makeSplat(hex)];
    _splatCache.set(key, list);
  }
  return list[(Math.random() * list.length) | 0];
}
