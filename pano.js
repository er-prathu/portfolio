/*
 * The coast: real sunset panoramas for the window and a cinematic opening, in place of a generated city.
 * Three CC0 photographs from Poly Haven (polyhaven.com, public domain), all of one coastline (Cape Town):
 *   city   "Signal Hill Dawn"    — the city, the harbour and the mountain from the hill above: the aerial opening
 *   road   "Victoria Sunset"     — the coast road along the sea, into the low sun
 *   coast  "The Sky is on Fire"  — the sea-front promenade: towers, palms, the mountain, the sunset (also the window view)
 * Each is cropped to the part that is ever in view and stored as a small JPEG (a half-size "-m" version for phones).
 * The shader draws them as true perspective views (equirectangular → rectilinear), so the window behaves like glass
 * and the opening shots are real camera moves. On top of the photographs: drifting clouds, a moving sea with glints,
 * car lights on the roads, birds, motes in the light, a bloom on the sun, film grade and grain, and real 3D palms
 * that sway in the wind (desktop: all of it; phones: the lighter images and the cheap effects only).
 *
 *   Pano.windowView(THREE, opts) → { material, ready, setNight(n, dim), tick(t), texture }   (put material on a big plane)
 *   Pano.intro({ renderer, onCaption, onProgress, reduce, lite, hold }) → { play(): Promise<'done'|'skipped'>, skip(), post }
 *   Pano.palms(THREE) → { geometry, sway(material), uniforms }                                (the swaying palm)
 */
