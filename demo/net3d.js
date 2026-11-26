/* The hero's 3D network (the page's one effect). three.js draws a company network on three rings:
   laptops outside, servers in the middle, the domain controller and the database raised in the centre.
   A GSAP timeline plays one story on a loop: an intruder moves laptop -> server -> server, the next target
   lights up, and a block stops the last step. Poster first; the canvas fades in over it when ready.
   Under reduced motion, on a phone (under 768px) or without WebGL the poster stays. */
(function () {
  const host = document.querySelector('[data-net3d]');
  if (!host || !window.THREE || !window.gsap) return;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches || matchMedia('(max-width: 767px)').matches) return;
  if ((window.__tpGl || 0) >= 4) return;

  const T = window.THREE, g = window.gsap;
  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  let renderer;
  try { renderer = new T.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' }); }
  catch (e) { return; }
  if (!renderer.getContext()) return;
  window.__tpGl = (window.__tpGl || 0) + 1;
  renderer.setPixelRatio(Math.min(1.5, window.devicePixelRatio || 1));
  host.appendChild(canvas);

  /* ------------------------------------------------------------ scene */
  const scene = new T.Scene();
  scene.fog = new T.Fog(0x0a1210, 9, 17);
  const camera = new T.PerspectiveCamera(34, 1, 0.1, 60);
  camera.position.set(0, 5.4, 9.6);
  camera.lookAt(0, 0.55, 0);
  scene.add(new T.AmbientLight(0xbfe9d2, 0.55));
  const key = new T.DirectionalLight(0xffffff, 0.85); key.position.set(4, 8, 6); scene.add(key);
  const rim = new T.DirectionalLight(0x39ff88, 0.35); rim.position.set(-6, 3, -5); scene.add(rim);

  const world = new T.Group(); scene.add(world);
  let start;
  const grid = new T.PolarGridHelper(4.2, 24, 5, 96, 0x1d3a2e, 0x15291f);
  grid.position.y = -0.02; world.add(grid);

  /* seeded random, so every visit draws the same network */
  let s = 62; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);

  const C = { ws: 0x2c6b4c, sv: 0x2ee6ff, cr: 0xe6f2ec, red: 0xff4d6a, amber: 0xffb020, cyan: 0x2ee6ff };
  const nodes = [];
  const add = (kind, r, a, y) => {
    const p = new T.Vector3(Math.cos(a) * r, y, Math.sin(a) * r);
    let geo, col;
    if (kind === 'cr') { geo = new T.OctahedronGeometry(0.26); col = C.cr; }
    else if (kind === 'sv') { geo = new T.BoxGeometry(0.26, 0.4, 0.26); col = C.sv; }
    else { geo = new T.SphereGeometry(0.085, 16, 12); col = C.ws; }
    const m = new T.Mesh(geo, new T.MeshLambertMaterial({ color: col, emissive: col, emissiveIntensity: kind === 'ws' ? 0.25 : 0.35 }));
    m.position.copy(p); world.add(m);
    const n = { kind, p, m, a }; nodes.push(n); return n;
  };
  const crit = [add('cr', 0.95, -Math.PI / 3, 1.35), add('cr', 0.95, Math.PI * 2 / 3, 1.35)];
  const servers = []; for (let i = 0; i < 6; i++) servers.push(add('sv', 2.05, i / 6 * Math.PI * 2 + 0.3, 0.62));
  const ws = []; for (let i = 0; i < 36; i++) ws.push(add('ws', 3.35 + (rnd() - 0.5) * 0.35, i / 36 * Math.PI * 2, 0.05 + rnd() * 0.12));

  /* ordinary traffic */
  const pos = [];
  const link = (a, b) => pos.push(a.p.x, a.p.y, a.p.z, b.p.x, b.p.y, b.p.z);
  const near = (n, list) => list.slice().sort((x, y) => Math.abs(Math.atan2(Math.sin(x.a - n.a), Math.cos(x.a - n.a))) - Math.abs(Math.atan2(Math.sin(y.a - n.a), Math.cos(y.a - n.a))));
  ws.forEach((w, i) => { const ns = near(w, servers); link(w, ns[0]); if (rnd() < 0.35) link(w, ns[1]); if (i % 3 === 0) link(w, ws[(i + 1) % ws.length]); });
  servers.forEach((v, i) => { crit.forEach(c => link(v, c)); link(v, servers[(i + 1) % servers.length]); });
  link(crit[0], crit[1]);
  const lg = new T.BufferGeometry(); lg.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
  world.add(new T.LineSegments(lg, new T.LineBasicMaterial({ color: 0x39ff88, transparent: true, opacity: 0.16 })));

  /* glow sprites */
  const glowTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d');
    const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = gr; x.fillRect(0, 0, 64, 64); return new T.CanvasTexture(c); })();
  const glow = (color, size, at) => { const sp = new T.Sprite(new T.SpriteMaterial({ map: glowTex, color, transparent: true, opacity: 0, blending: T.AdditiveBlending, depthWrite: false }));
    sp.scale.set(size, size, 1); sp.position.copy(at); world.add(sp); return sp; };

  /* the attack: laptop -> server -> server -> domain controller */
  start = near(servers[1], ws)[0];
  world.rotation.y = start.a - Math.PI / 4;
  const route = [start, servers[1], servers[2], crit[0]];
  const up = new T.Vector3(0, 1, 0);
  const beam = (a, b, color, r) => {
    const geo = new T.CylinderGeometry(r, r, 1, 10, 1, true); geo.translate(0, 0.5, 0);
    const m = new T.Mesh(geo, new T.MeshBasicMaterial({ color, transparent: true, opacity: 0.95 }));
    const d = new T.Vector3().subVectors(b.p, a.p); m.userData.len = d.length();
    m.position.copy(a.p); m.quaternion.setFromUnitVectors(up, d.clone().normalize()); m.scale.set(1, 0.0001, 1);
    world.add(m); return m;
  };
  const b1 = beam(route[0], route[1], C.red, 0.03), b2 = beam(route[1], route[2], C.red, 0.03), b3 = beam(route[2], route[3], C.amber, 0.022);
  const startGlow = glow(C.red, 1.1, route[0].p); startGlow.material.opacity = 0.9;
  const dcGlow = glow(C.amber, 1.6, route[3].p);
  const intruder = new T.Mesh(new T.SphereGeometry(0.07, 16, 12), new T.MeshBasicMaterial({ color: 0xffffff }));
  intruder.position.copy(route[0].p); world.add(intruder);
  const intruderGlow = glow(C.red, 0.7, route[0].p); intruderGlow.material.opacity = 1;
  const shieldAt = new T.Vector3().lerpVectors(route[2].p, route[3].p, 0.55);
  const shield = new T.Mesh(new T.TorusGeometry(0.24, 0.025, 10, 48), new T.MeshBasicMaterial({ color: C.cyan, transparent: true, opacity: 0.95 }));
  shield.position.copy(shieldAt); shield.lookAt(route[3].p); shield.scale.setScalar(0.001); world.add(shield);
  const shieldGlow = glow(C.cyan, 1.0, shieldAt);
  route[0].m.material.color.setHex(C.red); route[0].m.material.emissive.setHex(C.red);

  /* ------------------------------------------------------------ the story, on a GSAP timeline */
  const along = (a, b, k) => intruder.position.lerpVectors(a.p, b.p, k);
  const prog = { k: 0 };
  const paint = (n, hex) => { const c = new T.Color(hex); return [g.to(n.m.material.color, { r: c.r, g: c.g, b: c.b, duration: 0.35 }), g.to(n.m.material.emissive, { r: c.r, g: c.g, b: c.b, duration: 0.35 })]; };
  const tl = g.timeline({ repeat: -1, defaults: { ease: 'power2.inOut' } });
  tl.call(() => {
    [b1, b2, b3].forEach(b => b.scale.y = 0.0001); b3.material.opacity = 0.95;
    shield.scale.setScalar(0.001); shieldGlow.material.opacity = 0; dcGlow.material.opacity = 0;
    [route[1], route[2]].forEach(n => { n.m.material.color.setHex(C.sv); n.m.material.emissive.setHex(C.sv); });
    intruder.position.copy(route[0].p);
  }, null, 0);
  [[b1, 0, 0.6], [b2, 1, 2.2]].forEach(([b, i, at]) => {
    tl.fromTo(prog, { k: 0 }, { k: 1, duration: 1.1, onUpdate: () => { b.scale.y = Math.max(0.0001, prog.k * b.userData.len); along(route[i], route[i + 1], prog.k); } }, at);
    tl.add(paint(route[i + 1], C.red), at + 1.0);
  });
  tl.to(b3.scale, { y: b3.userData.len, duration: 0.9, ease: 'power2.out' }, 3.8);
  tl.to(dcGlow.material, { opacity: 0.85, duration: 0.6, ease: 'power2.out' }, 4.0);
  tl.to(shield.scale, { x: 1, y: 1, z: 1, duration: 0.55, ease: 'power3.out' }, 5.3);
  tl.to(shieldGlow.material, { opacity: 0.9, duration: 0.55 }, 5.3);
  tl.fromTo(prog, { k: 0 }, { k: 0.5, duration: 0.6, ease: 'power2.in', onUpdate: () => along(route[2], route[3], prog.k) }, 6.1);
  tl.to(prog, { k: 0, duration: 0.6, ease: 'power2.out', onUpdate: () => along(route[2], route[3], prog.k) }, 6.7);
  tl.to(b3.material, { opacity: 0.22, duration: 0.6 }, 7.0);
  tl.to(dcGlow.material, { opacity: 0.25, duration: 0.8 }, 7.0);
  tl.to({}, { duration: 3.2 }, 7.6);

  /* ------------------------------------------------------------ labels, pointer, size, pause */
  const tags = { start: host.querySelector('[data-tag="start"]'), dc: host.querySelector('[data-tag="dc"]') };
  const tmp = new T.Vector3();
  const place = (el, v) => { if (!el) return; tmp.copy(v); world.localToWorld(tmp); tmp.project(camera);
    el.style.left = `${(tmp.x * 0.5 + 0.5) * host.clientWidth}px`; el.style.top = `${(-tmp.y * 0.5 + 0.5) * host.clientHeight}px`; };

  /* turn the network so the break-in faces the camera, then sway slowly around that view (a 24 s cycle) */
  const spin0 = start.a - Math.PI / 4;
  let tx = 0, ty = 0, clock = 0, paused = false, visible = true;
  host.addEventListener('pointermove', e => { const r = host.getBoundingClientRect(); tx = ((e.clientX - r.left) / r.width - 0.5) * 0.35; ty = ((e.clientY - r.top) / r.height - 0.5) * 0.12; });
  host.addEventListener('pointerleave', () => { tx = 0; ty = 0; });
  const size = () => { const w = host.clientWidth, h = host.clientHeight; if (!w || !h) return; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); };
  new ResizeObserver(size).observe(host); size();
  new IntersectionObserver(es => { visible = es[0].isIntersecting; }).observe(host);

  const btn = document.createElement('button');
  btn.className = 'net3d__pause'; btn.type = 'button'; btn.setAttribute('aria-label', 'Pause the animation');
  const icons = { pause: '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M3 2h2v8H3zM7 2h2v8H7z" fill="currentColor"/></svg>', play: '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M3 1.5v9l7-4.5z" fill="currentColor"/></svg>' };
  btn.innerHTML = icons.pause;
  btn.addEventListener('click', () => { paused = !paused; paused ? tl.pause() : tl.resume(); btn.innerHTML = paused ? icons.play : icons.pause; btn.setAttribute('aria-label', paused ? 'Play the animation' : 'Pause the animation'); });
  host.parentElement.appendChild(btn);

  g.ticker.add((time, dt) => {
    if (!visible || document.hidden) return;
    if (!paused) clock += dt / 1000;
    const sway = spin0 + Math.sin(clock / 24 * Math.PI * 2) * 0.32;
    world.rotation.y += ((sway + tx) - world.rotation.y) * 0.06;
    world.rotation.x += (ty - world.rotation.x) * 0.06;
    intruderGlow.position.copy(intruder.position);
    renderer.render(scene, camera);
    place(tags.start, route[0].p); place(tags.dc, route[3].p);
  });

  /* poster to canvas */
  requestAnimationFrame(() => {
    g.to(canvas, { opacity: 1, duration: 0.8, ease: 'power2.out', onComplete: () => { const p = host.querySelector('.net3d__poster'); if (p) p.style.visibility = 'hidden'; } });
  });
})();
