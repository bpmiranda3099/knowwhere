(() => {
  const mount = document.getElementById('kw-neural-clusters');
  if (!mount) return;

  // Ensure Three.js is available before running (avoids race / CDN failures).
  const ensureThree = (onReady) => {
    if (window.THREE) return onReady();
    if (window.__kwThreeLoading) {
      window.__kwThreeLoading.push(onReady);
      return;
    }

    window.__kwThreeLoading = [onReady];
    const script = document.createElement('script');
    // Fallback only: prefer loading `js/three.min.js` from the page.
    script.src = 'js/three.min.js';
    script.async = true;
    script.onload = () => {
      const cbs = window.__kwThreeLoading || [];
      window.__kwThreeLoading = null;
      cbs.forEach((cb) => {
        try { cb(); } catch (e) { /* noop */ }
      });
    };
    script.onerror = () => {
      console.error('[KnowWhere] Failed to load Three.js; neural clusters disabled.');
      window.__kwThreeLoading = null;
    };
    document.head.appendChild(script);
  };

  ensureThree(() => {
  const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;

  const css = getComputedStyle(document.documentElement);
  const kwPrimary = css.getPropertyValue('--kw-primary').trim() || '#5e17eb';
  const kwSecondary = css.getPropertyValue('--kw-secondary').trim() || '#343895';
  const kwNeutral300 = css.getPropertyValue('--kw-neutral-300').trim() || '#d0d5db';
  const kwNeutral500 = css.getPropertyValue('--kw-neutral-500').trim() || '#b4b9c4';

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0);
  mount.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
  camera.position.set(0, 0, 8);

  const root = new THREE.Group();
  scene.add(root);

  // Soft ambient so points feel dimensional.
  scene.add(new THREE.AmbientLight(0xffffff, 0.6));

  const randn = () => {
    // Box–Muller
    let u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  };

  const clamp01 = (x) => Math.max(0, Math.min(1, x));

  const pointCount = 240;
  const clusterCenters = [
    new THREE.Vector3(-1.6, 0.9, -0.6),
    new THREE.Vector3(1.5, 0.6, 0.5),
    new THREE.Vector3(-0.2, -1.2, 0.7),
  ];

  const positions = new Float32Array(pointCount * 3);
  const colors = new Float32Array(pointCount * 3);

  const cPrimary = new THREE.Color(kwPrimary);
  const cSecondary = new THREE.Color(kwSecondary);
  const cN300 = new THREE.Color(kwNeutral300);
  const cN500 = new THREE.Color(kwNeutral500);

  for (let i = 0; i < pointCount; i++) {
    const center = clusterCenters[i % clusterCenters.length];
    const spread = 0.65 + (i % 7) * 0.02;
    const x = center.x + randn() * spread;
    const y = center.y + randn() * spread;
    const z = center.z + randn() * spread;

    positions[i * 3 + 0] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;

    // Color mix: primary/secondary with silver accents.
    const t = (i % 11) / 10;
    const base = cPrimary.clone().lerp(cSecondary, t);
    const sparkle = cN300.clone().lerp(cN500, 0.6);
    base.lerp(sparkle, 0.18);
    colors[i * 3 + 0] = base.r;
    colors[i * 3 + 1] = base.g;
    colors[i * 3 + 2] = base.b;
  }

  const pointsGeo = new THREE.BufferGeometry();
  pointsGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  pointsGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const pointsMat = new THREE.PointsMaterial({
    size: 0.06,
    vertexColors: true,
    transparent: true,
    opacity: 0.95,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  const points = new THREE.Points(pointsGeo, pointsMat);
  root.add(points);

  // Random blinks: briefly boost opacity for a handful of points every ~2s.
  const baseOpacity = pointsMat.opacity;
  const blinkState = new Float32Array(pointCount); // 0..1 intensity per point
  let lastBlinkAt = 0;
  const BLINK_EVERY_MS = 2000;

  const triggerBlink = () => {
    // choose 6-14 random points
    const count = 6 + Math.floor(Math.random() * 9);
    for (let k = 0; k < count; k++) {
      const idx = Math.floor(Math.random() * pointCount);
      blinkState[idx] = 1.0;
    }
  };

  // Build faint edges for nearby points (static).
  const threshold = 1.15;
  const maxEdgesPerPoint = 2;
  const edgePositions = [];
  const edgeColors = [];
  /** Indices into `positions` — each pulse walks line segments va→vb between real points */
  const edgeEndsMeta = [];
  /** @type {number[][]} */
  const adjacency = Array.from({ length: pointCount }, () => []);

  const registerEdgeVertices = (ia, ib, segIdx) => {
    adjacency[ia].push({ ei: segIdx, nv: ib });
    adjacency[ib].push({ ei: segIdx, nv: ia });
  };

  // Cheap-ish neighbor scan: compare each point with a limited forward window.
  for (let i = 0; i < pointCount; i++) {
    let edges = 0;
    const ax = positions[i * 3 + 0];
    const ay = positions[i * 3 + 1];
    const az = positions[i * 3 + 2];

    for (let j = i + 1; j < Math.min(pointCount, i + 28); j++) {
      const bx = positions[j * 3 + 0];
      const by = positions[j * 3 + 1];
      const bz = positions[j * 3 + 2];

      const dx = ax - bx;
      const dy = ay - by;
      const dz = az - bz;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d > threshold) continue;

      const segIdx = edgeEndsMeta.length;
      edgeEndsMeta.push({ ia: i, ib: j });
      registerEdgeVertices(i, j, segIdx);

      edgePositions.push(ax, ay, az, bx, by, bz);

      const alpha = clamp01(1 - d / threshold);
      const col = cN300.clone().lerp(cPrimary, 0.35);
      edgeColors.push(col.r * alpha, col.g * alpha, col.b * alpha, col.r * alpha, col.g * alpha, col.b * alpha);

      edges++;
      if (edges >= maxEdgesPerPoint) break;
    }
  }

  const edgesGeo = new THREE.BufferGeometry();
  edgesGeo.setAttribute('position', new THREE.Float32BufferAttribute(edgePositions, 3));
  edgesGeo.setAttribute('color', new THREE.Float32BufferAttribute(edgeColors, 3));

  const edgesMat = new THREE.LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  const edges = new THREE.LineSegments(edgesGeo, edgesMat);
  root.add(edges);

  const pulseSegmentCount = edgeEndsMeta.length;
  /** @type {{fromV:number;toV:number;ei:number;t:number;speed:number;phase:number;core:THREE.Mesh;halo:THREE.Mesh}[]} */
  const travelingPulses = [];
  /** Traveling line hits → pooled glowing spheres at vertices (0.5s bloom). */
  /** @type {{active:boolean;vtxIdx:number;startMs:number;core:THREE.Mesh;halo:THREE.Mesh}[]} */
  let vertexBursts = [];
  const VERTEX_BURST_MS = 500;
  let spawnVertexBurst = () => {};
  let updateVertexBurstsFn = () => {};

  const pulseP0 = new THREE.Vector3();
  const pulseP1 = new THREE.Vector3();
  const pulseTan = new THREE.Vector3();
  const pulseScratch = new THREE.Vector3();
  const pulseQuat = new THREE.Quaternion();
  const Y_AXIS = new THREE.Vector3(0, 1, 0);

  const jumpPulseToNeighborEdge = (p) => {
    const arrive = p.toV;
    const opts = adjacency[arrive];
    if (!opts || opts.length === 0) return;
    const pick = opts[Math.floor(Math.random() * opts.length)];
    const nextV = pick.nv;
    p.fromV = arrive;
    p.toV = nextV;
    p.ei = pick.ei;
  };

  const orientAndPlaceWirePulse = (p) => {
    for (let tryDepth = 0; tryDepth < 12; tryDepth++) {
      const ia = p.fromV * 3;
      const ib = p.toV * 3;
      pulseP0.set(positions[ia], positions[ia + 1], positions[ia + 2]);
      pulseP1.set(positions[ib], positions[ib + 1], positions[ib + 2]);

      pulseTan.copy(pulseP1).sub(pulseP0);
      const edgeLen = pulseTan.length();
      if (edgeLen < 1e-8) {
        jumpPulseToNeighborEdge(p);
        continue;
      }
      pulseTan.multiplyScalar(1 / edgeLen);

      const tt = clamp01(p.t);
      pulseScratch.copy(pulseP0).lerp(pulseP1, tt);

      pulseQuat.setFromUnitVectors(Y_AXIS, pulseTan);
      p.core.quaternion.copy(pulseQuat);
      p.halo.quaternion.copy(pulseQuat);
      p.core.position.copy(pulseScratch);
      p.halo.position.copy(pulseScratch);
      return;
    }
  };

  if (pulseSegmentCount > 0) {
    const pulseCoreGeo = new THREE.CylinderGeometry(0.011, 0.013, 0.08, 8, 1, false);
    const pulseHaloGeo = new THREE.CylinderGeometry(0.02, 0.024, 0.155, 8, 1, false);
    const pulseCoreMat = new THREE.MeshBasicMaterial({
      color: 0xfff8a8,
      transparent: true,
      opacity: 0.94,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const pulseHaloMat = new THREE.MeshBasicMaterial({
      color: 0xfff4d8,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    const PULSE_COUNT = 7;
    for (let p = 0; p < PULSE_COUNT; p++) {
      const core = new THREE.Mesh(pulseCoreGeo, pulseCoreMat);
      const halo = new THREE.Mesh(pulseHaloGeo, pulseHaloMat);
      root.add(core, halo);

      let ei = Math.floor(Math.random() * pulseSegmentCount);
      const meta = edgeEndsMeta[ei];
      const flip = Math.random() < 0.5;

      travelingPulses.push({
        fromV: flip ? meta.ib : meta.ia,
        toV: flip ? meta.ia : meta.ib,
        ei,
        t: Math.random(),
        speed: 0.92 + Math.random() * 1.05,
        phase: Math.random() * Math.PI * 2,
        core,
        halo,
      });
    }

    for (let i = 0; i < travelingPulses.length; i++) {
      orientAndPlaceWirePulse(travelingPulses[i]);
    }

    const burstCoreGeo = new THREE.SphereGeometry(0.026, 10, 10);
    const burstGlowGeo = new THREE.SphereGeometry(0.055, 10, 10);
    const burstCoreTpl = new THREE.MeshBasicMaterial({
      color: 0xfffdee,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const burstGlowTpl = new THREE.MeshBasicMaterial({
      color: 0xffee88,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    const BURST_POOL = Math.max(travelingPulses.length * 4, 20);
    for (let bi = 0; bi < BURST_POOL; bi++) {
      const core = new THREE.Mesh(burstCoreGeo, burstCoreTpl.clone());
      const halo = new THREE.Mesh(burstGlowGeo, burstGlowTpl.clone());
      core.visible = false;
      halo.visible = false;
      core.renderOrder = 2;
      halo.renderOrder = 1;
      root.add(core, halo);
      vertexBursts.push({ active: false, vtxIdx: 0, startMs: 0, core, halo });
    }

    spawnVertexBurst = (vtxIdx) => {
      if (vtxIdx < 0 || vtxIdx >= pointCount) return;
      const nowMs = performance.now();
      let slot = vertexBursts.find((b) => !b.active);
      if (!slot) {
        slot = vertexBursts[0];
        let shortestLeft = VERTEX_BURST_MS + 999;
        for (let j = 0; j < vertexBursts.length; j++) {
          const b = vertexBursts[j];
          if (!b.active) {
            slot = b;
            shortestLeft = -1;
            break;
          }
          const left = VERTEX_BURST_MS - (nowMs - b.startMs);
          if (left < shortestLeft) {
            shortestLeft = left;
            slot = b;
          }
        }
      }
      slot.active = true;
      slot.vtxIdx = vtxIdx;
      slot.startMs = nowMs;
      slot.core.visible = true;
      slot.halo.visible = true;
      slot.core.scale.setScalar(1);
      slot.halo.scale.setScalar(1);
    };

    updateVertexBurstsFn = (nowWallMs) => {
      for (let bi = 0; bi < vertexBursts.length; bi++) {
        const b = vertexBursts[bi];
        if (!b.active && !b.core.visible) continue;

        const elapsed = nowWallMs - b.startMs;
        if (!b.active || elapsed >= VERTEX_BURST_MS) {
          b.active = false;
          b.core.visible = false;
          b.halo.visible = false;
          b.core.scale.setScalar(1);
          b.halo.scale.setScalar(1);
          b.core.material.opacity = 0;
          b.halo.material.opacity = 0;
          continue;
        }

        const vx = b.vtxIdx * 3;
        b.core.position.set(positions[vx], positions[vx + 1], positions[vx + 2]);
        b.halo.position.copy(b.core.position);

        const t01 = clamp01(elapsed / VERTEX_BURST_MS);
        const env = Math.sin(Math.PI * t01);
        const envGlow = env * env;

        b.core.scale.setScalar(0.2 + env * 0.5);
        b.halo.scale.setScalar(1.05 + envGlow * 0.55);

        b.core.material.opacity = env * 0.94 + envGlow * 0.12;
        b.halo.material.opacity = env * 0.44 + envGlow * 0.36;
      }
    };
  }

  // Size management:
  // On mobile browsers the viewport can "resize" during scroll (address bar show/hide).
  // We avoid reacting to tiny resizes to prevent the hero visual from expanding.
  const FIXED_SIZE = 640;
  const applyFixedSize = () => {
    renderer.setSize(FIXED_SIZE, FIXED_SIZE, false);
    camera.aspect = 1;
    camera.updateProjectionMatrix();
  };

  let raf = 0;
  let running = false;
  let prevFrameTs = performance.now();

  const renderOnce = () => {
    applyFixedSize();
    renderer.render(scene, camera);
  };

  const tick = () => {
    if (!running) return;
    raf = window.requestAnimationFrame(tick);

    const nowTs = performance.now();
    const dt = Math.min(0.066, Math.max(0, (nowTs - prevFrameTs) / 1000));
    prevFrameTs = nowTs;
    const timeS = nowTs * 0.001;

    // Traveling pulses along graph edges toward node positions (oriented cylinders on wires).
    if (travelingPulses.length && pulseSegmentCount > 0) {
      for (let pi = 0; pi < travelingPulses.length; pi++) {
        const p = travelingPulses[pi];
        p.t += p.speed * dt;

        let hops = 0;
        while (p.t >= 1 && hops < 40) {
          p.t -= 1;
          spawnVertexBurst(p.toV);
          jumpPulseToNeighborEdge(p);
          hops++;
        }
        if (p.t >= 1) {
          p.t = 1 - 1e-5;
        }

        orientAndPlaceWirePulse(p);

        const haloThrobRadial = 1 + 0.24 * Math.sin(timeS * 3.4 + p.phase);
        const haloStretch = 1 + 0.2 * Math.sin(timeS * 2.9 + p.phase * 1.08);
        p.halo.scale.set(haloThrobRadial, haloStretch, haloThrobRadial);

        const coreRadial = 0.92 + 0.26 * Math.sin(timeS * 4.9 + p.phase * 1.29);
        const coreStretch = 0.9 + 0.32 * Math.sin(timeS * 4 + p.phase);
        p.core.scale.set(coreRadial, coreStretch, coreRadial);
      }

    }

    updateVertexBurstsFn(nowTs);

    // Gentle rotation + subtle wobble.
    const t = performance.now() * 0.00015;
    root.rotation.y = t * 1.0;
    root.rotation.x = Math.sin(t * 1.7) * 0.08;
    root.rotation.z = Math.cos(t * 1.2) * 0.05;

    // Blink update
    const now = performance.now();
    if (now - lastBlinkAt > BLINK_EVERY_MS) {
      lastBlinkAt = now;
      triggerBlink();
    }
    // decay the blinks
    let blinkSum = 0;
    for (let i = 0; i < pointCount; i++) {
      const v = blinkState[i];
      if (v <= 0) continue;
      const next = Math.max(0, v - 0.08);
      blinkState[i] = next;
      blinkSum += next;
    }
    // apply a subtle global pulse based on active blinks
    const pulse = Math.min(0.18, blinkSum / (pointCount * 8));
    pointsMat.opacity = baseOpacity + pulse;

    renderer.render(scene, camera);
  };

  const start = () => {
    if (running) return;
    running = true;
    prevFrameTs = performance.now();
    applyFixedSize();
    tick();
  };

  const stop = () => {
    running = false;
    if (raf) window.cancelAnimationFrame(raf);
    raf = 0;
  };

  // Respect reduced motion: render once and stop.
  if (prefersReducedMotion) {
    renderOnce();
  } else {
    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries.some((e) => e.isIntersecting);
        if (visible) start();
        else stop();
      },
      { threshold: 0.1 }
    );
    io.observe(mount);
  }

  // Keep the render resolution fixed; no layout-driven resizing.
  window.addEventListener('resize', () => {
    if (prefersReducedMotion) renderOnce();
  }, { passive: true });
  window.addEventListener('orientationchange', () => {
    if (prefersReducedMotion) renderOnce();
  }, { passive: true });
  });
})();

