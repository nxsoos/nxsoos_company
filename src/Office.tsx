import { useEffect, useRef, useState } from 'react';
import { Application, Container, Graphics, Text, type Ticker } from 'pixi.js';
import { ZoomIn, ZoomOut, LocateFixed, Pause, Play } from 'lucide-react';
import { employees, type Task, type Project, type Role } from '../shared/types';
import { isAgentWorking, isExecuting } from '../shared/agent-status';
import type { OfficeInstance } from '../shared/companion';
import { idleBreak } from './office-breaks';

const ink = 0x243b35;
const gold = 0xd9b676;
const color = (s: string) => parseInt(s.replace('#', ''), 16);
function rect(g: Graphics, x: number, y: number, w: number, h: number, c: number, a = 1) {
  g.rect(Math.round(x), Math.round(y), w, h).fill({ color: c, alpha: a });
}
function label(parent: Container, text: string, x: number, y: number, size = 11, fill = 0xe2e9d9) {
  const t = new Text({
    text,
    style: { fontFamily: 'monospace', fontSize: size, fill, letterSpacing: 1 },
  });
  t.position.set(x, y);
  parent.addChild(t);
  return t;
}
function plant(g: Graphics, x: number, y: number, large = false) {
  const s = large ? 1.5 : 1;
  rect(g, x - 6 * s, y, 12 * s, 10 * s, 0x8a614c);
  rect(g, x - 8 * s, y, 16 * s, 3 * s, 0xb78a65);
  rect(g, x - 2 * s, y - 17 * s, 4 * s, 19 * s, 0x466b45);
  rect(g, x - 11 * s, y - 15 * s, 9 * s, 9 * s, 0x638557);
  rect(g, x + 1 * s, y - 22 * s, 10 * s, 9 * s, 0x89a76a);
  rect(g, x - 8 * s, y - 25 * s, 9 * s, 9 * s, 0x76975e);
}
function desk(g: Graphics, x: number, y: number, accent: number) {
  rect(g, x - 4, y + 9, 90, 36, 0x0b1918, 0.2);
  rect(g, x, y, 80, 35, 0x634e3c);
  rect(g, x, y, 80, 28, 0xc29b73);
  rect(g, x + 3, y + 2, 74, 3, 0xd1b18a);
  rect(g, x + 4, y + 34, 6, 12, 0x5b4736);
  rect(g, x + 70, y + 34, 6, 12, 0x5b4736);
  rect(g, x + 24, y - 15, 34, 25, 0x283d3c);
  rect(g, x + 27, y - 12, 28, 18, 0x4f6c65);
  rect(g, x + 30, y - 9, 19, 2, accent);
  rect(g, x + 30, y - 4, 13, 2, 0xa1bfa1);
  rect(g, x + 38, y + 10, 6, 5, 0x263c36);
  rect(g, x + 26, y + 18, 29, 5, 0xd3c9b5);
  rect(g, x + 6, y + 7, 10, 13, 0xe6ddc4);
  rect(g, x + 8, y + 9, 6, 2, accent);
  rect(g, x + 66, y + 8, 7, 8, 0xf4e6bf);
  rect(g, x + 73, y + 10, 3, 4, 0xd3ba8c);
  rect(g, x + 29, y + 40, 23, 19, 0x344a45);
  rect(g, x + 25, y + 45, 31, 8, 0x496159);
}
function shelves(g: Graphics, x: number, y: number, w = 110) {
  rect(g, x, y, w, 45, 0x564b39);
  for (let row = 0; row < 2; row++) {
    rect(g, x + 3, y + row * 21 + 2, w - 6, 18, 0x333c30);
    for (let i = 0; i < Math.floor(w / 9) - 1; i++) {
      const h = 11 + ((i * 7) % 6);
      rect(
        g,
        x + 6 + i * 9,
        y + row * 21 + 20 - h,
        6,
        h,
        [0xa98364, 0x81997c, 0xd1b580, 0x7d9c9b, 0xae8b89][i % 5],
      );
    }
  }
  rect(g, x, y + 42, w, 4, 0x927351);
}
function couch(g: Graphics, x: number, y: number, c = 0x678476) {
  rect(g, x + 4, y + 5, 92, 33, 0x12251f, 0.3);
  rect(g, x, y, 92, 28, c);
  rect(g, x + 4, y - 8, 84, 17, c);
  rect(g, x + 7, y + 5, 36, 17, 0x839783);
  rect(g, x + 47, y + 5, 36, 17, 0x839783);
  rect(g, x - 4, y, 10, 30, c);
  rect(g, x + 86, y, 10, 30, c);
  rect(g, x + 5, y + 28, 6, 6, 0x5c4b38);
  rect(g, x + 80, y + 28, 6, 6, 0x5c4b38);
}
function character(accent: number, index: number) {
  const container = new Container();
  const shadow = new Graphics();
  rect(shadow, -11, 18, 24, 6, 0x08170f, 0.3);
  container.addChild(shadow);
  const leftLeg = new Graphics(),
    rightLeg = new Graphics();
  rect(leftLeg, -6, 10, 5, 10, 0x34434b);
  rect(leftLeg, -7, 19, 7, 3, 0x202e29);
  rect(rightLeg, 2, 10, 5, 10, 0x34434b);
  rect(rightLeg, 2, 19, 7, 3, 0x202e29);
  container.addChild(leftLeg, rightLeg);
  const body = new Graphics();
  rect(body, -8, -1, 16, 15, accent);
  rect(body, -6, 0, 3, 13, 0xffffff, 0.1);
  rect(body, -5, -12, 12, 13, 0xd8b596);
  const hair = [0x594536, 0x483f36, 0x5c3548, 0x353d43, 0x77624d][index] ?? 0x594536;
  rect(body, -7, -17, 15, 7, hair);
  rect(body, -8, -12, 4, 8, hair);
  rect(body, -3, -8, 2, 2, ink);
  rect(body, 4, -8, 2, 2, ink);
  rect(body, -2, -2, 5, 2, 0xb58268);
  if (index === 0) {
    rect(body, -4, -8, 5, 4, 0x3c443b);
    rect(body, 3, -8, 5, 4, 0x3c443b);
  }
  container.addChild(body);
  const leftArm = new Graphics(),
    rightArm = new Graphics();
  rect(leftArm, -11, 2, 4, 10, accent);
  rect(leftArm, -11, 11, 4, 4, 0xcba88b);
  rect(rightArm, 8, 2, 4, 10, accent);
  rect(rightArm, 8, 11, 4, 4, 0xcba88b);
  container.addChild(leftArm, rightArm);
  const cup = new Graphics();
  rect(cup, 10, 9, 7, 8, 0xe8e4cb);
  rect(cup, 16, 10, 3, 4, 0xd8c8a8);
  rect(cup, 11, 8, 5, 2, 0x846348);
  cup.visible = false;
  container.addChild(cup);
  return { container, leftLeg, rightLeg, leftArm, rightArm, cup };
}
function speechBubble(parent: Container) {
  const container = new Container(),
    shape = new Graphics();
  const text = new Text({
    text: '',
    style: {
      fontFamily: 'Segoe UI, sans-serif',
      fontSize: 12,
      fill: 0x273c30,
      wordWrap: true,
      wordWrapWidth: 156,
      lineHeight: 15,
    },
  });
  container.addChild(shape, text);
  parent.addChild(container);
  container.visible = false;
  let previous = '';
  return {
    container,
    set(value: string) {
      if (value === previous) return;
      previous = value;
      container.visible = !!value;
      if (!value) return;
      text.text = value.slice(0, 75);
      text.position.set(10, 8);
      const height = Math.max(31, text.height + 16),
        width = 176;
      shape
        .clear()
        .roundRect(0, 0, width, height, 6)
        .fill(0xe9eddc)
        .stroke({ color: 0xa5b59b, width: 1 });
      shape.poly([79, height, 87, height + 8, 95, height]).fill(0xe9eddc);
      container.position.set(-width / 2, -height - 28);
    },
  };
}

