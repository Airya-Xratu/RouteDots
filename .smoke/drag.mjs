import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

const bundle = readFileSync('dist/routedots.browser.global.js', 'utf8');
const dom = new JSDOM('<!doctype html><div id="map" style="width:1280px;height:800px"></div>', {
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  beforeParse(window) {
    window.Path2D = class { addPath() {} moveTo() {} lineTo() {} closePath() {} arc() {} rect() {} };
    window.HTMLCanvasElement.prototype.getContext = function (type) {
      if (type !== '2d') return null;
      const noop = () => {};
      const target = { canvas: this, clearRect: noop, fillRect: noop, beginPath: noop, arc: noop, fill: noop, stroke: noop, save: noop, restore: noop, translate: noop, scale: noop, drawImage: noop, measureText: () => ({ width: 10 }), getImageData: () => ({ data: new Uint8Array(4) }), createLinearGradient: () => ({ addColorStop: noop }) };
      return new Proxy(target, { get: (o, k) => (k in o ? o[k] : typeof k === 'string' && /^[a-z]/.test(k) ? noop : undefined), set: (o, k, v) => ((o[k] = v), true) });
    };
  },
});
const scriptEl = dom.window.document.createElement('script');
scriptEl.textContent = bundle;
dom.window.document.head.appendChild(scriptEl);

const { window } = dom;
const { RouteDots } = window.RouteDots;
const el = window.document.getElementById('map');
const rd = new RouteDots(el, { world: 'flat', camera3d: { enabled: true, interactive: true } });
await new Promise((r) => setTimeout(r, 120));
console.log('before:', JSON.stringify(rd.getCamera3D()));

const fire = (type, x, y) => {
  const event = new window.MouseEvent(type, { bubbles: true, clientX: x, clientY: y, buttons: 1 });
  el.dispatchEvent(event);
  return event;
};
fire('pointerdown', 640, 400);
for (let i = 1; i <= 6; i++) fire('pointermove', 640 + i * 10, 400 + i * 5);
fire('pointerup', 700, 430);
console.log('after drag:', JSON.stringify(rd.getCamera3D()));
console.log('map camera:', JSON.stringify(rd.getFlatMap().camera3d));
