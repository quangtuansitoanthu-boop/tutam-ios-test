import type { KeoCoinFace } from '$lib/domain/practice/divination';

export type CoinFaces = readonly [KeoCoinFace, KeoCoinFace];

export interface CoinPalette {
  glint: string;
  gold: string;
  amber: string;
  copper: string;
  brown: string;
  rim: string;
}

export const ARTWORK_WIDTH = 350;
export const ARTWORK_HEIGHT = 234;
const pi = Math.PI;
const ground = 216;
const tilt = 73 * pi / 180;
const stickLength = 106;
const shakeTime = 1120;
const slideTime = 470;
const fallTime = 490;
const settleTime = 145;
export const STICK_MOTION_MS = shakeTime + slideTime + fallTime + settleTime;
export const COIN_MOTION_MS = 1080;

export function createQuanAmPainter(pen: CanvasRenderingContext2D, palette: CoinPalette) {
  // Dùng arcTo để tương thích với WebView iOS chưa có Canvas roundRect.
  function roundedRect(x: number, y: number, width: number, height: number, radius: number): void {
    pen.moveTo(x + radius, y);
    pen.arcTo(x + width, y, x + width, y + height, radius);
    pen.arcTo(x + width, y + height, x, y + height, radius);
    pen.arcTo(x, y + height, x, y, radius);
    pen.arcTo(x, y, x + width, y, radius);
    pen.closePath();
  }

  function blend(x: number, y: number, t: number) { return x + (y - x) * t; }
  function unit(t: number) { return Math.max(0, Math.min(1, t)); }
  function ease(t: number) { return t * t * (3 - 2 * t); }

  function oval(x: number, y: number, rx: number, ry: number, paint: string | CanvasGradient) {
    pen.beginPath();
    pen.ellipse(x, y, rx, ry, 0, 0, pi * 2);
    pen.fillStyle = paint;
    pen.fill();
  }

  function shadow(x: number, y: number, width: number, height: number, opacity: number) {
    pen.save();
    pen.translate(x, y);
    pen.scale(1, height / width);
    const shade = pen.createRadialGradient(0, 0, 0, 0, 0, width);
    shade.addColorStop(0, 'rgba(60,31,11,' + opacity + ')');
    shade.addColorStop(1, 'rgba(60,31,11,0)');
    oval(0, 0, width, width, shade);
    pen.restore();
  }

  function stick(x: number, y: number, angle: number, length: number, width: number, number?: number) {
    pen.save();
    pen.translate(x, y);
    pen.rotate(angle);
    const wood = pen.createLinearGradient(-width / 2, 0, width / 2, 0);
    wood.addColorStop(0, '#a67745');
    wood.addColorStop(.18, '#ebc58a');
    wood.addColorStop(.45, '#f7dea8');
    wood.addColorStop(.85, '#d1a068');
    wood.addColorStop(1, '#9a6538');
    pen.beginPath();
    roundedRect(-width / 2, -length / 2, width, length, width * .23);
    pen.fillStyle = wood;
    pen.fill();
    pen.save();
    pen.clip();
    const red = pen.createLinearGradient(-width / 2, 0, width / 2, 0);
    red.addColorStop(0, '#6c231c');
    red.addColorStop(.42, '#b84f36');
    red.addColorStop(1, '#782a21');
    pen.fillStyle = red;
    pen.fillRect(-width / 2, -length / 2, width, 10);
    pen.strokeStyle = 'rgba(121,69,24,.25)';
    pen.lineWidth = .6;
    for (const dx of [-2.8, .5, 2.2]) {
      pen.beginPath();
      pen.moveTo(dx, -length / 2 + 14);
      pen.quadraticCurveTo(dx + .9, 0, dx - .6, length / 2 - 3);
      pen.stroke();
    }
    pen.restore();
    if (number !== undefined) {
      pen.translate(0, -length / 2 + 22);
      pen.rotate(-pi / 2);
      pen.font = '700 10px system-ui, sans-serif';
      pen.textAlign = 'center';
      pen.textBaseline = 'middle';
      pen.fillStyle = '#452917';
      pen.fillText(String(number), 0, 0);
    }
    pen.restore();
  }

  function bambooBody() {
    pen.beginPath();
    pen.moveTo(-42, -55);
    pen.quadraticCurveTo(0, -28, 42, -55);
    pen.bezierCurveTo(42, -14, 39, 39, 37, 58);
    pen.bezierCurveTo(32, 73, -31, 73, -37, 58);
    pen.bezierCurveTo(-40, 30, -42, -16, -42, -55);
    pen.closePath();
    const wood = pen.createLinearGradient(-43, 0, 43, 0);
    wood.addColorStop(0, '#654120');
    wood.addColorStop(.14, '#a16b36');
    wood.addColorStop(.35, '#d8a95e');
    wood.addColorStop(.51, '#e6b972');
    wood.addColorStop(.71, '#bd8646');
    wood.addColorStop(.91, '#8c5129');
    wood.addColorStop(1, '#63381d');
    pen.fillStyle = wood;
    pen.fill();
    pen.save();
    pen.clip();
    for (let i = 0; i < 70; i++) {
      const x = -42 + (Math.sin(i * 51.71) * .5 + .5) * 84;
      const bend = Math.cos(i * .83) * 4;
      const alpha = .04 + (Math.sin(i * 4.7) * .5 + .5) * .15;
      pen.strokeStyle = i % 4 === 0 ? 'rgba(255,223,152,' + alpha + ')' : 'rgba(82,36,14,' + alpha + ')';
      pen.lineWidth = i % 6 === 0 ? 1.6 : .55;
      pen.beginPath();
      pen.moveTo(x, -57);
      pen.bezierCurveTo(x + bend, -26, x - bend, 24, x * .88, 67);
      pen.stroke();
    }
    const foot = pen.createLinearGradient(0, 53, 0, 70);
    foot.addColorStop(0, 'rgba(79,37,15,0)');
    foot.addColorStop(1, 'rgba(79,37,15,.72)');
    pen.fillStyle = foot;
    pen.fillRect(-42, 52, 84, 20);
    pen.restore();
    pen.strokeStyle = '#704623';
    pen.lineWidth = 1.15;
    pen.stroke();
    for (const y of [-52, 48]) {
      pen.beginPath();
      pen.moveTo(-41, y);
      pen.quadraticCurveTo(0, y + 24, 41, y);
      pen.lineWidth = y < 0 ? 4 : 2.2;
      pen.strokeStyle = y < 0 ? '#d2a26b' : '#a06a37';
      pen.stroke();
      pen.lineWidth = 1;
      pen.strokeStyle = '#f2ca88';
      pen.stroke();
    }
    const lacquer = pen.createLinearGradient(-36, 0, 36, 0);
    lacquer.addColorStop(0, '#662d25');
    lacquer.addColorStop(.48, '#8a4033');
    lacquer.addColorStop(1, '#663023');
    pen.beginPath();
    roundedRect(-36, -20, 72, 55, 5);
    pen.fillStyle = lacquer;
    pen.fill();
    pen.lineWidth = 1.15;
    pen.strokeStyle = '#edc68a';
    pen.stroke();
    pen.font = '700 12.5px system-ui, sans-serif';
    pen.textAlign = 'center';
    pen.textBaseline = 'middle';
    pen.fillStyle = '#ffe7b8';
    pen.fillText('QUAN ÂM', 0, 0);
    pen.fillText('LINH XĂM', 0, 15);
  }

  function rotatePoint(x: number, y: number, angle: number) {
    return { x: x * Math.cos(angle) - y * Math.sin(angle), y: x * Math.sin(angle) + y * Math.cos(angle) };
  }

  function drawTube(ms: number, number: number | null) {
    const top = blend(168, 126, ease(unit((ms - 450) / 640)));
    const base = 147;
    const slide = unit((ms - shakeTime) / slideTime);
    const departure = shakeTime + slideTime;
    const xInside = 18;
    const endInside = -113;
    const leaving = ms >= departure;
    const lean = ms < shakeTime
      ? Math.sin(ms * .018) * Math.sin(pi * ms / shakeTime) * .22
      : tilt * ease(unit(slide / .76)) * (1 - ease(unit((ms - departure) / 520)));
    const lift = ms < shakeTime ? -Math.abs(Math.sin(ms * .016) * Math.sin(pi * ms / shakeTime)) * 5 : 0;
    shadow(top, ground + 2, 66, 9, .27);
    pen.save();
    pen.translate(top, base + lift);
    pen.rotate(lean);
    oval(0, -55, 42, 12.5, '#c49155');
    oval(0, -55, 38.5, 8.8, '#44291b');
    const cluster = [[-29,-49,-.18,98,8],[-22,-57,-.12,104,9],[-14,-48,-.07,106,8],
      [-8,-56,-.08,115,9],[2,-52,.035,104,9],[8,-54,.11,109,8],
      [23,-44,.15,97,7],[29,-46,.17,90,8]];
    for (const [i, chip] of cluster.entries()) {
      const [x, y, angle, length, width] = chip;
      const bob = ms < shakeTime ? Math.sin(ms * .024 + i * .73) * Math.sin(pi * ms / shakeTime) * 3.5 : 0;
      stick(x, y + bob, angle, length, width);
    }
    if (!leaving) {
      stick(xInside, blend(-45, endInside, ease(slide)), 0, stickLength, 9.5, slide > .12 ? number ?? undefined : undefined);
    }
    bambooBody();
    pen.restore();

    if (leaving) {
      const start = rotatePoint(xInside, endInside, tilt);
      const air = unit((ms - departure) / fallTime);
      const land = unit((ms - departure - fallTime) / settleTime);
      const impactAngle = 107 * pi / 180;
      const angle = land ? blend(impactAngle, pi / 2, ease(land)) : blend(tilt, impactAngle, air);
      const halfDepth = (theta: number) => Math.abs(Math.cos(theta)) * stickLength / 2 + Math.abs(Math.sin(theta)) * 4.75;
      const y0 = base + start.y;
      const impact = ground - halfDepth(impactAngle);
      const x = top + start.x + 21 * air + 3 * land;
      const y = land ? ground - halfDepth(angle) - Math.sin(pi * land) * 2
        : y0 - air * 5 + (impact - y0 + 5) * air * air;
      shadow(x, ground + 2, blend(37, 55, air), 5, blend(.08, .32, air));
      stick(x, y, angle, stickLength, 9.5, number ?? undefined);
    }
  }

  function coinGradient(stops: readonly (readonly [number, string])[]): CanvasGradient {
    const gradient = pen.createLinearGradient(-35, -35, 25, 42);
    for (const [position, color] of stops) gradient.addColorStop(position, color);
    return gradient;
  }

  function coinStroke(color: string | CanvasGradient, width: number, opacity: number): void {
    pen.globalAlpha = opacity;
    pen.strokeStyle = color;
    pen.lineWidth = width;
    pen.stroke();
    pen.globalAlpha = 1;
  }

  function coinDisc(): void {
    pen.beginPath();
    pen.ellipse(0, 0, 44, 44, 0, 0, pi * 2);
    pen.rect(-9.5, -9.5, 19, 19);
  }

  function engraveCoin(): void {
    pen.lineCap = 'round';
    pen.lineJoin = 'round';
    for (let turn = 0; turn < 4; turn++) {
      pen.save();
      pen.rotate(turn * pi / 2);
      pen.beginPath();
      pen.moveTo(-7, -27);
      pen.lineTo(4, -27);
      pen.quadraticCurveTo(8, -27, 8, -23.5);
      pen.quadraticCurveTo(8, -20, 4.5, -20);
      pen.lineTo(-3, -20);
      pen.quadraticCurveTo(-6, -20, -6, -17.5);
      coinStroke(palette.rim, 2.6, .45);
      coinStroke(palette.glint, 1.6, .56);
      pen.restore();
    }
  }

  function coin(x: number, y: number, turn: number, scaleY: number, isBack: boolean): void {
    pen.save();
    pen.translate(x, y + 3);
    pen.scale(1, scaleY);
    pen.rotate(turn);
    coinDisc();
    pen.fillStyle = coinGradient([[0, palette.copper], [.67, palette.brown], [1, palette.rim]]);
    pen.fill('evenodd');
    coinStroke(palette.rim, 1.35, .85);
    pen.restore();

    pen.save();
    pen.translate(x, y);
    pen.scale(1, scaleY);
    pen.rotate(turn);
    coinDisc();
    pen.fillStyle = coinGradient(isBack
      ? [[0, palette.amber], [.36, palette.copper], [1, palette.brown]]
      : [[0, palette.glint], [.35, palette.gold], [.68, palette.amber], [1, palette.copper]]);
    pen.fill('evenodd');
    coinStroke(palette.rim, 1.7, .89);
    pen.beginPath();
    pen.ellipse(0, 0, 39.5, 39.5, 0, 0, pi * 2);
    coinStroke(coinGradient([[0, palette.glint], [.53, palette.gold], [1, palette.amber]]), 1.95, .86);
    pen.beginPath();
    pen.ellipse(0, 0, 33.5, 33.5, 0, 0, pi * 2);
    coinStroke(palette.rim, 1.05, isBack ? .48 : .37);
    if (!isBack) engraveCoin();
    pen.beginPath();
    pen.rect(-12.6, -12.6, 25.2, 25.2);
    coinStroke(isBack ? palette.amber : palette.glint, 1.15, .7);
    pen.restore();
  }

  function drawCoins(ms: number, faces: CoinFaces, landing: CoinFaces | undefined): void {
    for (let index = 0; index < 2; index++) {
      const t = landing ? unit((ms - index * 92) / 900) : 0;
      const start = faces[index] === 'sap' ? pi : 0;
      const flips = landing && faces[index] !== landing[index] ? 5 : 4;
      const axis = Math.cos(start + flips * pi * t);
      const direction = index === 0 ? -1 : 1;
      const x = 175 + direction * (73 + 5 * Math.sin(pi * t));
      const air = 4 * t * (1 - t);
      const turn = -direction * (.42 + .13 * Math.sin(pi * t));
      const y = 144 - 56.5 * air;
      const scaleY = .72 * Math.max(.055, Math.abs(axis));
      pen.save();
      pen.translate(x, 177);
      pen.scale(1, .23);
      const shade = pen.createRadialGradient(0, 0, 0, 0, 0, 47);
      shade.addColorStop(0, palette.rim + '59');
      shade.addColorStop(.55, palette.rim + '2d');
      shade.addColorStop(1, palette.rim + '00');
      pen.globalAlpha = 1 - air * .52;
      oval(0, 0, 47, 47, shade);
      pen.restore();
      coin(x, y, turn, scaleY, axis < 0);
    }
  }

  return { drawTube, drawCoins };
}
