import * as THREE from 'three';
import { HALF_LENGTH } from '../../config/constants';
import {
  GeoBuilder,
  loftInto,
  polySegs,
  capInto,
  prep,
  ringSamples,
  sectionSamples,
  walk,
  samplePoint,
  type ProfPt,
  type PSample,
  type YOff,
  STAND_A,
  STAND_B,
  STAND_R,
  CORE_A,
  CORE_B,
  BOARD_X,
  BOARD_Z,
  BENCH_SIDE,
  FACADE_D,
  ROOF_IN_D,
  ROOF,
} from './layout';
import { LED_ASPECT, LED_PANELS } from './textures';

export interface RowDef {
  samples: PSample[];
  closed: boolean;
  d: number;
  y: number;
  tier: number;
}

export interface StandBuild {
  opaque: THREE.BufferGeometry[];
  roof: THREE.BufferGeometry[];
  ledScroll: THREE.BufferGeometry[];
  ledStatic: THREE.BufferGeometry[];
  glow: THREE.BufferGeometry[];
  glass: THREE.BufferGeometry[];
  screens: THREE.BufferGeometry[];
  rows: RowDef[];
  flares: number[];
  roofHeights: { inLong: number; inEnd: number };
}

interface Tier {
  d0: number;
  rows: number;
  rd: number;
  rr: number;
  y0: number; // first tread height
}

const LOWER: Tier = { d0: 0, rows: 20, rd: 0.8, rr: 0.4, y0: 1.2 };
const MIDDLE: Tier = { d0: 12, rows: 14, rd: 0.85, rr: 0.5, y0: 14.2 };
const UPPER: Tier = { d0: 21, rows: 12, rd: 0.85, rr: 0.55, y0: 26.0 };

const tierBackD = (t: Tier) => t.d0 + t.rows * t.rd;
const tierTopY = (t: Tier) => t.y0 + t.rows * t.rr;

function stepPts(t: Tier): ProfPt[] {
  const pts: ProfPt[] = [];
  for (let i = 0; i < t.rows; i++) {
    const y = t.y0 + i * t.rr;
    pts.push({ d: t.d0 + i * t.rd, y });
    pts.push({ d: t.d0 + (i + 1) * t.rd, y });
  }
  pts.push({ d: tierBackD(t), y: tierTopY(t) });
  return pts;
}

function stepColors(t: Tier, seat: THREE.Color, seatDark: THREE.Color): THREE.Color[] {
  const c: THREE.Color[] = [];
  for (let i = 0; i < t.rows; i++) {
    c.push(seat, seatDark); // tread, riser
  }
  return c;
}

const C = (hex: THREE.ColorRepresentation) => new THREE.Color(hex);

export interface StandOptions {
  quality: 'low' | 'medium' | 'high';
  standColor: string;
  roofColor: string;
  homeColor: string;
  awayColor: string;
  roof: boolean;
  night: boolean;
  /** Grada alta en los laterales (no en los estadios pequeños). */
  upper?: boolean;
}

