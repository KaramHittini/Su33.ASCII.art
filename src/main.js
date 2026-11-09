import './style.css';
import { AsciiRenderer } from './ascii.js';
import { Timeline } from './timeline.js';

const canvas = document.getElementById('c');
const ascii = new AsciiRenderer(canvas);
ascii.setSize(window.innerWidth, window.innerHeight);
const timeline = new Timeline(ascii);

window.addEventListener('resize', () => {
  ascii.setSize(window.innerWidth, window.innerHeight);
  timeline.resize();
});

// Lively Wallpaper settings hook (see wallpaper/LivelyProperties.json); harmless on the web.
window.livelyPropertyListener = (name, val) => {
  if (name === 'mono') ascii.material.uniforms.uColor.value = val ? 0 : 1;
};

function loop(now) {
  timeline.frame(now);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