(function () {
  'use strict';
  // crop = [u0, u1, v0, v1] of the full panorama (u: 0..1 around, v: 0 top .. 1 bottom); sea = where the water is;
  // road = a line of car lights [uA, vA, uB, vB] from near to far, toward its vanishing point
  const PANOS = {
    city: { src: 'textures/pano/city', crop: [.48, .95, .40, .68], sea: [.52, .73, .5, .535], road: null },
    road: { src: 'textures/pano/road', crop: [.45, .80, .34, .66], sea: [.6, .78, .5, .52], road: [.555, .62, .596, .505] },
    coast: { src: 'textures/pano/coast', crop: [.30, .80, .28, .62], sea: [.392, .80, .5, .62], road: [.300, .4986, .392, .5026] },
  };

  const GLSL = /* glsl */`
    uniform float uTime; uniform float uMotion; uniform float uNight;
    float hsh(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
    float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
      return mix(mix(hsh(i), hsh(i + vec2(1., 0.)), f.x), mix(hsh(i + vec2(0., 1.)), hsh(i + vec2(1., 1.)), f.x), f.y); }
    // car lights along a road: a line in panorama coordinates, slower and smaller toward the far end
    vec3 traffic(vec2 pu, vec4 road){
      if (road.x <= 0.) return vec3(0.);
      vec3 acc = vec3(0.);
      for (int i = 0; i < 8; i++) {
        float fi = float(i), dir = mod(fi, 2.) < .5 ? 1. : -1.;
        float s = fract(hsh(vec2(fi, 3.1)) + uTime * (.012 + .01 * hsh(vec2(fi, 7.7))) * dir);
        float k = pow(s, .7);
        vec2 p = mix(road.xy, road.zw, k); p.y += (dir > 0. ? .0004 : -.0002) * (1. - k);
        float r = mix(.0012, .00035, k);
        vec2 d = (pu - p) / vec2(1., .5); float g = exp(-dot(d, d) / (r * r));
        acc += g * (dir > 0. ? vec3(1., .2, .1) : vec3(1., .9, .7)) * (1. - .6 * k);
      }
      return acc;
    }
    vec2 panoUV(vec3 d, float center, float wide){ return vec2(center + atan(d.x, -d.z) * wide / 6.2831853, .5 - asin(clamp(d.y, -1., 1.)) * wide / 3.1415927); }
    vec3 pano(sampler2D tex, vec4 crop, vec4 sea, vec4 road, vec3 d, float center, float wide, float bloom){
      vec2 pu = panoUV(d, center, wide); float u = pu.x, v = pu.y;
      float sky = smoothstep(.2, .32, sin(asin(clamp(d.y, -1., 1.)) * wide));
      float wat = step(sea.x, u) * step(u, sea.y) * smoothstep(sea.z, sea.z + .004, v) * step(v, sea.w);
      vec2 m = vec2(0.);
      if (uMotion > 0.) {
        float t = uTime;
        m += sky * (vec2(vn(vec2(u * 30., v * 40.) + vec2(t * .05, 0.)), vn(vec2(u * 30., v * 40.) + vec2(9., t * .04))) - .5) * .004;   // clouds drift and change shape
        m += wat * vec2(sin(v * 2600. + t * 1.6) * .00025, sin(u * 900. + t * 1.2) * .00018);                                         // the swell
        m *= uMotion;
      }
      vec2 uv = clamp(vec2((u + m.x - crop.x) / (crop.y - crop.x), (v + m.y - crop.z) / (crop.w - crop.z)), vec2(.0005), vec2(.9995));
      vec2 tuv = vec2(uv.x, 1. - uv.y);
      vec3 c = texture2D(tex, tuv).rgb;
      if (bloom > 0.) { vec3 b = texture2D(tex, tuv, 4.5).rgb + texture2D(tex, tuv, 6.).rgb; c += max(b * .5 - .8, 0.) * bloom * .7 * vec3(1.1, .8, .55); }   // the sun blooms
      float l = dot(c, vec3(.2126, .7152, .0722));
      c += c * uMotion * wat * smoothstep(.55, .9, l) * step(.996, hsh(floor(pu * vec2(9000., 6000.)) + floor(uTime * 5.))) * 1.5;   // glints on the water
      c += traffic(pu, road) * uMotion * (.5 + 1.5 * uNight);
      return c;
    }`;
  const loadTex = (T, src) => new Promise((ok, no) => new T.TextureLoader().load(src, t => {
    t.encoding = T.sRGBEncoding; t.wrapS = t.wrapT = T.ClampToEdgeWrapping; t.anisotropy = 4; ok(t);
  }, undefined, no));
  const v4 = (T, a) => new T.Vector4(...(a || [0, 0, 0, 0]));

  /* ---------- the swaying palm: a leaning, tapering trunk and arching fronds of thin drooping leaflets ---------- */
  function palms(T) {
    const pos = [], col = [], v3 = (x, y, z) => new T.Vector3(x, y, z);
    const tri = (a, b, c, k) => { [a, b, c].forEach(v => { pos.push(v.x, v.y, v.z); col.push(k[0], k[1], k[2]); }); };
    const H = 5.2, lean = .9, spine = t => v3(lean * t * t, H * t, 0);
    for (let i = 0; i < 10; i++) for (let k = 0; k < 7; k++) {
      const s0 = i / 10, s1 = (i + 1) / 10, a0 = k / 7 * Math.PI * 2, a1 = (k + 1) / 7 * Math.PI * 2;
      const r0 = .12 - .045 * s0, r1 = .12 - .045 * s1, c0 = spine(s0), c1 = spine(s1);
      const p = (c, r, a) => v3(c.x + Math.cos(a) * r, c.y, c.z + Math.sin(a) * r);
      const band = i % 2 ? [.3, .22, .16] : [.24, .18, .13];
      tri(p(c0, r0, a0), p(c1, r1, a0), p(c1, r1, a1), band); tri(p(c0, r0, a0), p(c1, r1, a1), p(c0, r0, a1), band);
    }
    const top = spine(1);
    for (let f = 0; f < 13; f++) {
      const az = f / 13 * Math.PI * 2 + (f % 2) * .25, up = [.5, .15, -.2, -.45][f % 4];
      const L = 2.2 + (f % 3) * .35, dir = v3(Math.cos(az), 0, Math.sin(az)), side = v3(-dir.z, 0, dir.x);
      const pt = t => top.clone().addScaledVector(dir, L * t).add(v3(0, L * (up * t - .6 * t * t), 0));
      for (let i = 0; i < 24; i++) {
        const t0 = i / 24, t1 = (i + .45) / 24, a = pt(t0), b = pt(t1), w = Math.sin(Math.PI * Math.min(1, t0 * 1.05 + .08)) * .7;
        const g = [.05 + .03 * t0, .085 + .03 * t0, .04];
        [1, -1].forEach(sg => { const tip = pt(Math.min(1, t0 + .06)).addScaledVector(side, w * sg).add(v3(0, -.42 * w, 0)); tri(a, b, tip, g); tri(b, a, tip, g); });
      }
    }
    const geometry = new T.BufferGeometry();
    geometry.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    geometry.setAttribute('color', new T.Float32BufferAttribute(col, 3));
    geometry.computeVertexNormals();
    const uniforms = { uT: { value: 0 }, uWind: { value: .6 } };
    const SWAY = `
      float hgt = max(position.y, 0.) / 5.2, ph = modelMatrix[3].x * 1.7 + modelMatrix[3].z;
      float sw = (sin(uT * .8 + ph) * .55 + sin(uT * 1.9 + ph * 2.3) * .2) * uWind;
      transformed.x += sw * hgt * hgt * .22;
      transformed.z += cos(uT * .6 + ph) * .1 * uWind * hgt * hgt;
      float fr = max(position.y - 5.0, 0.) + length(position.xz) * .15 * step(5., position.y);
      transformed.y += sin(uT * 2.6 + ph + position.x * 2.1) * .05 * fr * uWind;`;
    const sway = m => {
      m.onBeforeCompile = sh => {
        Object.assign(sh.uniforms, uniforms);
        sh.vertexShader = 'uniform float uT; uniform float uWind;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>' + SWAY);
      };
      return m;
    };
    return { geometry, sway, uniforms };
  }

  /* ---------- the window: a plane far outside the glass, coloured by the panorama in the direction of each pixel ---------- */
  function windowView(T, opts = {}) {
    const P = PANOS.coast;
    const material = new T.ShaderMaterial({
      uniforms: { tPano: { value: null }, uCrop: { value: v4(T, P.crop) }, uSea: { value: v4(T, P.sea) }, uRoad: { value: v4(T, P.road) },
        uCenter: { value: opts.center || .445 }, uTime: { value: 0 }, uMotion: { value: opts.reduce ? 0 : 1 }, uNight: { value: 0 }, uDim: { value: 0 },
        uLift: { value: opts.lift || 0 }, uWide: { value: opts.wide || 1 } },
      depthWrite: false, fog: false,
      vertexShader: 'varying vec3 vWP; void main(){ vec4 w = modelMatrix * vec4(position, 1.); vWP = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
      fragmentShader: GLSL + /* glsl */`
        uniform sampler2D tPano; uniform vec4 uCrop, uSea, uRoad; uniform float uCenter, uWide, uDim, uLift;
        varying vec3 vWP;
        void main(){
          vec3 d = normalize(vWP - cameraPosition);
          d = normalize(vec3(d.x, d.y + uLift, d.z));                        // look a touch higher: more sky and skyline, less promenade
          vec3 c = pano(tPano, uCrop, uSea, uRoad, d, uCenter, uWide, 0.);
          c = pow(c, vec3(1.04, 1.06, 1.1)) * vec3(1.06, 1.02, .96);
          float l = dot(c, vec3(.2126, .7152, .0722));
          vec3 night = c * vec3(.1, .11, .19) + vec3(1., .72, .42) * smoothstep(.5, .85, l) * step(d.y, .16) * .3 + traffic(panoUV(d, uCenter, uWide), uRoad) * uMotion * 1.2;
          c = mix(c, night, uNight) * (1. - uDim * .45);                     // after dark the coast dims; overcast and rain grey it down
          gl_FragColor = vec4(c, 1.);
          #include <encodings_fragment>
        }`,
    });
    const ready = loadTex(T, P.src + (opts.small ? '-m' : '') + '.jpg').then(t => { material.uniforms.tPano.value = t; return t; });
    return {
      material, ready,
      get texture() { return material.uniforms.tPano.value; },
      setNight(n, dim = 0) { material.uniforms.uNight.value = n; material.uniforms.uDim.value = dim; },
      tick(t) { material.uniforms.uTime.value = t; },
      dispose() { if (material.uniforms.tPano.value) material.uniforms.tPano.value.dispose(); material.dispose(); },
    };
  }

  /* ---------- the opening: the city from the hill → the coast road → the promenade, then into the room ----------
     Each shot is a slow camera move inside one panorama. Between shots the camera pushes forward (the lens narrows)
     while the next place dissolves in, wide, as if we travelled on. */
  function intro(opts) {
    const T = window.THREE, renderer = opts.renderer, reduce = !!opts.reduce, lite = !!opts.lite;
    const onCaption = opts.onCaption || (() => {}), onProgress = opts.onProgress || (() => {});
    // u: where the camera looks (start → end), pitch in radians (up +), fov horizontal (start → end), caption at the start
    const SHOTS = [
      { pano: 'city', dur: 6.5, center: .7, u: [.62, .7], pitch: [-.1, -.14], fov: [74, 58], caption: 0 },   // aerial: across the harbour to the city
      { pano: 'road', dur: 5.5, center: .6, u: [.585, .605], pitch: [-.02, 0], fov: [80, 52], caption: -1 },   // down the coast road into the sun
      { pano: 'coast', dur: 6.5, center: .5, u: [.55, .41], pitch: [.05, .07], fov: [60, 50], caption: 1 },   // the promenade: from the sunset to the towers and palms
    ];
    const X = 1.0;   // the travel dissolve between shots, seconds
    let total = 0; const starts = SHOTS.map(s => { const t0 = total; total += s.dur; return t0; });
    const TOTAL = total;
    const scene = new T.Scene(), cam = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    const side = () => ({ tPano: { value: null }, uCrop: { value: new T.Vector4() }, uSea: { value: new T.Vector4() }, uRoad: { value: new T.Vector4() },
      uCenter: { value: .5 }, uYaw: { value: 0 }, uPitch: { value: 0 }, uTanF: { value: .5 } });
    const A = side(), B = side();
    const ren = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k + 'B', v]));
    const mat = new T.ShaderMaterial({
      uniforms: Object.assign({ uTime: { value: 0 }, uMotion: { value: reduce ? 0 : 1 }, uNight: { value: 0 }, uAspect: { value: 1 }, uFade: { value: 1 }, uMix: { value: 0 } }, A, ren(B)),
      defines: lite ? { LITE: 1 } : {},
      depthTest: false, depthWrite: false,
      vertexShader: 'varying vec2 vP; void main(){ vP = position.xy; gl_Position = vec4(position.xy, 0., 1.); }',
      fragmentShader: GLSL + /* glsl */`
        uniform sampler2D tPano, tPanoB; uniform vec4 uCrop, uSea, uRoad, uCropB, uSeaB, uRoadB;
        uniform float uCenter, uYaw, uPitch, uTanF, uCenterB, uYawB, uPitchB, uTanFB, uAspect, uFade, uMix;
        varying vec2 vP;
        vec3 ray(float yaw, float pitch, float tanF){
          vec3 r = normalize(vec3(vP.x * tanF * uAspect, vP.y * tanF, -1.));
          float cp = cos(pitch), sp = sin(pitch); r = vec3(r.x, r.y * cp - r.z * sp, r.y * sp + r.z * cp);    // tilt
          float cy = cos(yaw), sy = sin(yaw); return vec3(r.x * cy + r.z * sy, r.y, -r.x * sy + r.z * cy);    // pan
        }
        // a few gulls far off, wings beating: two short strokes each
        float birds(vec2 p){
          float a = 0.;
          for (int i = 0; i < 5; i++) {
            float fi = float(i);
            vec2 c = vec2(fract(hsh(vec2(fi, 1.)) + uTime * (.012 + .008 * hsh(vec2(fi, 2.)))) * 2.6 - 1.3, .25 + .4 * hsh(vec2(fi, 3.)) + .03 * sin(uTime * .7 + fi));
            float s = .012 + .01 * hsh(vec2(fi, 4.)), f = sin(uTime * 7. + fi * 2.) * .5 + .5;
            vec2 q = (p - c) / s; q.x = abs(q.x);
            vec2 e = vec2(1., .25 + .55 * f);
            float h = clamp(dot(q, e) / dot(e, e), 0., 1.);
            a = max(a, smoothstep(.16, .04, length(q - e * h)));
          }
          return a;
        }
        void main(){
          vec3 c = pano(tPano, uCrop, uSea, uRoad, ray(uYaw, uPitch, uTanF), uCenter, 1.,
          #ifdef LITE
            0.);
          #else
            1.);
          #endif
          if (uMix > 0.) c = mix(c, pano(tPanoB, uCropB, uSeaB, uRoadB, ray(uYawB, uPitchB, uTanFB), uCenterB, 1., 0.), uMix);
          vec2 sp = vec2(vP.x * uAspect, vP.y);
          #ifndef LITE
            c = mix(c, vec3(.06, .04, .05), birds(sp) * .8 * uMotion);
            // motes drifting in the low sun
            vec2 g = sp * 9. + vec2(uTime * .25, -uTime * .12); vec2 id = floor(g), f = fract(g) - .5 - (vec2(hsh(id), hsh(id + 7.)) - .5) * .6;
            c += vec3(1., .78, .5) * smoothstep(.06, 0., length(f)) * step(.93, hsh(id + 3.)) * .25 * uMotion;
          #endif
          // film look: a soft s-curve, teal in the shadows, warm highlights, vignette, grain
          float l = dot(c, vec3(.2126, .7152, .0722));
          c = mix(c, c * c * (3. - 2. * c), .25);
          c += vec3(-.015, .01, .03) * (1. - l) + vec3(.035, .01, -.02) * l;
          c *= mix(.5, 1., smoothstep(1.05, .3, length(vP * .5 * vec2(1., .9)) * 1.3));
          c += (hsh(gl_FragCoord.xy + fract(uTime * 7.) * 97.) - .5) * .028;
          gl_FragColor = vec4(mix(clamp(c, 0., 1.), vec3(0.), uFade), 1.);
          #include <encodings_fragment>
        }`,
    });
    const quad = new T.Mesh(geo, mat); quad.frustumCulled = false; scene.add(quad);

    // real 3D palms in front of the promenade shot, swaying; they turn with the camera like the photograph does
    const pScene = new T.Scene(), pCam = new T.PerspectiveCamera(50, 1, .1, 200);
    pCam.rotation.order = 'YXZ';
    const palm = palms(T);
    const pMat = palm.sway(new T.MeshBasicMaterial({ color: 0x07060a, side: T.DoubleSide, toneMapped: false }));   // backlit by the sunset: silhouettes
    const coastC = SHOTS[2].center;
    [[.385, 12, -1.6, 1.7], [.35, 16, -1.6, 1.5], [.31, 24, -1.6, 1.4]].forEach(([u, dist, y, sc]) => {   // along the promenade, on the land side of the sea wall
      const a = (u - coastC) * Math.PI * 2, m = new T.Mesh(palm.geometry, pMat);
      m.position.set(Math.sin(a) * dist, y, -Math.cos(a) * dist); m.scale.setScalar(sc); m.rotation.y = u * 40; m.frustumCulled = false;
      pScene.add(m);
    });

    const keys = [...new Set(SHOTS.map(s => s.pano))], tex = {};
    const loaded = Promise.all(keys.map(k => loadTex(T, PANOS[k].src + (lite ? '-m' : '') + '.jpg').then(t => { tex[k] = t; })));
    let raf = 0, clock = 0, last = 0, fade = 1, ending = null, endAt = 0, resolveP = null, lastCap = -9, state = 'idle';
    const ease = t => t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    const lerp = (a, b, t) => a + (b - a) * t;
    function aim(U, i, p, extraZoom) {   // set one side's uniforms for shot i at progress p (0..1, may run past 1 into the push)
      const s = SHOTS[i], P = PANOS[s.pano], e = reduce ? .5 : ease(Math.min(1, Math.max(0, p))) * .7 + Math.min(1, Math.max(0, p)) * .3;
      U.tPano.value = tex[s.pano]; U.uCrop.value.set(...P.crop); U.uSea.value.set(...P.sea); U.uRoad.value.set(...(P.road || [0, 0, 0, 0]));
      U.uCenter.value = s.center;
      U.uYaw.value = (s.center - lerp(s.u[0], s.u[1], e)) * Math.PI * 2;
      U.uPitch.value = lerp(s.pitch[0], s.pitch[1], e);
      const aspect = innerWidth / innerHeight, tanH = Math.tan(lerp(s.fov[0], s.fov[1], e) * Math.PI / 360) / (extraZoom || 1);
      // fov is horizontal; tall screens get a narrower frame rather than looking past the photograph's top or bottom
      const top = (.5 - P.crop[2]) * Math.PI, bottom = (.5 - P.crop[3]) * Math.PI, pitch = U.uPitch.value;
      U.uTanF.value = Math.tan(Math.min(Math.atan(tanH / aspect), pitch - bottom - .02, top - pitch - .02));
      return U;
    }
    const sideB = Object.fromEntries(Object.keys(B).map(k => [k, mat.uniforms[k + 'B']]));
    const sideA = Object.fromEntries(Object.keys(A).map(k => [k, mat.uniforms[k]]));

    function frame(now) {
      raf = requestAnimationFrame(frame);
      const dt = last ? Math.min(.25, (now - last) / 1000) : 0; last = now;   // a long stall (the room building underneath) pauses the film
      clock += dt;
      if (opts.hold != null) { clock = +opts.hold; fade = 0; }               // ?introAt=seconds: hold one moment, for checking shots
      const time = Math.min(clock, TOTAL - .001);
      if (clock >= TOTAL && !ending) finish('done');
      let i = 0; while (i < SHOTS.length - 1 && time >= starts[i + 1]) i++;
      const p = (time - starts[i]) / SHOTS[i].dur, U = mat.uniforms;
      aim(sideA, i, p, 1);
      // the travel: in the last X seconds the lens pushes in and the next place dissolves in
      const left = starts[i] + SHOTS[i].dur - time;
      if (i < SHOTS.length - 1 && left < X) {
        const k = 1 - left / X, kk = k * k * (3 - 2 * k);
        aim(sideA, i, p, 1 + kk * 1.4);
        aim(sideB, i + 1, -.08 * (1 - kk), 1 / (1 + (1 - kk) * .35));
        U.uMix.value = kk;
      } else U.uMix.value = 0;
      U.uAspect.value = innerWidth / innerHeight; U.uTime.value = clock;
      const cap = SHOTS[i].caption; if (cap !== lastCap) { lastCap = cap; onCaption(cap); }
      onProgress(time / TOTAL);
      if (opts.hold == null) fade += ((ending ? 1 : 0) - fade) * Math.min(1, dt * (ending ? 2.8 : 1.5));
      U.uFade.value = fade;
      renderer.setRenderTarget(null);
      renderer.autoClear = true; renderer.render(scene, cam);
      // palms: only in the promenade shot (and dissolving in with it)
      const pAlpha = i === 2 ? 1 : (i === 1 && U.uMix.value > .6 ? (U.uMix.value - .6) / .4 : 0);
      if (pAlpha > 0 && fade < .95) {
        const s = i === 2 ? sideA : sideB;
        pCam.rotation.set(s.uPitch.value, s.uYaw.value, 0);
        pCam.aspect = innerWidth / innerHeight; pCam.fov = 2 * Math.atan(s.uTanF.value) * 180 / Math.PI; pCam.updateProjectionMatrix();
        palm.uniforms.uT.value = reduce ? 0 : clock; palm.uniforms.uWind.value = .9;
        pMat.opacity = pAlpha * (1 - fade); pMat.transparent = pMat.opacity < 1;
        renderer.autoClear = false; renderer.render(pScene, pCam); renderer.autoClear = true;
      }
      if (ending && now >= endAt) done();
    }
    function finish(why) { if (ending) return; ending = why; endAt = performance.now() + (why === 'skipped' ? 450 : 1000); }
    function done() {
      cancelAnimationFrame(raf); state = 'done';
      geo.dispose(); mat.dispose(); pMat.dispose(); palm.geometry.dispose(); Object.values(tex).forEach(t => t.dispose());
      if (resolveP) resolveP(ending);
    }
    return {
      post: true, duration: TOTAL,
      play() {
        if (state !== 'idle') return Promise.resolve('done');
        state = 'playing';
        const p = new Promise(r => { resolveP = r; });
        loaded.then(() => { if (state === 'playing' && !ending) raf = requestAnimationFrame(frame); },
          () => { if (state === 'playing') { ending = 'skipped'; done(); } });   // the photographs didn't load: straight to the room
        return p;
      },
      skip() { if (state !== 'playing') return; if (!raf) { ending = 'skipped'; done(); } else finish('skipped'); },
    };
  }

  window.Pano = { windowView, intro, palms, PANOS };
})();
