import "./style.css";
import { Game } from "./game.js";

const canvas = document.getElementById("c");
let game;

function showLoadError(err) {
  console.error(err);
  const menu = document.getElementById("menu");
  if (!menu) return;
  menu.hidden = false;
  const tag = menu.querySelector(".tag");
  if (tag) tag.textContent = `Load error: ${err.message}. Refresh the page.`;
  const play = document.getElementById("play");
  if (play) play.disabled = true;
  const eventBtn = document.getElementById("event");
  if (eventBtn) eventBtn.disabled = true;
  const bombBtn = document.getElementById("bomb");
  if (bombBtn) bombBtn.disabled = true;
}

try {
  game = new Game(canvas);
  if (import.meta.env.DEV) window.game = game;
  game.init().catch(showLoadError);
} catch (err) {
  showLoadError(err);
}

function loop() {
  if (game) game.tick();
  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);
