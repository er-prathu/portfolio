/*
 * Real sunset panoramas for the window and the opening, in place of a generated city.
 * Two CC0 photographs from Poly Haven (polyhaven.com, public domain), cropped to the part that is ever in view and
 * stored as small JPEGs in textures/pano/:
 *   skyline  "Sunset JHB Central" — a city skyline at dusk from a rooftop: the view from the room's window
 *   coast    "The Sky is on Fire" — a sea-front promenade at sunset: the first shot of the opening
 * Each is drawn as a true perspective view of the panorama (equirectangular → rectilinear in the shader), so the
 * window behaves like real glass with the world far away, and the opening shots are real camera pans.
 *
 *   Pano.windowView(THREE, { night }) → { material, ready, setNight(n), texture }   (put material on a big plane)
 *   Pano.intro({ renderer, onCaption, onProgress, reduce }) → { play(): Promise<'done'|'skipped'>, skip(), post }
 */
(function () {
  'use strict';
  const PANOS = {
    // crop = [u0, u1, v0, v1] of the full panorama (u: 0..1 around, v: 0 top .. 1 bottom); center = the u that faces "forward"
    skyline: { src: 'textures/pano/skyline.jpg', crop: [.205, .594, .222, .639], center: .345 },
    coast: { src: 'textures/pano/coast.jpg', crop: [.42, .80, .25, .62], center: .63 },
  };
  const GLSL = /* glsl */`
    uniform sampler2D tPano; uniform vec4 uCrop; uniform float uCenter; uniform float uTime; uniform float uWater; uniform float uWide;
    float hsh(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
    vec3 pano(vec3 d){
      float u = uCenter + atan(d.x, -d.z) * uWide / 6.2831853;              // uWide > 1: a wider view than the opening really spans
      float v = .5 - asin(clamp(d.y, -1., 1.)) * uWide / 3.1415927;
      vec2 uv = vec2((u - uCrop.x) / (uCrop.y - uCrop.x), (v - uCrop.z) / (uCrop.w - uCrop.z));
      float below = smoothstep(.0, -.04, d.y);
      // the sea moves: a gentle swell below the horizon, the clouds drift a little above it
      uv.x += uWater * (below * sin(uv.y * 380. + uTime * 1.7) * .0009 + smoothstep(.02, .25, d.y) * uTime * .0011);
      uv.y += uWater * below * sin(uv.x * 220. + uTime * 1.3) * .0006;
      uv = clamp(uv, vec2(.0005), vec2(.9995));
      vec3 c = texture2D(tPano, vec2(uv.x, 1. - uv.y)).rgb;
      // glints on the water where the sun lights it
      float l = dot(c, vec3(.2126, .7152, .0722));
      c += c * uWater * below * smoothstep(.35, .8, l) * (step(.985, hsh(floor(uv * vec2(900., 500.)) + floor(uTime * 6.))) * 2.5);
      return c;
    }`;
  const loadTex = (T, key) => new Promise((ok, no) => new T.TextureLoader().load(PANOS[key].src, t => {
    t.encoding = T.sRGBEncoding; t.wrapS = t.wrapT = T.ClampToEdgeWrapping; t.anisotropy = 4; ok(t);
  }, undefined, no));

  /* ---------- the window: a plane far outside the glass, coloured by the panorama in the direction of each pixel ---------- */
  function windowView(T, opts = {}) {
    const p = PANOS[opts.pano || 'skyline'];
    const material = new T.ShaderMaterial({
      uniforms: { tPano: { value: null }, uCrop: { value: new T.Vector4(...p.crop) }, uCenter: { value: p.center }, uTime: { value: 0 }, uWater: { value: 0 },
        uNight: { value: 0 }, uDim: { value: 0 }, uLift: { value: opts.lift || 0 }, uWide: { value: opts.wide || 1 } },
      depthWrite: false, fog: false,
      vertexShader: 'varying vec3 vWP; void main(){ vec4 w = modelMatrix * vec4(position, 1.); vWP = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
      fragmentShader: GLSL + /* glsl */`
        varying vec3 vWP; uniform float uNight; uniform float uDim; uniform float uLift;
        void main(){
          vec3 d = normalize(vWP - cameraPosition);
          d = normalize(vec3(d.x, d.y + uLift, d.z));                        // look a touch higher: more sky and skyline in the glass, less rooftop
          vec3 c = pano(d);
          c = pow(c, vec3(1.08, 1.16, 1.3)) * vec3(1.16, 1.03, .9);           // the dusk photo, warmed toward golden hour with a little more contrast
          float l = dot(c, vec3(.2126, .7152, .0722));
          vec3 night = c * vec3(.11, .12, .2) + vec3(1., .7, .4) * smoothstep(.55, .9, l) * step(d.y, .2) * .25;   // after dark: the city dims, the brightest windows stay lit
          c = mix(c, night, uNight) * (1. - uDim * .45);                     // overcast and rain grey it down
          gl_FragColor = vec4(c, 1.);
          #include <encodings_fragment>
        }`,
    });
    const ready = loadTex(T, opts.pano || 'skyline').then(t => { material.uniforms.tPano.value = t; return t; });
    return {
      material, ready,
      get texture() { return material.uniforms.tPano.value; },
      setNight(n, dim = 0) { material.uniforms.uNight.value = n; material.uniforms.uDim.value = dim; },
      dispose() { if (material.uniforms.tPano.value) material.uniforms.tPano.value.dispose(); material.dispose(); },
    };
  }

  /* ---------- the opening: two slow camera pans through the panoramas, then the room takes over ---------- */
  function intro(opts) {
    const T = window.THREE, renderer = opts.renderer, reduce = !!opts.reduce;
    const onCaption = opts.onCaption || (() => {}), onProgress = opts.onProgress || (() => {});
    const SHOTS = [
      { pano: 'coast', dur: 7, u: [.52, .615], pitch: [.06, .1], fov: [62, 50], water: 1, caption: 0 },   // along the sea wall into the sunset
      { pano: 'skyline', dur: 6.5, u: [.33, .43], pitch: [.13, .1], fov: [54, 46], water: 0, caption: 1 },  // the city at dusk, from a rooftop
    ];
    const TOTAL = SHOTS.reduce((s, x) => s + x.dur, 0);
    const scene = new T.Scene(), cam = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    const mat = new T.ShaderMaterial({
      uniforms: { tPano: { value: null }, uCrop: { value: new T.Vector4() }, uCenter: { value: 0 }, uTime: { value: 0 }, uWater: { value: 0 },
        uWide: { value: 1 }, uYaw: { value: 0 }, uPitch: { value: 0 }, uTanF: { value: .5 }, uAspect: { value: 1 }, uFade: { value: 1 }, uRes: { value: new T.Vector2(1, 1) } },
      depthTest: false, depthWrite: false,
      vertexShader: 'varying vec2 vP; void main(){ vP = position.xy; gl_Position = vec4(position.xy, 0., 1.); }',
      fragmentShader: GLSL + /* glsl */`
        varying vec2 vP; uniform float uYaw, uPitch, uTanF, uAspect, uFade; uniform vec2 uRes;
        void main(){
          vec3 r = normalize(vec3(vP.x * uTanF * uAspect, vP.y * uTanF, -1.));
          float cp = cos(uPitch), sp = sin(uPitch); r = vec3(r.x, r.y * cp - r.z * sp, r.y * sp + r.z * cp);    // tilt up
          float cy = cos(uYaw), sy = sin(uYaw); r = vec3(r.x * cy + r.z * sy, r.y, -r.x * sy + r.z * cy);        // pan
          vec3 c = pano(r);
          vec2 q = vP * .5;
          c *= mix(.55, 1., smoothstep(.95, .25, length(q * vec2(1., .9)) * 1.3));                             // vignette
          c = mix(vec3(dot(c, vec3(.2126, .7152, .0722))), c, 1.08);
          c += (hsh(gl_FragCoord.xy + fract(uTime * 7.) * 97.) - .5) * .025;                                     // film grain
          gl_FragColor = vec4(mix(c, vec3(0.), uFade), 1.);
          #include <encodings_fragment>
        }`,
    });
    const quad = new T.Mesh(geo, mat); quad.frustumCulled = false; scene.add(quad);
    const tex = {};
    const loaded = Promise.all(['coast', 'skyline'].map(k => loadTex(T, k).then(t => { tex[k] = t; })));
    let raf = 0, clock = 0, last = 0, fade = 1, ending = null, endAt = 0, resolveP = null, lastCap = -1, state = 'idle';
    const ease = t => t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    const lerp = (a, b, t) => a + (b - a) * t;

    function frame(now) {
      raf = requestAnimationFrame(frame);
      const dt = last ? Math.min(.25, (now - last) / 1000) : 0; last = now;   // a long stall (the room building underneath) pauses the film
      clock += dt;
      if (opts.hold != null) { clock = +opts.hold; fade = 0; }               // ?introAt=seconds: hold one moment, for checking shots
      let time = Math.min(clock, TOTAL - .001);
      if (clock >= TOTAL && !ending) finish('done');
      let acc = 0, i = 0;
      while (i < SHOTS.length - 1 && time > acc + SHOTS[i].dur) acc += SHOTS[i++].dur;
      const s = SHOTS[i], p = (time - acc) / s.dur, e = ease(p) * .7 + p * .3;
      const P = PANOS[s.pano], U = mat.uniforms;
      U.tPano.value = tex[s.pano]; U.uCrop.value.set(...P.crop); U.uCenter.value = P.center;
      U.uYaw.value = (P.center - lerp(s.u[0], s.u[1], reduce ? .5 : e)) * Math.PI * 2;
      U.uPitch.value = lerp(s.pitch[0], s.pitch[1], e);
      // fov is horizontal; tall screens get a narrower frame rather than looking past the photograph's top or bottom
      const aspect = innerWidth / innerHeight, tanH = Math.tan(lerp(s.fov[0], s.fov[1], reduce ? .5 : e) * Math.PI / 360);
      U.uTanF.value = Math.tan(Math.min(Math.atan(tanH / aspect), U.uPitch.value + .34));
      U.uAspect.value = innerWidth / innerHeight;
      U.uWater.value = reduce ? 0 : s.water; U.uTime.value = clock;
      if (i !== lastCap) { lastCap = i; onCaption(s.caption); }
      if (i === SHOTS.length - 1 && p > .55 && lastCap < 2) { lastCap = 2; onCaption(2); }
      onProgress(time / TOTAL);
      const dip = i > 0 && time - acc < .5 ? 1 - (time - acc) / .5 : i < SHOTS.length - 1 && acc + s.dur - time < .4 ? 1 - (acc + s.dur - time) / .4 : 0;
      if (opts.hold == null) fade += ((ending ? 1 : 0) - fade) * Math.min(1, dt * (ending ? 2.8 : 1.5));
      U.uFade.value = Math.max(fade, dip);
      renderer.setRenderTarget(null);
      renderer.render(scene, cam);
      if (ending && now >= endAt) done();
    }
    function finish(why) { if (ending) return; ending = why; endAt = performance.now() + (why === 'skipped' ? 450 : 1000); }
    function done() {
      cancelAnimationFrame(raf); state = 'done';
      geo.dispose(); mat.dispose(); Object.values(tex).forEach(t => t.dispose());
      if (resolveP) resolveP(ending);
    }
    return {
      post: true, duration: TOTAL,
      play() {
        if (state !== 'idle') return Promise.resolve('done');
        state = 'playing';
        const p = new Promise(r => { resolveP = r; });
        loaded.then(() => { if (state === 'playing' && !ending) raf = requestAnimationFrame(frame); },
          () => { if (state === 'playing') { ending = 'skipped'; done(); } });   // the photos didn't load: straight to the room
        return p;
      },
      skip() { if (state !== 'playing') return; if (!raf) { ending = 'skipped'; done(); } else finish('skipped'); },
    };
  }

  window.Pano = { windowView, intro, PANOS };
})();