interface Props {
  tasks: Task[];
  projects: Project[];
  busy: boolean;
  online?: boolean;
  onEmployee: (role: Role) => void;
  instances?: OfficeInstance[];
  onAgent?: (id: string) => void;
}
export function Office({
  tasks,
  projects,
  busy,
  online = true,
  onEmployee,
  instances,
  onAgent,
}: Props) {
  const host = useRef<HTMLDivElement>(null);
  const world = useRef<Container | null>(null);
  const appRef = useRef<Application | null>(null);
  const data = useRef({ tasks, projects, busy, instances, onAgent, online });
  data.current = { tasks, projects, busy, instances, onAgent, online };
  const instanceKey = instances?.map((i) => i.id + ':' + i.role).join('|') || '';
  const [zoom, setZoom] = useState(1);
  const [paused, setPaused] = useState(false);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const manualZoom = useRef(false);
  const panView = useRef((x: number, y: number) => {});
  const resetPan = useRef(() => {});
  const settings = useRef({ zoom, paused });
  settings.current = { zoom, paused: paused || !online };
  useEffect(() => {
    if (!host.current) return;
    const container = host.current;
    setError('');
    let disposed = false;
    let observer: ResizeObserver;
    const app = new Application();
    let cleanup = () => {};
    void (async () => {
      try {
        await app.init({
          resizeTo: container,
          background: 0x14271e,
          antialias: false,
          resolution: Math.min(window.devicePixelRatio || 1, 2),
          autoDensity: true,
          preference: 'webgl',
        });
        if (disposed) {
          app.destroy(true);
          return;
        }
        appRef.current = app;
        app.ticker.maxFPS = 30;
        container.appendChild(app.canvas);
        const scene = new Container();
        world.current = scene;
        app.stage.addChild(scene);
        let drag = false;
        let start = { x: 0, y: 0 };
        let pan = { x: 0, y: 0 };
        const down = (e: PointerEvent) => {
          drag = true;
          start = { x: e.clientX - pan.x, y: e.clientY - pan.y };
        };
        const move = (e: PointerEvent) => {
          if (drag) pan = { x: e.clientX - start.x, y: e.clientY - start.y };
        };
        const up = () => {
          drag = false;
        };
        resetPan.current = () => {
          pan = { x: 0, y: 0 };
          manualZoom.current = false;
          setZoom(data.current.instances && container.clientWidth < 600 ? 2.2 : 1);
        };
        panView.current = (x, y) => {
          pan.x += x;
          pan.y += y;
        };
        app.canvas.addEventListener('pointerdown', down);
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
        // Establish cleanup before drawing: a failed roster must not leak a partial scene.
        cleanup = () => {
          observer?.disconnect();
          app.canvas.removeEventListener('pointerdown', down);
          window.removeEventListener('pointermove', move);
          window.removeEventListener('pointerup', up);
          app.destroy(true, { children: true });
        };
        const base = new Graphics();
        scene.addChild(base);
        const rooms = [
          { x: 28, y: 76, name: 'RESEARCH LIBRARY', role: 'researcher', accent: 0x8fac8d },
          { x: 368, y: 76, name: 'EXECUTIVE OFFICE', role: 'ceo', accent: gold },
          { x: 708, y: 76, name: 'DESIGN STUDIO', role: 'designer', accent: 0xba9ec5 },
          { x: 28, y: 416, name: 'DEVELOPMENT', role: 'developer', accent: 0x91b7c8 },
          { x: 368, y: 416, name: 'THE COMMON ROOM', role: 'meeting', accent: 0xc2a786 },
          { x: 708, y: 416, name: 'REVIEW LAB', role: 'reviewer', accent: 0xd1a08e },
        ];
        const w = 320,
          h = 264;
        // Lawn, stone edging, and corridor lights.
        rect(base, 8, 8, 1028, 55, 0x294632);
        for (let i = 0; i < 70; i++) {
          const x = 18 + ((i * 73) % 1000),
            y = 18 + ((i * 17) % 37);
          rect(base, x, y, 3, 3, i % 3 ? 0x56724e : 0x7d8d59);
        }
        rect(base, 8, 60, 1028, 7, 0x74917c);
        rect(base, 8, 355, 1028, 48, 0x253c36);
        for (let x = 20; x < 1040; x += 32) {
          rect(base, x, 366, 20, 1, 0x395048);
          rect(base, x, 391, 20, 1, 0x395048);
        }
        rect(base, 0, 348, 1048, 4, 0x4c6555);
        rect(base, 0, 405, 1048, 4, 0x4c6555);
        const sign = label(scene, 'NXSOOS HEADQUARTERS', 524, 26, 16, 0xe5e8ce);
        sign.anchor.set(0.5, 0);
        sign.style.letterSpacing = 4;
        label(scene, '01  /  COMPANY FLOOR', 29, 373, 10, 0x9bb2a0);
        label(scene, 'BUILD SOMETHING GOOD.', 796, 373, 10, 0x9bb2a0);
        for (const room of rooms) {
          rect(base, room.x - 5, room.y - 5, w + 10, h + 12, 0x091710);
          rect(base, room.x, room.y, w, h, 0x765f48);
          for (let row = 0; row < Math.ceil(h / 16); row++)
            for (let col = 0; col < Math.ceil(w / 32); col++) {
              const x = room.x + col * 32 + (row % 2) * -16;
              rect(
                base,
                Math.max(room.x, x),
                room.y + row * 16,
                Math.min(31, room.x + w - Math.max(room.x, x)),
                15,
                [0x66705a, 0x6c745f, 0x606c56, 0x71765e][(row * 7 + col * 3) % 4],
              );
            }
          rect(base, room.x, room.y, w, 34, 0x2b4634);
          rect(base, room.x, room.y + 31, w, 4, 0x70816a);
          rect(base, room.x, room.y, 4, h, 0x4c604d);
          rect(base, room.x + w - 4, room.y, 4, h, 0x4c604d);
          const roomName = (
            {
              ceo: 'ATLAS / CEO',
              researcher: 'SCOUT / RESEARCH',
              designer: 'IRIS / DESIGN',
              developer: 'NOVA / DEVELOPMENT',
              reviewer: 'SAGE / REVIEW',
              meeting: 'THE COMMON ROOM',
            } as Record<string, string>
          )[room.role];
          label(scene, roomName, room.x + 29, room.y + 10, 12);
          if (room.role === 'meeting')
            rect(base, room.x + 8, room.y + 37, w - 16, 24, 0x203d30, 0.9);
          rect(base, room.x + 24, room.y + 83, 272, 133, 0x5b6956, 0.35);
          rect(
            base,
            room.x + 29,
            room.y + 88,
            262,
            123,
            room.role === 'designer' ? 0x72716c : 0x62745e,
            0.65,
          );
          plant(base, room.x + 24, room.y + 66, true);
          plant(base, room.x + w - 24, room.y + h - 26, true);
          if (room.role === 'researcher') {
            shelves(base, room.x + 65, room.y + 44, 170);
            desk(base, room.x + 115, room.y + 143, room.accent);
            shelves(base, room.x + 20, room.y + 195, 65);
          }
          if (room.role === 'ceo') {
            rect(base, room.x + 104, room.y + 44, 112, 42, 0x345056);
            rect(base, room.x + 108, room.y + 48, 104, 32, 0x8ca5a0);
            rect(base, room.x + 156, room.y + 48, 5, 32, 0x4e6658);
            desk(base, room.x + 120, room.y + 126, room.accent);
            couch(base, room.x + 40, room.y + 209);
          }
          if (room.role === 'designer') {
            rect(base, room.x + 90, room.y + 45, 140, 45, 0xddd8ba);
            for (let i = 0; i < 5; i++)
              rect(
                base,
                room.x + 99 + i * 25,
                room.y + 55,
                17,
                24,
                [0xa888a5, 0x92b0aa, 0xc4a677, 0x84959e, 0xa2ad86][i],
              );
            desk(base, room.x + 119, room.y + 145, room.accent);
            rect(base, room.x + 35, room.y + 133, 35, 44, 0x6d5c47);
            rect(base, room.x + 39, room.y + 137, 27, 34, 0xd7c9ad);
          }
          if (room.role === 'developer') {
            desk(base, room.x + 54, room.y + 114, room.accent);
            desk(base, room.x + 196, room.y + 114, room.accent);
            rect(base, room.x + 105, room.y + 45, 112, 33, 0x243e37);
            label(scene, '> ship with care_', room.x + 113, room.y + 56, 9, 0x9dbb99);
            shelves(base, room.x + 45, room.y + 210, 100);
            rect(base, room.x + 271, room.y + 172, 28, 58, 0x293d37);
            for (let rack = 0; rack < 4; rack++) {
              rect(base, room.x + 275, room.y + 177 + rack * 12, 20, 8, 0x3e5147);
              rect(base, room.x + 278, room.y + 180 + rack * 12, 3, 2, 0x92b8a0);
            }
          }
          if (room.role === 'reviewer') {
            desk(base, room.x + 117, room.y + 142, room.accent);
            rect(base, room.x + 100, room.y + 46, 130, 48, 0xcccbb0);
            for (let i = 0; i < 3; i++) {
              rect(base, room.x + 110, room.y + 56 + i * 11, 5, 5, 0x6d9270);
              rect(base, room.x + 123, room.y + 56 + i * 11, 90 - i * 13, 3, 0x8f9a82);
            }
            shelves(base, room.x + 30, room.y + 199, 90);
          }
          if (room.role === 'meeting') {
            couch(base, room.x + 35, room.y + 77);
            couch(base, room.x + 184, room.y + 77);
            rect(base, room.x + 104, room.y + 144, 112, 52, 0x72583d);
            rect(base, room.x + 108, room.y + 140, 104, 47, 0xc3a77d);
            for (let i = 0; i < 3; i++) {
              rect(base, room.x + 123 + i * 27, room.y + 153, 14, 18, 0xdfd9b9);
            }
            plant(base, room.x + 64, room.y + 218, true);
            rect(base, room.x + 230, room.y + 167, 73, 26, 0xb38c62);
            rect(base, room.x + 230, room.y + 190, 73, 20, 0x53634c);
            rect(base, room.x + 249, room.y + 137, 31, 29, 0x2a3833);
            rect(base, room.x + 252, room.y + 140, 25, 7, 0x6f8f78);
            rect(base, room.x + 257, room.y + 151, 15, 3, 0x182921);
            rect(base, room.x + 260, room.y + 159, 8, 7, 0xe8dfc6);
            rect(base, room.x + 286, room.y + 158, 10, 8, 0xdfd8bd);
            label(scene, 'COFFEE', room.x + 241, room.y + 121, 9, 0xc9d6b9);
            // A wall-mounted TV faces the common-room sofas.
            rect(base, room.x + 116, room.y + 28, 87, 44, 0x172b28);
            rect(base, room.x + 122, room.y + 33, 75, 32, 0x506b70);
            rect(base, room.x + 127, room.y + 49, 65, 12, 0x779075);
            rect(base, room.x + 137, room.y + 41, 14, 11, 0xc7c59d);
            rect(base, room.x + 156, room.y + 72, 7, 7, 0x334b3e);
            label(scene, 'TV', room.x + 151, room.y + 83, 8, 0xc9d6b9);
          }
          // Door threshold connects every room to the shared corridor.
          rect(base, room.x + 144, room.y + (room.y < 400 ? h - 4 : 0), 40, 8, 0xd0b489);
        }
        const worldHeight = 708;
        const roomStatuses = rooms
          .filter((room) => room.role !== 'meeting')
          .map((room) => {
            const indicator = new Graphics();
            indicator.position.set(room.x + 15, room.y + 16);
            scene.addChild(indicator);
            const projectStrip = new Graphics();
            rect(projectStrip, room.x + 8, room.y + h - 30, w - 16, 24, 0x203d30, 0.95);
            scene.addChild(projectStrip);
            const projectText = label(
              scene,
              'AVAILABLE',
              room.x + 16,
              room.y + h - 24,
              11,
              0xc7d3b8,
            );
            const statusText = label(scene, 'IDLE', room.x + w - 13, room.y + 12, 9, 0xb4c7a5);
            statusText.anchor.set(1, 0);
            return { room, indicator, projectText, statusText, state: '' };
          });
        const coffeeSteam = new Graphics();
        rect(coffeeSteam, 627, 543, 2, 9, 0xdde3ce, 0.6);
        rect(coffeeSteam, 633, 539, 2, 11, 0xdde3ce, 0.4);
        scene.addChild(coffeeSteam);
        const roster = instances?.length
          ? instances.slice(0, 40).map((instance) => ({
              ...employees.find((employee) => employee.id === instance.role)!,
              name: instance.name,
              instanceId: instance.id,
            }))
          : employees.map((employee) => ({ ...employee, instanceId: null }));
        const staff = roster.map((definition) => {
          const roleIndex = employees.findIndex((employee) => employee.id === definition.id);
          const room = rooms.find((room) => room.role === definition.id)!;
          const actor = character(color(definition.color), roleIndex),
            c = actor.container;
          const home = { x: room.x + 160, y: room.y + 193 };
          c.position.set(home.x, home.y);
          scene.addChild(c);
          const name = label(c, definition.name.toUpperCase(), 0, 28, 10, color(definition.color));
          name.anchor.set(0.5, 0);
          c.eventMode = 'static';
          c.cursor = 'pointer';
          c.hitArea = {
            contains: (x: number, y: number) => x > -24 && x < 40 && y > -24 && y < 45,
          };
          c.on('pointertap', () =>
            definition.instanceId
              ? data.current.onAgent?.(definition.instanceId)
              : onEmployee(definition.id),
          );
          const glow = new Graphics();
          glow.ellipse(0, 6, 21, 15).fill({ color: color(definition.color), alpha: 0.2 });
          c.addChildAt(glow, 0);
          const bubble = speechBubble(c);
          const door = { x: room.x + 160, y: room.y < 400 ? room.y + 246 : room.y + 12 };
          const outward =
            room.y < 400
              ? [door]
              : [
                  { x: room.x + 270, y: room.y + 213 },
                  { x: room.x + 270, y: room.y + 58 },
                  { x: room.x + 160, y: room.y + 58 },
                  door,
                ];
          const coffeePath = [
            ...outward,
            { x: room.x + 160, y: 382 },
            { x: 528, y: 382 },
            { x: 528, y: 428 },
            { x: 670, y: 446 },
            { x: 670, y: 628 },
            { x: 640, y: 628 },
          ];
          const tvPath = [
            ...outward,
            { x: room.x + 160, y: 382 },
            { x: 528, y: 382 },
            { x: 528, y: 428 },
            { x: 528 + (roleIndex % 2 ? 75 : -75), y: 550 },
          ];
          const firstBreak = idleBreak(roleIndex, 0);
          return {
            definition,
            room,
            home,
            actor,
            container: c,
            glow,
            bubble,
            roleIndex,
            coffeePath,
            tvPath,
            activity: firstBreak.activity,
            breakSequence: 0,
            mode: 'desk' as 'desk' | 'outward' | 'break' | 'return',
            waypoint: 0,
            nextBreak: firstBreak.delay,
            breakUntil: 0,
            wasWorking: false,
          };
        });
        let time = 0;
        const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
        const animate = (tick: Ticker) => {
          if (disposed) return;
          const moving = !settings.current.paused && !reducedMotion.matches;
          if (moving) time += tick.deltaTime;
          const seconds = time / 60,
            state = data.current;
          const fit = Math.min(app.screen.width / 1070, app.screen.height / (worldHeight + 24));
          const scale = fit * settings.current.zoom;
          scene.scale.set(scale);
          scene.position.set(
            (app.screen.width - 1048 * scale) / 2 + pan.x,
            Math.max(8, (app.screen.height - worldHeight * scale) / 2) + pan.y,
          );
          coffeeSteam.alpha = moving ? 0.45 + Math.sin(time * 0.055) * 0.2 : 0.4;
          for (const badge of roomStatuses) {
            const role = badge.room.role as Role;
            const observed = state.instances?.find((instance) => instance.role === role);
            const tasks = state.tasks.filter(
              (task) =>
                task.role === role &&
                ['working', 'reviewing', 'stopping', 'awaiting_input'].includes(task.status),
            );
            const working = observed
              ? state.online && observed.state === 'working'
              : isAgentWorking(role, state.tasks, state.busy, state.online);
            const status = !state.online
              ? 'UNKNOWN'
              : working
                ? 'WORKING'
                : observed?.state === 'waiting' ||
                    tasks.some((task) => task.status === 'awaiting_input')
                  ? 'WAITING'
                  : observed?.state === 'unknown'
                    ? 'UNKNOWN'
                    : 'IDLE';
            const badgeState = status + ':' + (observed?.instanceCount || 0);
            if (badge.state !== badgeState) {
              badge.state = badgeState;
              const led = working ? 0x4ade80 : status === 'UNKNOWN' ? 0x98a69b : 0xf87171;
              badge.indicator
                .clear()
                .circle(0, 0, 8)
                .fill({ color: led, alpha: 0.12 })
                .circle(0, 0, 4)
                .fill(led);
              badge.statusText.text =
                observed && working && (observed.instanceCount || 0) > 1
                  ? observed.instanceCount + ' WORKING'
                  : status;
              badge.statusText.style.fill = working ? 0x9ce8a7 : 0xc0cbb1;
            }
            const projectIds = observed
              ? observed.workspaceId
                ? [observed.workspaceId]
                : []
              : [...new Set(tasks.map((task) => task.projectId))];
            const names =
              observed?.projectNames ||
              projectIds
                .map((id) => state.projects.find((project) => project.id === id)?.name)
                .filter(Boolean);
            const projectLabel = names.length
              ? (working || status === 'WAITING' ? 'PROJECT / ' : 'LAST / ') + names.join(' + ')
              : 'NO ACTIVE PROJECT';
            badge.projectText.text =
              projectLabel.length > 35 ? projectLabel.slice(0, 32) + '...' : projectLabel;
          }
          for (const member of staff) {
            const observed = member.definition.instanceId
              ? state.instances?.find((instance) => instance.id === member.definition.instanceId)
              : undefined;
            const task = state.tasks
              .filter(
                (task) =>
                  task.role === member.definition.id &&
                  ['working', 'reviewing', 'awaiting_input', 'stopping'].includes(task.status),
              )
              .sort((a, b) => Number(isExecuting(b.status)) - Number(isExecuting(a.status)))[0];
            const active = observed
              ? state.online && observed.state === 'working'
              : isAgentWorking(member.definition.id, state.tasks, state.busy, state.online);
            const idle = state.online && (observed ? observed.state === 'idle' : !active && !task);
            const c = member.container;
            if (active) {
              if (!member.wasWorking) c.position.set(member.home.x, member.home.y);
              member.mode = 'desk';
            }
            member.wasWorking = active;
            // A wait/disconnection can interrupt an outing too. Start a fresh calm
            // interval once genuine idle resumes, rather than immediately retrying it.
            if (!idle)
              member.nextBreak = seconds + idleBreak(member.roleIndex, member.breakSequence).delay;
            if (!idle && member.mode !== 'desk') {
              member.mode = 'desk';
              c.position.set(member.home.x, member.home.y);
            }
            if (reducedMotion.matches) {
              member.mode = 'desk';
              c.position.set(member.home.x, member.home.y);
              member.nextBreak = seconds + idleBreak(member.roleIndex, member.breakSequence).delay;
            }
            if (idle && moving) {
              if (member.mode === 'desk' && seconds >= member.nextBreak) {
                member.mode = 'outward';
                member.waypoint = 0;
              }
              if (member.mode === 'break' && seconds >= member.breakUntil) {
                member.mode = 'return';
                member.waypoint = 0;
              }
              if (member.mode === 'outward' || member.mode === 'return') {
                const breakPath = member.activity === 'tv' ? member.tvPath : member.coffeePath;
                const path =
                  member.mode === 'outward'
                    ? breakPath
                    : [...breakPath.slice(0, -1).reverse(), member.home];
                const target = path[member.waypoint],
                  dx = target.x - c.x,
                  dy = target.y - c.y,
                  distance = Math.hypot(dx, dy),
                  step = 1.7 * tick.deltaTime;
                if (distance <= step) {
                  c.position.set(target.x, target.y);
                  member.waypoint++;
                  if (member.waypoint >= path.length) {
                    if (member.mode === 'outward') {
                      member.mode = 'break';
                      member.breakUntil =
                        seconds + idleBreak(member.roleIndex, member.breakSequence).duration;
                    } else {
                      member.mode = 'desk';
                      member.breakSequence++;
                      const next = idleBreak(member.roleIndex, member.breakSequence);
                      member.activity = next.activity;
                      member.nextBreak = seconds + next.delay;
                    }
                  }
                } else {
                  c.x += (dx / distance) * step;
                  c.y += (dy / distance) * step;
                }
              }
            }
            const walking = moving && (member.mode === 'outward' || member.mode === 'return');
            member.actor.leftLeg.y = walking ? Math.sin(time * 0.3) * 2.4 : 0;
            member.actor.rightLeg.y = walking ? -Math.sin(time * 0.3) * 2.4 : 0;
            member.actor.leftArm.rotation = moving
              ? active
                ? Math.sin(time * 0.4) * 0.12
                : walking
                  ? Math.sin(time * 0.3) * 0.13
                  : 0
              : 0;
            member.actor.rightArm.rotation = -member.actor.leftArm.rotation;
            member.actor.cup.visible = member.mode === 'break' && member.activity === 'coffee';
            c.pivot.y = moving
              ? walking
                ? Math.sin(time * 0.6) * 0.8
                : Math.sin(time * 0.025 + member.roleIndex) * 0.45
              : 0;
            member.glow.visible = active;
            member.glow.alpha = 0.6 + (moving ? Math.sin(time * 0.1) * 0.2 : 0);
            const speech = !state.online
              ? 'Connection unavailable'
              : active
                ? observed?.label || task?.title || 'Planning the next step'
                : observed?.state === 'waiting' || task?.status === 'awaiting_input'
                  ? 'Waiting for your input'
                  : observed?.state === 'unknown'
                    ? 'Status unavailable'
                    : observed?.state === 'interrupted'
                      ? 'Work interrupted'
                      : member.mode === 'outward'
                        ? member.activity === 'tv'
                          ? 'A little TV break.'
                          : 'Time for a coffee.'
                        : member.mode === 'break'
                          ? member.activity === 'tv'
                            ? 'Watching TV · idle'
                            : 'Coffee break · idle'
                          : member.mode === 'return'
                            ? 'Back to my desk.'
                            : '';
            member.bubble.set(speech);
          }
        };
        app.ticker.add(animate);
        observer = new ResizeObserver(() => {
          app.resize();
          if (!manualZoom.current)
            setZoom(data.current.instances && container.clientWidth < 600 ? 2.2 : 1);
        });
        observer.observe(container);
        const destroyScene = cleanup;
        cleanup = () => {
          app.ticker.remove(animate);
          destroyScene();
        };
      } catch (e: any) {
        cleanup();
        cleanup = () => {};
        if (!disposed) {
          console.error('Office graphics initialization failed:', e);
          setError(
            'Office graphics could not start. Your team and tasks are still available below.',
          );
        }
      }
    })();
    return () => {
      disposed = true;
      cleanup();
      appRef.current = null;
      world.current = null;
    };
  }, [onEmployee, instanceKey, attempt]);
  return (
    <div className="office-wrap">
      <div
        className="office-canvas"
        ref={host}
        role="img"
        aria-label="Animated pixel-art company office. Use the employee buttons below to inspect workers."
        tabIndex={0}
        onKeyDown={(event) => {
          const move = (
            {
              ArrowLeft: [35, 0],
              ArrowRight: [-35, 0],
              ArrowUp: [0, 35],
              ArrowDown: [0, -35],
            } as Record<string, number[]>
          )[event.key];
          if (move) {
            event.preventDefault();
            panView.current(move[0], move[1]);
          }
        }}
      />
      {error && (
        <div className="canvas-error" role="alert">
          {error}{' '}
          <button className="secondary compact" onClick={() => setAttempt((value) => value + 1)}>
            Retry office graphics
          </button>
        </div>
      )}
      <div className="office-caption">
        <span className="live-dot" />
        {online ? 'LIVE OFFICE' : 'CONNECTION LOST'}
        <span className="caption-divider" />
        LOCAL WORKSPACE
      </div>
      <div className="map-controls">
        <button
          aria-label={paused ? 'Resume animation' : 'Pause animation'}
          onClick={() => setPaused(!paused)}
        >
          {paused ? <Play size={16} /> : <Pause size={16} />}
        </button>
        <span />
        <button
          aria-label="Zoom out"
          onClick={() => {
            manualZoom.current = true;
            setZoom((z) => Math.max(0.45, z - 0.15));
          }}
        >
          <ZoomOut size={16} />
        </button>
        <button
          aria-label="Reset office view"
          onClick={() => {
            resetPan.current();
          }}
        >
          <LocateFixed size={16} />
        </button>
        <button
          aria-label="Zoom in"
          onClick={() => {
            manualZoom.current = true;
            setZoom((z) => Math.min(3, z + 0.15));
          }}
        >
          <ZoomIn size={16} />
        </button>
      </div>
    </div>
  );
}
