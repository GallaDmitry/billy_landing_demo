/* Billy — "Dentro il punto"
 * Scroll-driven zoom into a dot. Each scene hides a portal (a dot);
 * scrolling flies the camera into it and the next scene grows from inside.
 */
(() => {
  const root = document.documentElement;
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const scenes = [...document.querySelectorAll('.scene')];
  if (!scenes.length) return;

  // Decorative QR on the receipt (deterministic pseudo-random pattern + finder squares).
  document.querySelectorAll('.rc-qr').forEach((qr) => {
    let seed = 7;
    const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
    const inFinder = (x, y) => [[0, 0], [8, 0], [0, 8]].some(([fx, fy]) => x >= fx && x <= fx + 2 && y >= fy && y <= fy + 2);
    const nearFinder = (x, y) => (x <= 3 && y <= 3) || (x >= 7 && y <= 3) || (x <= 3 && y >= 7);
    let html = '';
    for (let y = 0; y < 11; y++) for (let x = 0; x < 11; x++) {
      const on = inFinder(x, y) ? true : nearFinder(x, y) ? false : rnd() > 0.5;
      html += on ? '<i></i>' : '<i class="o"></i>';
    }
    qr.innerHTML = html;
  });

  // Reveal everything in flat (reduced motion) mode and stop.
  if (reduceMotion.matches) {
    document.querySelectorAll('.r').forEach((el) => el.classList.add('in'));
    return;
  }
  root.classList.add('deep');

  const track = document.getElementById('track');
  const probe = document.getElementById('vh-probe');
  const nav = document.querySelector('.chapters');
  const counter = document.querySelector('.chapter-counter');
  const TRANS = 1.15; // scroll length of a dive, in viewport heights

  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const ease = (t) => 0.55 * (0.5 - 0.5 * Math.cos(Math.PI * t)) + 0.45 * t;

  // ---------- per-scene cached state ----------
  const S = scenes.map((el, i) => ({
    el,
    i,
    inner: el.querySelector('.scene-inner'),
    content: el.querySelector('.content'),
    portal: el.querySelector('.portal'),
    reveals: [...el.querySelectorAll('.r')].map((r) => ({ el: r, at: parseFloat(r.dataset.at || '0'), on: false })),
    hold: parseFloat(el.dataset.hold || '1'),
    theme: (el.className.match(/t-(paper|blue|ink)/) || [])[1] || 'paper',
    label: el.dataset.label || '',
    start: 0,
    p: { x: 0, y: 0, r: 1 },
    cache: {},
  }));

  let vh = innerHeight, W = innerWidth, H = innerHeight, total = 0;
  let segs = [];

  function set(s, key, val, apply) {
    if (s.cache[key] === val) return;
    s.cache[key] = val;
    apply(val);
  }

  // ---------- layout ----------
  function fit() {
    // Scale content down when it does not fit the viewport (small phones, landscape).
    for (const s of S) {
      if (!s.content) continue;
      s.content.style.setProperty('--fit', '1');
      const cs = getComputedStyle(s.inner);
      const avail = s.inner.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
      const need = s.content.offsetHeight;
      const k = need > avail ? Math.max(0.55, avail / need) : 1;
      s.content.style.setProperty('--fit', k.toFixed(3));
    }
  }

  function measure() {
    root.classList.add('measuring');
    fit();
    for (const s of S) {
      if (!s.portal) continue;
      const b = s.portal.getBoundingClientRect();
      s.p = { x: b.left + b.width / 2, y: b.top + b.height / 2, r: Math.max(2, b.width / 2) };
    }
    root.classList.remove('measuring');
    for (const s of S) s.cache = {};
  }

  function build() {
    const prevU = vh ? scrollY / vh : 0;
    const prevVh = vh;
    vh = probe.getBoundingClientRect().height || innerHeight;
    W = innerWidth; H = innerHeight;
    let u = 0;
    segs = [];
    S.forEach((s, i) => {
      s.start = u;
      segs.push({ type: 'hold', i, a: u, b: u + s.hold });
      u += s.hold;
      if (i < S.length - 1) { segs.push({ type: 'trans', i, a: u, b: u + TRANS }); u += TRANS; }
    });
    total = u;
    track.style.height = `${total * vh + H}px`;
    measure();
    if (prevVh && Math.abs(prevVh - vh) > 1) scrollTo(0, prevU * vh);
  }

  // ---------- rendering ----------
  function show(s, on, z) {
    set(s, 'on', on, (v) => s.el.classList.toggle('on', v));
    if (on) set(s, 'z', z, (v) => { s.el.style.zIndex = v; });
  }
  function reveal(s, p) {
    for (const r of s.reveals) {
      const want = r.at <= p + 1e-4;
      if (want !== r.on) { r.on = want; r.el.classList.toggle('in', want); }
    }
  }
  function rest(s) {
    set(s, 'clip', 'none', (v) => { s.el.style.clipPath = v; });
    set(s, 'tf', '', (v) => { s.inner.style.transform = v; });
    set(s, 'op', '1', (v) => { s.inner.style.opacity = v; });
    set(s, 'open', false, (v) => s.el.classList.toggle('diving', v));
    set(s, 'moving', false, (v) => s.el.classList.toggle('moving', v));
  }

  let state = { active: -1, vp: null };

  function render(u) {
    u = clamp(u, 0, total - 1e-6);
    let seg = segs[segs.length - 1];
    for (const sg of segs) if (u >= sg.a && u < sg.b) { seg = sg; break; }

    let dominant;
    if (seg.type === 'hold') {
      const s = S[seg.i];
      S.forEach((o) => { if (o !== s) show(o, false); });
      show(s, true, 1);
      rest(s);
      reveal(s, (u - seg.a) / (seg.b - seg.a));
      s.el.classList.toggle('ready', (u - seg.a) / (seg.b - seg.a) > 0.55);
      dominant = s;
      state.vp = s.portal ? s.p : null;
    } else {
      const A = S[seg.i], B = S[seg.i + 1];
      const t = (u - seg.a) / (seg.b - seg.a);
      const e = ease(t);
      const { x, y, r } = A.p;
      const cover = Math.max(Math.hypot(x, y), Math.hypot(W - x, y), Math.hypot(x, H - y), Math.hypot(W - x, H - y)) * 1.04;
      const maxS = cover / r;
      const s = Math.pow(maxS, e);

      S.forEach((o) => { if (o !== A && o !== B) show(o, false); });
      show(A, true, 1);
      show(B, true, 2);

      // A: camera flies into its portal
      set(A, 'clip', 'none', (v) => { A.el.style.clipPath = v; });
      A.inner.style.transformOrigin = `${x}px ${y}px`;
      set(A, 'tf', `scale(${s.toFixed(4)})`, (v) => { A.inner.style.transform = v; });
      set(A, 'op', (1 - smooth(0.02, 0.42, e)).toFixed(3), (v) => { A.inner.style.opacity = v; });
      set(A, 'open', t > 0.001, (v) => A.el.classList.toggle('diving', v));
      set(A, 'moving', true, (v) => A.el.classList.toggle('moving', v));
      reveal(A, 1);

      // B: the world inside the dot
      const rad = r * s;
      set(B, 'clip', rad >= cover ? 'none' : `circle(${rad.toFixed(2)}px at ${x.toFixed(2)}px ${y.toFixed(2)}px)`, (v) => { B.el.style.clipPath = v; });
      B.inner.style.transformOrigin = `${x}px ${y}px`;
      set(B, 'tf', t >= 0.999 ? '' : `scale(${(s / maxS).toFixed(5)})`, (v) => { B.inner.style.transform = v; });
      set(B, 'op', smooth(0.08, 0.7, e).toFixed(3), (v) => { B.inner.style.opacity = v; });
      set(B, 'open', false, (v) => B.el.classList.toggle('diving', v));
      set(B, 'moving', t < 0.999, (v) => B.el.classList.toggle('moving', v));
      reveal(B, 0);

      // Header/nav switch theme only once the new world covers the screen.
      dominant = rad >= cover * 0.97 ? B : A;
      state.vp = A.p;
    }

    if (state.active !== dominant.i || !document.body.dataset.theme) {
      state.active = dominant.i;
      document.body.dataset.theme = dominant.theme;
      updateNav();
    }
    const bar = document.querySelector('.progress-bar');
    if (bar) bar.style.transform = `scaleX(${(u / total).toFixed(4)})`;
  }

  // ---------- navigation ----------
  function goTo(i) {
    const s = S[clamp(i, 0, S.length - 1)];
    scrollTo({ top: (s.start + Math.min(0.6, s.hold * 0.6)) * vh, behavior: 'smooth' });
  }
  if (nav) {
    S.forEach((s, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'chap';
      b.setAttribute('aria-label', s.label);
      b.innerHTML = `<span class="chap-dot"></span><span class="chap-label">${s.label}</span>`;
      b.addEventListener('click', () => goTo(i));
      nav.appendChild(b);
    });
  }
  function updateNav() {
    if (nav) [...nav.children].forEach((b, i) => b.classList.toggle('active', i === state.active));
    if (counter) counter.textContent = `${String(state.active + 1).padStart(2, '0')} / ${String(S.length).padStart(2, '0')} · ${S[state.active].label}`;
  }
  addEventListener('hashchange', () => {
    const i = S.findIndex((s) => '#' + s.el.id === location.hash);
    if (i >= 0) goTo(i);
  });
  document.addEventListener('click', (ev) => {
    const a = ev.target.closest('a[href^="#"]');
    if (a) {
      const id = a.getAttribute('href').slice(1);
      const i = S.findIndex((s) => s.el.id === id);
      if (i >= 0) { ev.preventDefault(); goTo(i); return; }
    }
    const p = ev.target.closest('.portal');
    if (p) {
      const i = S.findIndex((s) => s.portal === p);
      if (i >= 0) goTo(i + 1);
    }
  });

  // ---------- starfield: dots streaming out of the portal ----------
  const cv = document.getElementById('field');
  const ctx = cv.getContext('2d');
  const DPR = Math.min(2, devicePixelRatio || 1);
  const isSmall = () => innerWidth < 760;
  let stars = [];
  function initStars() {
    cv.width = innerWidth * DPR; cv.height = innerHeight * DPR;
    const n = isSmall() ? 46 : 90;
    stars = Array.from({ length: n }, () => ({ x: (Math.random() - 0.5) * 3, y: (Math.random() - 0.5) * 3, z: Math.random() * 0.98 + 0.02, pz: 1 }));
  }
  const FG = { paper: '11,11,11', blue: '255,255,255', ink: '246,244,239' };
  const vp = { x: innerWidth / 2, y: innerHeight / 2 };
  function drawStars(dt, vel) {
    const target = state.vp || { x: W / 2, y: H / 2 };
    const k = 1 - Math.pow(0.001, dt);
    vp.x += (target.x - vp.x) * k; vp.y += (target.y - vp.y) * k;
    ctx.clearRect(0, 0, cv.width, cv.height);
    const speed = 0.035 + Math.min(2.2, Math.abs(vel) * 0.9);
    const dir = vel < -0.02 ? -1 : 1;
    const f = Math.min(W, H) * 0.42;
    const rgb = FG[document.body.dataset.theme] || FG.paper;
    const alpha = 0.16 + Math.min(0.45, Math.abs(vel) * 0.35);
    ctx.lineCap = 'round';
    for (const st of stars) {
      st.pz = st.z;
      st.z -= dir * speed * dt * 0.35;
      if (st.z < 0.02) { st.z = 1; st.pz = 1; st.x = (Math.random() - 0.5) * 3; st.y = (Math.random() - 0.5) * 3; }
      if (st.z > 1) { st.z = 0.02 + Math.random() * 0.1; st.pz = st.z; st.x = (Math.random() - 0.5) * 3; st.y = (Math.random() - 0.5) * 3; }
      const sx = (vp.x + (st.x / st.z) * f) * DPR, sy = (vp.y + (st.y / st.z) * f) * DPR;
      const px = (vp.x + (st.x / st.pz) * f) * DPR, py = (vp.y + (st.y / st.pz) * f) * DPR;
      const size = Math.max(0.7, (1 - st.z) * 3) * DPR;
      const a = alpha * smooth(1, 0.75, st.z);
      ctx.strokeStyle = `rgba(${rgb},${a.toFixed(3)})`;
      ctx.lineWidth = size;
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(sx + 0.01, sy);
      ctx.stroke();
    }
  }

  // ---------- loop ----------
  let target = scrollY / vh, cur = target, last = performance.now(), velS = 0;
  addEventListener('scroll', () => { target = scrollY / vh; }, { passive: true });
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    const k = 1 - Math.pow(1 - 0.14, dt * 60);
    const prev = cur;
    cur += (target - cur) * k;
    if (Math.abs(target - cur) < 1e-4) cur = target;
    const vel = dt > 0 ? (cur - prev) / dt : 0;
    velS += (vel - velS) * 0.2;
    render(cur);
    drawStars(dt, velS);
    requestAnimationFrame(frame);
  }

  let rt;
  addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { build(); initStars(); target = cur = scrollY / vh; }, 120); });

  build();
  initStars();
  if (location.hash) {
    const i = S.findIndex((s) => '#' + s.el.id === location.hash);
    if (i > 0) scrollTo(0, (S[i].start + 0.6) * vh);
  }
  target = cur = scrollY / vh;
  render(cur);
  requestAnimationFrame(frame);
  document.fonts && document.fonts.ready.then(() => { measure(); });
})();