export function buildStands(o: StandOptions): StandBuild {
  const cornerSegs = o.quality === 'low' ? 6 : o.quality === 'medium' ? 10 : 14;
  const ring = ringSamples(cornerSegs);
  const longP = sectionSamples(0, cornerSegs);
  const longN = sectionSamples(4, cornerSegs);

  const seat = C(o.standColor);
  const seatHsl = { h: 0, s: 0, l: 0 };
  seat.getHSL(seatHsl);
  const seatLight = C(0).setHSL(seatHsl.h, Math.min(1, seatHsl.s * 1.1), Math.min(0.75, seatHsl.l * 1.25 + 0.04));
  const seatDark = seat.clone().multiplyScalar(0.55);
  const concrete = C(0x6e7177);
  const concreteDark = C(0x3c3f45);
  const wallDark = C(0x202328);
  const glassC = C(0x17222e);
  const soffit = C(0x5b5e64);
  const facade = C(o.standColor).lerp(C(0x2a2d33), 0.6);
  const roofC = C(o.roofColor);

  const opaque = new GeoBuilder();
  const glowB = new GeoBuilder();
  const roofB = new GeoBuilder();

  const dH = ROOF.inLong - ROOF.inEnd;
  const yOff: YOff = (s) => -dH * s.nx * s.nx;

  // ---- lower bowl (continuous)
  {
    const pts: ProfPt[] = [{ d: 0, y: 0 }, ...stepPts(LOWER)];
    const cols = [wallDark, ...stepColors(LOWER, seat, seatDark)];
    const segs = polySegs(pts, cols).slice(0, pts.length - 1); // open profile
    loftInto(opaque, ring, true, segs);
  }
  // ---- middle bowl (continuous, closed solid)
  const midBack = tierBackD(MIDDLE);
  const midTop = tierTopY(MIDDLE);
  const lowBack = tierBackD(LOWER);
  const lowTop = tierTopY(LOWER);
  {
    const pts: ProfPt[] = [
      { d: lowBack, y: lowTop },
      { d: lowBack, y: MIDDLE.y0 - 1.3 },
      { d: MIDDLE.d0, y: MIDDLE.y0 - 1.5 },
      { d: MIDDLE.d0, y: MIDDLE.y0 },
      ...stepPts(MIDDLE).slice(1),
      { d: midBack, y: lowTop },
    ];
    const cols = [glassC, soffit, wallDark, seat, ...stepColors(MIDDLE, seatLight, seatDark).slice(1), concreteDark, concreteDark];
    // stepPts(MIDDLE) starts with (d0, y0) which duplicates the fascia top -> sliced; first tread color = seat
    loftInto(opaque, ring, true, polySegs(pts, cols));
  }
  // ---- concourse floor + facade wall
  {
    loftInto(opaque, ring, true, [{ a: { d: midBack, y: midTop }, b: { d: FACADE_D, y: midTop }, color: concrete }]);
    const fTop = o.roof ? ROOF.outLong - 0.3 : 34;
    loftInto(opaque, ring, true, [{ a: { d: FACADE_D, y: midTop }, b: { d: FACADE_D, y: fTop, o: o.roof ? 1 : 0.4 }, color: facade }], yOff);
    // outer skin (only seen from aerial / replay cameras)
    const skin = C(o.roofColor).lerp(C(o.standColor), 0.35).multiplyScalar(0.8);
    loftInto(opaque, ring, true, [{ a: { d: FACADE_D + 0.35, y: fTop, o: o.roof ? 1 : 0.4 }, b: { d: FACADE_D + 0.35, y: 0 }, color: skin }], yOff);
  }
  // ---- upper tiers on both long sides (separate stands with end caps)
  const upBack = tierBackD(UPPER);
  const upTop = tierTopY(UPPER);
  const upper = o.upper !== false;
  if (upper) {
    const pts: ProfPt[] = [
      { d: midBack, y: midTop },
      { d: midBack, y: UPPER.y0 - 1.1 },
      { d: UPPER.d0, y: UPPER.y0 - 1.3 },
      { d: UPPER.d0, y: UPPER.y0 },
      ...stepPts(UPPER).slice(1),
      { d: upBack, y: midTop },
    ];
    const cols = [glassC, soffit, wallDark, seat, ...stepColors(UPPER, seat, seatDark).slice(1), concreteDark, concreteDark];
    for (const side of [longP, longN]) {
      loftInto(opaque, side, false, polySegs(pts, cols));
      capInto(opaque, side[0], pts, concreteDark);
      capInto(opaque, side[side.length - 1], pts, concreteDark);
    }
  }
  // ---- glow bands (hospitality glass) at night / sunset
  {
    const warm = C(0xffd9a8);
    const line = warm.clone().multiplyScalar(0.55);
        const gy1 = MIDDLE.y0 - 1.6;
    loftInto(glowB, ring, true, [
      { a: { d: lowBack - 0.04, y: gy1 - 0.25 }, b: { d: lowBack - 0.04, y: gy1 }, color: line },
    ]);
    for (const side of upper ? [longP, longN] : []) {
            const uy1 = UPPER.y0 - 1.4;
      loftInto(glowB, side, false, [
        { a: { d: midBack - 0.04, y: uy1 - 0.25 }, b: { d: midBack - 0.04, y: uy1 }, color: line },
      ]);
    }
  }

  // ---- roof (ring) or floodlight towers
  const flares: number[] = [];
  if (o.roof) {
    const r0: ProfPt = { d: ROOF_IN_D, y: ROOF.inLong - ROOF.thick, o: 1 };
    const r1: ProfPt = { d: ROOF_IN_D, y: ROOF.inLong, o: 1 };
    const r2: ProfPt = { d: FACADE_D + 0.4, y: ROOF.outLong, o: 1 };
    const r3: ProfPt = { d: FACADE_D + 0.4, y: ROOF.outLong - 0.9, o: 1 };
    loftInto(
      roofB,
      ring,
      true,
      polySegs([r0, r1, r2, r3], [roofC.clone().multiplyScalar(0.8), roofC, roofC.clone().multiplyScalar(0.65), roofC.clone().multiplyScalar(0.85)]),
      yOff,
    );
    // fascia light strip + floodlight flares
    loftInto(glowB, ring, true, [{ a: { d: ROOF_IN_D - 0.03, y: ROOF.inLong - 1.0, o: 1 }, b: { d: ROOF_IN_D - 0.03, y: ROOF.inLong - 0.7, o: 1 }, color: C(0xffffff) }], yOff);
    // roof underside ribs (structure)
    if (o.quality !== 'low') {
      const ribEvery = o.quality === 'high' ? 8 : 12;
      walk(ring, true, 0, ribEvery, (x, z, nx, nz) => {
        const s: PSample = { cx: x - nx * STAND_R, cz: z - nz * STAND_R, nx, nz, sec: 0 };
        const off = yOff(s);
        const [ax, az] = samplePoint(s, ROOF_IN_D + 0.3);
        const [bx, bz] = samplePoint(s, FACADE_D);
        const ya = ROOF.inLong - ROOF.thick + off - 0.6;
        const yb = ROOF.outLong - 0.9 + off - 0.6;
        const t: [number, number, number] = [-nz * 0.18, 0, nx * 0.18];
        const n1: [number, number, number] = [0, -1, 0];
        // a thin downward-facing truss blade
        roofB.quad([ax - t[0], ya - 1.4, az - t[2]], [ax + t[0], ya - 1.4, az + t[2]], [bx + t[0], yb - 0.6, bz + t[2]], [bx - t[0], yb - 0.6, bz - t[2]], n1, concrete);
        const nn: [number, number, number] = [-nz, 0, nx];
        roofB.quad([ax, ya - 1.4, az], [ax, ya, az], [bx, yb, bz], [bx, yb - 0.6, bz], nn, soffit);
        roofB.quad([ax, ya - 1.4, az], [ax, ya, az], [bx, yb, bz], [bx, yb - 0.6, bz], [nz, 0, -nx], soffit);
      });
    }
    walk(ring, true, ROOF_IN_D + 0.6, 7.5, (x, z, nx, nz) => {
      const s: PSample = { cx: x, cz: z, nx, nz, sec: 0 };
      flares.push(x - nx * 0.6, ROOF.inLong - 1.25 + yOff(s), z - nz * 0.6);
    });
  } else {
    for (let k = 0; k < 4; k++) {
      const sx = k === 0 || k === 1 ? 1 : -1;
      const sz = k === 0 || k === 3 ? 1 : -1;
      const nx = sx * Math.SQRT1_2;
      const nz = sz * Math.SQRT1_2;
      const rr = STAND_R + FACADE_D + 3;
      const x = sx * CORE_A + nx * rr;
      const z = sz * CORE_B + nz * rr;
      const h = 48;
      const mast = new THREE.CylinderGeometry(0.45, 0.9, h, 10);
      mast.translate(x, h / 2, z);
      const mg = prep(mast, 0x9aa0a8);
      appendGeo(opaque, mg);
      // head
      const head = new THREE.BoxGeometry(9, 5, 0.8);
      const ang = Math.atan2(-nx, -nz);
      head.rotateX(-0.45);
      head.rotateY(ang);
      head.translate(x - nx * 0.8, h + 1.5, z - nz * 0.8);
      appendGeo(opaque, prep(head, 0x3a3e45));
      // glowing lamp panel
      const panel = new THREE.PlaneGeometry(8.4, 4.4);
      panel.rotateX(-0.45);
      panel.rotateY(ang);
      panel.translate(x - nx * 1.25, h + 1.5 - 0.15, z - nz * 1.25);
      appendGeo(glowB, prep(panel, 0xffffff));
      for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j += 2) flares.push(x - nx * 1.6 + nz * i * 3, h + 1.5 + j * 1.2, z - nz * 1.6 - nx * i * 3);
    }
  }

  // ---- surrounding ground (plaza / parkland), only seen from aerial cameras
  {
    const ground = new THREE.RingGeometry(70, 700, 72, 1);
    ground.rotateX(-Math.PI / 2);
    ground.translate(0, -0.03, 0);
    appendGeo(opaque, prep(ground, 0x46503f));
  }

  // ---- ad boards (frames in opaque, LED faces separately)
  const ledScroll = new GeoBuilder();
  const ledStatic = new GeoBuilder();
  const panelLen = 0.82 * LED_ASPECT;
  const boardRun = (x0: number, z0: number, x1: number, z1: number, inward: [number, number], target: GeoBuilder, uStart: number) => {
    // run direction must point to the viewer's right so the ads read correctly
    if ((x1 - x0) * inward[1] - (z1 - z0) * inward[0] < 0) {
      [x0, x1] = [x1, x0];
      [z0, z1] = [z1, z0];
    }
    const dx = x1 - x0;
    const dz = z1 - z0;
    const len = Math.hypot(dx, dz);
    const tx = dx / len;
    const tz = dz / len;
    const [ix, iz] = inward;
    const th = 0.28;
    const h = 1.0;
    // box frame (front face slightly inset, back, top)
    const p = (a: number, t: number, y: number): [number, number, number] => [x0 + tx * a + ix * t, y, z0 + tz * a + iz * t];
    const frame = C(0x1a1c20);
    opaque.quad(p(0, -th, 0), p(len, -th, 0), p(len, -th, h), p(0, -th, h), [-ix, 0, -iz], C(0x2a2d33));
    opaque.quad(p(0, -th, h), p(len, -th, h), p(len, 0.02, h), p(0, 0.02, h), [0, 1, 0], frame);
    opaque.quad(p(0, 0.02, 0), p(len, 0.02, 0), p(len, 0.02, 0.06), p(0, 0.02, 0.06), [ix, 0, iz], frame);
    opaque.quad(p(0, 0.02, 0.94), p(len, 0.02, 0.94), p(len, 0.02, h), p(0, 0.02, h), [ix, 0, iz], frame);
    for (const a of [0, len]) opaque.quad(p(a, -th, 0), p(a, 0.02, 0), p(a, 0.02, h), p(a, -th, h), a === 0 ? [-tx, 0, -tz] : [tx, 0, tz], frame);
    const u0 = uStart / panelLen;
    const u1 = (uStart + len) / panelLen;
    target.quad(p(0, 0.03, 0.08), p(len, 0.03, 0.08), p(len, 0.03, 0.92), p(0, 0.03, 0.92), [ix, 0, iz], C(0xffffff), [
      [u0, 0],
      [u1, 0],
      [u1, 1],
      [u0, 1],
    ]);
  };
  const LX = HALF_LENGTH + 3.5;
  const animate = o.quality !== 'low';
  const sideT = animate ? ledScroll : ledStatic;
  // near side (+z)
  boardRun(-LX, BOARD_Z, LX, BOARD_Z, [0, -1], sideT, 0);
  // bench side (-z) with a gap for dugouts & tunnel
  const BZ = BENCH_SIDE * BOARD_Z;
  boardRun(LX, BZ, 17, BZ, [0, 1], sideT, 3);
  boardRun(-17, BZ, -LX, BZ, [0, 1], sideT, 11);
  // ends
  boardRun(BOARD_X, BOARD_Z - 6, BOARD_X, -(BOARD_Z - 6), [-1, 0], ledStatic, 1.5);
  boardRun(-BOARD_X, -(BOARD_Z - 6), -BOARD_X, BOARD_Z - 6, [1, 0], ledStatic, 4.5);
  // corner angled boards
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const a: [number, number] = [sx * (LX + 0.3), sz * BOARD_Z];
      const b: [number, number] = [sx * BOARD_X, sz * (BOARD_Z - 5.4)];
      const inward: [number, number] = [-sx * Math.SQRT1_2, -sz * Math.SQRT1_2];
      const first = sx * sz > 0 ? b : a;
      const second = sx * sz > 0 ? a : b;
      boardRun(first[0], first[1], second[0], second[1], inward, ledStatic, 2);
    }
  }
  // LED ribbons on tier fascias (scrolling)
  const ribbonT = animate ? ledScroll : ledStatic;
  loftInto(ribbonT, ring, true, [{ a: { d: MIDDLE.d0 - 0.03, y: MIDDLE.y0 - 1.42 }, b: { d: MIDDLE.d0 - 0.03, y: MIDDLE.y0 - 0.08 }, color: C(0xffffff) }], undefined, -1.34 * LED_ASPECT);
  for (const side of [longP, longN]) {
    loftInto(ribbonT, side, false, [{ a: { d: UPPER.d0 - 0.03, y: UPPER.y0 - 1.22 }, b: { d: UPPER.d0 - 0.03, y: UPPER.y0 - 0.08 }, color: C(0xffffff) }], undefined, -1.14 * LED_ASPECT);
  }

  // ---- dugouts, tunnel, technical area
  const glassB = new GeoBuilder();
  const zWall = BENCH_SIDE * STAND_B;
  const inZ = -BENCH_SIDE; // direction towards pitch
  const teamCols = [o.homeColor, o.awayColor];
  [-1, 1].forEach((sx, ti) => {
    const cx = sx * 10;
    const L = 9;
    const depth = 2.3;
    const slab = new THREE.BoxGeometry(L + 0.4, 0.18, depth + 0.2);
    slab.translate(cx, 0.09, zWall + inZ * (depth / 2));
    appendGeo(opaque, prep(slab, 0x2b2e34));
    const back = new THREE.BoxGeometry(L + 0.4, 2.5, 0.25);
    back.translate(cx, 1.25, zWall + inZ * 0.12);
    appendGeo(opaque, prep(back, 0x24272c));
    for (let i = 0; i < 12; i++) {
      const sx2 = cx - L / 2 + 0.45 + i * ((L - 0.9) / 11);
      const seatG = new THREE.BoxGeometry(0.5, 0.12, 0.5);
      seatG.translate(sx2, 0.5, zWall + inZ * 0.75);
      appendGeo(opaque, prep(seatG, teamCols[ti]));
      const backG = new THREE.BoxGeometry(0.5, 0.75, 0.1);
      backG.translate(sx2, 0.9, zWall + inZ * 0.5);
      appendGeo(opaque, prep(backG, teamCols[ti]));
    }
    // canopy (quarter cylinder) in clear plexiglass + end panels
    const r = 2.45;
    const can = new THREE.CylinderGeometry(r, r, L, 20, 1, true, 0.33, Math.PI / 2 - 0.33);
    can.rotateZ(Math.PI / 2);
    if (inZ < 0) can.rotateY(Math.PI);
    can.translate(cx, 0.1, zWall);
    appendGeo(glassB, prep(can, 0xffffff));
    for (const e of [-1, 1]) {
      const sideG = new THREE.CircleGeometry(r, 12, 0.33, Math.PI / 2 - 0.33);
      // circle in XY: angle from +x toward +y; map x->towards pitch (z), y->up
      sideG.rotateY(-Math.PI / 2 * inZ);
      sideG.translate(cx + e * (L / 2), 0.1, zWall);
      appendGeo(glassB, prep(sideG, 0xffffff));
    }
    // canopy frame rail
    const rail = new THREE.BoxGeometry(L, 0.08, 0.08);
    rail.translate(cx, 0.1 + r * Math.sin(0.33), zWall + inZ * r * Math.cos(0.33));
    appendGeo(opaque, prep(rail, 0xd0d4da));
  });
  {
    // telescopic tunnel
    const tl = 5;
    const tun = new THREE.CylinderGeometry(1.8, 1.8, tl, 18, 1, true, Math.PI / 2, Math.PI);
    tun.rotateX(Math.PI / 2);
    tun.translate(0, 0, zWall + inZ * (tl / 2));
    appendGeo(opaque, prep(tun, 0x2d3138));
    for (let i = 0; i <= 3; i++) {
      const ribG = new THREE.TorusGeometry(1.83, 0.06, 4, 18, Math.PI);
      ribG.translate(0, 0, zWall + inZ * (0.3 + i * ((tl - 0.6) / 3)));
      appendGeo(opaque, prep(ribG, i % 3 === 0 ? 0xe8e8e8 : 0x8a9099));
    }
    const mouth = new THREE.CircleGeometry(1.78, 18, 0, Math.PI);
    if (inZ < 0) mouth.rotateY(Math.PI);
    mouth.translate(0, 0.0, zWall + inZ * (tl - 0.05));
    appendGeo(opaque, prep(mouth, 0x050608));
    // fourth official table
    const table = new THREE.BoxGeometry(2.2, 0.9, 0.8);
    table.translate(0, 0.45, zWall + inZ * 6.2);
    appendGeo(opaque, prep(table, 0x30343b));
    const top = new THREE.BoxGeometry(2.3, 0.05, 0.9);
    top.translate(0, 0.92, zWall + inZ * 6.2);
    appendGeo(opaque, prep(top, 0xdedede));
  }

  // ---- video screens on the end stands
  const screenB = new GeoBuilder();
  const screens: THREE.BufferGeometry[] = [];
  {
    const sw = 24;
    const sh = 8;
    const yC = o.roof ? (midTop + ROOF.outEnd - 1.5) / 2 + 0.3 : midTop + 1 + sh / 2;
    for (const sx of [-1, 1]) {
      const x = sx * (STAND_A + FACADE_D - 1.2);
      const frame = new THREE.BoxGeometry(1.0, sh + 0.8, sw + 0.8);
      frame.translate(x + sx * 0.55, yC, 0);
      appendGeo(opaque, prep(frame, 0x15171b));
      screenB.quad([x, yC - sh / 2, -sx * sw / 2], [x, yC - sh / 2, sx * sw / 2], [x, yC + sh / 2, sx * sw / 2], [x, yC + sh / 2, -sx * sw / 2], [-sx, 0, 0], C(0xffffff), [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 1],
      ]);
    }
  }
  screens.push(screenB.geometry({ color: false, uv: true }));

  // ---- seat rows for the crowd
  const rows: RowDef[] = [];
  const addRows = (t: Tier, samples: PSample[], closed: boolean, tier: number) => {
    for (let i = 0; i < t.rows; i++) rows.push({ samples, closed, d: t.d0 + i * t.rd + t.rd * 0.5, y: t.y0 + i * t.rr, tier });
  };
  addRows(LOWER, ring, true, 0);
  addRows(MIDDLE, ring, true, 1);
  if (upper) {
    addRows(UPPER, longP, false, 2);
    addRows(UPPER, longN, false, 2);
  }

  return {
    opaque: [opaque.geometry()],
    roof: roofB.empty ? [] : [roofB.geometry()],
    ledScroll: ledScroll.empty ? [] : [ledScroll.geometry({ color: false, uv: true })],
    ledStatic: ledStatic.empty ? [] : [ledStatic.geometry({ color: false, uv: true })],
    glow: glowB.empty ? [] : [glowB.geometry()],
    glass: glassB.empty ? [] : [glassB.geometry()],
    screens,
    rows,
    flares,
    roofHeights: { inLong: ROOF.inLong, inEnd: ROOF.inEnd },
  };
}

/** Append a prepared (non-indexed, position/normal/color) geometry into a builder. */
export function appendGeo(gb: GeoBuilder, g: THREE.BufferGeometry) {
  const p = g.getAttribute('position').array;
  const n = g.getAttribute('normal').array;
  const c = g.getAttribute('color').array;
  for (let i = 0; i < p.length; i++) {
    gb.pos.push(p[i]);
    gb.nor.push(n[i]);
    gb.col.push(c[i]);
  }
  const vc = p.length / 3;
  for (let i = 0; i < vc; i++) gb.uv.push(0, 0);
  g.dispose();
}

export const LED_U_PANEL = 1 / LED_PANELS;
