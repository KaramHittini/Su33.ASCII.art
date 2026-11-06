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

function loop(now) {
  timeline.frame(now);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
