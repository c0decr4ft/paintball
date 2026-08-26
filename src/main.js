import "./style.css";
import { Game } from "./game.js";

const canvas = document.getElementById("c");
let game;

try {
  game = new Game(canvas);
} catch (err) {
  console.error(err);
  const menu = document.getElementById("menu");
  if (menu) {
    menu.hidden = false;
    const tag = menu.querySelector(".tag");
    if (tag) tag.textContent = `Load error: ${err.message}. Refresh the page.`;
  }
}

function loop() {
  if (game) game.tick();
  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);
