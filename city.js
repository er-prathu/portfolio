/*
 * City intro: a cinematic opening before the desk. An original coastal city at sunset, built entirely on the GPU
 * (no models or textures to download): sky with moving clouds, animated ocean, a street grid with thousands of
 * instanced towers whose windows reflect the sky by day and light up as the sun sets, palms that sway, traffic,
 * street lights, and a filmic post chain (bloom, sun shafts, depth of field, colour grade).
 *
 *   const intro = CityIntro.create({ renderer, tier });   // tier: 'high' (desktop), 'mid' (capable phone/tablet), 'low'
 *   intro.play().then(result => ...);                     // 'done' | 'skipped' | 'slow' (frame rate too low: cut short)
 *   intro.skip();
 *
 * Three shots: A aerial over the bay → B the coast road at street level → C crane up an apartment tower to one lit
 * window, which dissolves into the desk's own opening. Uses the page's THREE (r147) and shares its WebGL renderer,
 * so a phone never holds two GPU contexts.
 */
(function () {
  'use strict';

  /* ---------------- shared GLSL ---------------- */
  const NOISE = /* glsl */`
    float h12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
    float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f);
      return mix(mix(h12(i), h12(i+vec2(1.,0.)), f.x), mix(h12(i+vec2(0.,1.)), h12(i+vec2(1.,1.)), f.x), f.y); }
    float fbm(vec2 p){ float s = 0., a = .5; for (int i = 0; i < 5; i++) { s += a * vnoise(p); p = p * 2.03 + 17.1; a *= .5; } return s; }
  `;
  const SKY = /* glsl */`
    uniform vec3 uSunDir; uniform vec3 uSunCol; uniform float uNight; uniform float uTime;
    vec3 skyBase(vec3 d){
      float h = d.y;
      vec3 zen = mix(vec3(.05,.1,.26), vec3(.004,.008,.024), uNight);
      vec3 mid = mix(vec3(.42,.22,.26), vec3(.025,.022,.055), uNight);
      vec3 hor = mix(vec3(1.5,.52,.18), vec3(.14,.06,.07), uNight);
      float sd = max(dot(normalize(vec3(d.x, 0., d.z)), normalize(vec3(uSunDir.x, 0., uSunDir.z))), 0.);
      hor *= .55 + .75 * pow(sd, 3.);                       // the horizon glows hottest under the sun
      vec3 c = h < .09 ? mix(hor, mid, smoothstep(0., .09, h)) : mix(mid, zen, smoothstep(.09, .5, h));
      if (h < 0.) c = hor * mix(.8, .35, clamp(-h * 6., 0., 1.));
      float s = max(dot(d, uSunDir), 0.);
      c += uSunCol * (pow(s, 6.) * .28 + pow(s, 48.) * .6);   // atmospheric glow around the sun
      return c;
    }
  `;
  const FOG = /* glsl */`
    uniform vec3 uFogCol; uniform float uFogDen;
    vec3 aerial(vec3 col, vec3 wp){
      vec3 v = wp - cameraPosition; float d = length(v); v /= d;
      float f = 1. - exp(-d * uFogDen * mix(1., .55, clamp(wp.y / 300., 0., 1.)));
      vec3 fc = uFogCol + uSunCol * pow(max(dot(v, uSunDir), 0.), 8.) * .55;   // sunlight scattering in the haze
      return mix(col, fc, f);
    }
  `;

  const create = (opts = {}) => {
    const T = window.THREE;
    if (!T) throw new Error('CityIntro needs THREE');
    const tier = opts.tier || 'high';
    const HIGH = tier === 'high', LOW = tier === 'low';
    const WIN = opts.mode === 'window';   // a live view for the room's window instead of the intro film
    const ownRenderer = !opts.renderer;
    const renderer = opts.renderer || new T.WebGLRenderer({ canvas: opts.canvas, antialias: true, powerPreference: 'high-performance' });
    const reduce = !!opts.reduce;
    const onCaption = opts.onCaption || (() => {});
    const onProgress = opts.onProgress || (() => {});

    /* ---------- render path: HDR target + post when the GPU can render to float, else straight to screen ---------- */
    const gl = renderer.getContext(), isGL2 = renderer.capabilities.isWebGL2;
    const floatRT = isGL2 ? renderer.extensions.has('EXT_color_buffer_float') || renderer.extensions.has('EXT_color_buffer_half_float')
      : renderer.extensions.has('EXT_color_buffer_half_float') && renderer.extensions.has('OES_texture_half_float');
    const POST = !WIN && !LOW && floatRT;
    const DEPTH = HIGH && POST && (isGL2 || renderer.extensions.has('WEBGL_depth_texture'));
    const SHADOWS = HIGH && !WIN;

    const saved = { toneMapping: renderer.toneMapping, exposure: renderer.toneMappingExposure, autoClear: renderer.autoClear, shadowAuto: renderer.shadowMap.autoUpdate, pr: renderer.getPixelRatio() };
    if (!WIN) { renderer.toneMapping = POST ? T.NoToneMapping : T.ACESFilmicToneMapping; renderer.toneMappingExposure = 1; }

    const scene = new T.Scene();
    const camera = new T.PerspectiveCamera(42, innerWidth / innerHeight, .5, 16000);
    const U = {
      uTime: { value: 0 }, uNight: { value: 0 }, uSunDir: { value: new T.Vector3() }, uSunCol: { value: new T.Color() },
      uFogCol: { value: new T.Color() }, uFogDen: { value: HIGH ? .00017 : .00022 },
    };
    const sunLight = new T.DirectionalLight(0xffffff, 1);
    const hemi = new T.HemisphereLight(0x9fb2d6, 0x3a2a20, .5);
    scene.add(sunLight, sunLight.target, hemi);
    if (SHADOWS) {
      sunLight.castShadow = true;
      sunLight.shadow.mapSize.set(2048, 2048);
      sunLight.shadow.bias = -.0004; sunLight.shadow.normalBias = .6;
    }

    let sunAz = opts.sunAz != null ? opts.sunAz : -2.32;
    function setTimeOfDay(elev, night) {
      // the sun sets over the sea to the west-south-west
      const az = sunAz, e = elev;
      U.uSunDir.value.set(Math.cos(az) * Math.cos(e), Math.sin(e), Math.sin(az) * Math.cos(e)).normalize();
      U.uNight.value = night;
      const k = Math.max(0, Math.min(1, (elev + .05) / .2));
      U.uSunCol.value.setRGB(1.6 * (.4 + .6 * k), .78 * k * k + .18 * k, .38 * k * k).multiplyScalar(1 - night * .85);
      U.uFogCol.value.setRGB(.5, .27, .2).lerp(new T.Color(.05, .045, .075), night);
      sunLight.position.copy(U.uSunDir.value).multiplyScalar(3000).add(sunLight.target.position);
      sunLight.color.setRGB(1, .62 + .25 * k, .38 + .3 * k);
      sunLight.intensity = Math.max(0, 2.2 * Math.min(1, (elev + .02) / .12)) * (1 - night);
      hemi.color.setRGB(.55, .62, .85).lerp(new T.Color(.12, .14, .26), night);
      hemi.groundColor.setRGB(.42, .28, .2).lerp(new T.Color(.06, .05, .06), night);
      hemi.intensity = .3 - night * .14;
    }

    /* ---------- helper: inject shader code into a standard PBR material (keeps three's lighting, shadows, env) ---------- */
    function patch(mat, { vertexHead = '', vertex = '', fragHead = '', color = '', rough = '', emissive = '', fog = true, beginVertex = '' }) {
      mat.onBeforeCompile = sh => {
        Object.assign(sh.uniforms, U);
        sh.vertexShader = 'varying vec3 vWP;\n' + vertexHead + '\n' + sh.vertexShader
          .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + beginVertex)
          .replace('#include <project_vertex>', `#include <project_vertex>
            vec4 cwp = vec4(transformed, 1.);
            #ifdef USE_INSTANCING
              cwp = instanceMatrix * cwp;
            #endif
            vWP = (modelMatrix * cwp).xyz;
            ${vertex}`);
        sh.fragmentShader = 'varying vec3 vWP;\n' + NOISE + SKY + FOG + fragHead + '\n' + sh.fragmentShader
          .replace('#include <color_fragment>', '#include <color_fragment>\n' + color)
          .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\n' + rough)
          .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n' + emissive)
          .replace('#include <fog_fragment>', fog ? 'gl_FragColor.rgb = aerial(gl_FragColor.rgb, vWP);\n#include <fog_fragment>' : '#include <fog_fragment>');
      };
      return mat;
    }

    /* ================= sky ================= */
    const skyMat = new T.ShaderMaterial({
      uniforms: U, side: T.BackSide, depthWrite: false, fog: false,
      vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.); gl_Position = p.xyww; }',
      fragmentShader: NOISE + SKY + /* glsl */`
        varying vec3 vDir;
        void main(){
          vec3 d = normalize(vDir);
          vec3 c = skyBase(d);
          float s = max(dot(d, uSunDir), 0.);
          c += uSunCol * smoothstep(.99955, .9998, s) * 24.;                          // the sun's disc
          if (d.y > 0.) {
            vec2 uv = d.xz / (d.y + .09) * 1.6 + vec2(uTime * .018, uTime * .006);   // cloud deck, drifting
            float n = fbm(uv) * .75 + fbm(uv * 3.1 - uTime * .02) * .25;
            float cov = smoothstep(.48, .78, n) * smoothstep(0., .14, d.y);
            vec3 lit = mix(vec3(1.25, .62, .48) * (.6 + .8 * pow(s, 4.)), vec3(.08, .08, .13), uNight);
            vec3 dark = mix(vec3(.32, .2, .26), vec3(.02, .02, .04), uNight);
            vec3 cc = mix(dark, lit, smoothstep(.5, .85, n)) + uSunCol * pow(s, 12.) * .9 * (1. - cov * .5);   // silver lining near the sun
            c = mix(c, cc, cov * .85);
            float st = step(.9965, h12(floor(d.xz / (d.y + .3) * 260.))) * smoothstep(.1, .5, d.y) * (1. - cov);
            c += vec3(st) * uNight * 1.4;                                                // stars come out
          }
          gl_FragColor = vec4(c, 1.);
          #include <tonemapping_fragment>
          #include <encodings_fragment>
        }`,
    });
    const sky = new T.Mesh(new T.SphereGeometry(9000, 48, 24), skyMat);
    sky.frustumCulled = false; sky.renderOrder = -1;
    scene.add(sky);

    /* environment map for reflections: the procedural sky, prefiltered (an HDR environment generated on the GPU) */
    const pmrem = new T.PMREMGenerator(renderer);
    const envScene = new T.Scene(); const envSky = new T.Mesh(sky.geometry, skyMat); envScene.add(envSky);
    let envRT = null, envNight = -1;
    function refreshEnv() {
      if (envRT) envRT.dispose();
      envRT = pmrem.fromScene(envScene, .02, .1, 10000);
      scene.environment = envRT.texture; envNight = U.uNight.value;
    }

    /* ================= ocean ================= */
    const oceanMat = new T.ShaderMaterial({
      uniforms: U, fog: false,
      vertexShader: 'varying vec3 vWP; void main(){ vec4 w = modelMatrix * vec4(position, 1.); vWP = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
      fragmentShader: NOISE + SKY + FOG + /* glsl */`
        varying vec3 vWP;
        float wav(vec2 p){
          float t = uTime, h = 0.;
          h += sin(dot(p, vec2(.06, .045)) + t * 1.0) * .5;
          h += sin(dot(p, vec2(-.045, .09)) + t * 1.3) * .35;
          h += (vnoise(p * .28 + vec2(t * .35, t * .2)) - .5) * .7;
          h += (vnoise(p * .9 - vec2(t * .55, -t * .25)) - .5) * .3;
          h += (vnoise(p * 2.6 + vec2(-t * .8, t * .5)) - .5) * .12;
          return h;
        }
        void main(){
          vec3 v = vWP - cameraPosition; float dist = length(v); v /= dist;
          float e = .35, k = mix(.9, .05, clamp(dist / 2400., 0., 1.));
          vec2 p = vWP.xz;
          float hx = (wav(p + vec2(e, 0.)) - wav(p - vec2(e, 0.))) / (2. * e);
          float hz = (wav(p + vec2(0., e)) - wav(p - vec2(0., e))) / (2. * e);
          vec3 n = normalize(vec3(-hx * k, 1., -hz * k));
          vec3 r = reflect(v, n); r.y = abs(r.y);
          float fres = .02 + .98 * pow(1. - max(dot(-v, n), 0.), 5.);
          vec3 refl = skyBase(r);
          float spec = pow(max(dot(r, uSunDir), 0.), mix(900., 180., clamp(dist / 3000., 0., 1.)));
          vec3 deep = mix(vec3(.012, .05, .07), vec3(.004, .008, .016), uNight);
          vec3 sss = vec3(.02, .12, .11) * max(hx + hz + .4, 0.) * (1. - uNight);        // light through the wave crests
          vec3 col = mix(deep + sss, refl, fres) + uSunCol * spec * 18.;
          // city lights shimmer on the water at night
          float lights = smoothstep(.62, .95, vnoise(vec2(p.x * .05, p.y * .6 + uTime * .8))) * smoothstep(-900., -40., p.y);
          col += vec3(1., .6, .3) * lights * uNight * .35;
          // surf rolling onto the beach
          float shore = smoothstep(-26., 0., p.y);
          float surf = smoothstep(.55, 1., sin(p.y * .45 - uTime * 1.6 + vnoise(p * .08) * 4.) * .5 + .5) * shore;
          col = mix(col, vec3(.85, .8, .75) * (.35 + .65 * (1. - uNight)), surf * .55 * (.6 + .4 * vnoise(p * .6 + uTime)));
          col = aerial(col, vWP);
          gl_FragColor = vec4(col, 1.);
          #include <tonemapping_fragment>
          #include <encodings_fragment>
        }`,
    });
    const ocean = new T.Mesh(new T.PlaneGeometry(20000, 9000), oceanMat);
    ocean.rotation.x = -Math.PI / 2; ocean.position.set(0, 0, -4500);
    scene.add(ocean);

    /* ================= ground: beach, promenade, coast road, street grid (one plane, patterned in the shader) ================= */
    const BLOCK = 130, STREET = 16, Z0 = 72, X0 = -2600;
    const groundMat = patch(new T.MeshStandardMaterial({ color: 0xffffff, roughness: .9, metalness: 0 }), {
      fragHead: /* glsl */`
        vec3 gAlb; float gRough; vec3 gEm;
        void ground(vec2 p){
          gEm = vec3(0.); gRough = .9;
          float z = p.y, n = vnoise(p * .25), n2 = vnoise(p * 2.3);
          float lightsOn = smoothstep(.15, .55, uNight);
          if (z < 42.) {                                  // beach: dry sand to wet sand at the water's edge
            vec3 sand = vec3(.5, .38, .25) * (.85 + .15 * n) * (.94 + .06 * n2);
            float wet = smoothstep(12., 0., z + (n - .5) * 6.);
            gAlb = mix(sand, sand * .42, wet); gRough = mix(.95, .18, wet);
          } else if (z < 50.) {                           // promenade
            vec2 t = fract(p / 1.2); float j = step(.04, t.x) * step(.04, t.y);
            gAlb = vec3(.4, .35, .3) * mix(.7, 1., j) * (.9 + .1 * n); gRough = .75;
          } else if (z < 68.) {                           // coast road
            gAlb = vec3(.055) * (.8 + .4 * n2); gRough = .62;
            float dash = step(.5, fract(p.x / 9.));
            float m = smoothstep(.12, 0., abs(z - 58.7)) + smoothstep(.12, 0., abs(z - 59.3));        // double centre line
            gAlb = mix(gAlb, vec3(.75, .58, .18), clamp(m, 0., 1.));
            gAlb = mix(gAlb, vec3(.8), smoothstep(.1, 0., abs(abs(z - 59.) - 4.6)) * dash);           // lane dashes
            gAlb = mix(gAlb, vec3(.8), smoothstep(.1, 0., abs(abs(z - 59.) - 8.4)));                  // edge lines
            float px = mod(p.x, 34.) - 17.;
            float pool = exp(-(px * px) / 70.) * (exp(-pow(z - 51.5, 2.) / 40.) + exp(-pow(z - 66.5, 2.) / 40.));
            gEm = vec3(1., .62, .32) * pool * lightsOn * .9;                                           // street-light pools
          } else if (z < 72.) {
            gAlb = vec3(.5, .48, .45) * (.9 + .1 * n); gRough = .8;
          } else {                                        // city blocks and streets
            vec2 q = vec2(p.x - ${X0.toFixed(1)}, z - ${Z0.toFixed(1)});
            vec2 c = mod(q, ${BLOCK.toFixed(1)}), id = floor(q / ${BLOCK.toFixed(1)});
            float street = step(c.x, ${STREET.toFixed(1)}) + step(c.y, ${STREET.toFixed(1)});
            if (street > 0.) {
              gAlb = vec3(.06) * (.8 + .4 * n2); gRough = .6;
              float along = c.x < ${STREET.toFixed(1)} ? c.y : c.x, across = c.x < ${STREET.toFixed(1)} ? c.x : c.y;
              gAlb = mix(gAlb, vec3(.7), smoothstep(.12, 0., abs(across - 8.)) * step(.5, fract(along / 8.)) * .7);
              float lp = mod(along, 32.) - 16.;
              gEm = vec3(1., .66, .36) * exp(-lp * lp / 50.) * exp(-pow(abs(across - 8.) - 6., 2.) / 10.) * lightsOn * .8;
            } else {
              float park = step(h12(id + 7.), .1);
              float side = step(c.x, ${STREET.toFixed(1)} + 3.) + step(c.y, ${STREET.toFixed(1)} + 3.) + step(${BLOCK.toFixed(1)} - 3., c.x) + step(${BLOCK.toFixed(1)} - 3., c.y);
              gAlb = side > 0. ? vec3(.5, .48, .45) : mix(vec3(.3, .29, .28) * (.8 + .3 * n), vec3(.1, .17, .07) * (.7 + .5 * n), park);
              gRough = .85;
            }
          }
        }`,
      color: 'ground(vWP.xz); diffuseColor.rgb = gAlb;',
      rough: 'roughnessFactor = gRough;',
      emissive: 'totalEmissiveRadiance += gEm * 2.2;',
    });
    const ground = new T.Mesh(new T.PlaneGeometry(10000, 3600), groundMat);
    ground.rotation.x = -Math.PI / 2; ground.position.set(0, 0, 1800); ground.receiveShadow = SHADOWS;
    scene.add(ground);

    /* hills behind the city, hazy with distance */
    {
      const g = new T.PlaneGeometry(14000, 2600, 140, 26); g.rotateX(-Math.PI / 2);
      const pa = g.attributes.position;
      const hn = (x, z) => Math.sin(x * .0011) * .5 + Math.sin(x * .0027 + 1.3) * .3 + Math.sin(x * .0061 + z * .002) * .2;
      for (let i = 0; i < pa.count; i++) {
        const x = pa.getX(i), z = pa.getZ(i), t = (z + 1300) / 2600;
        pa.setY(i, Math.max(0, (hn(x, z) * .5 + .6) * 420 * Math.sin(Math.min(1, t * 1.4) * Math.PI * .5)) - 20);
      }
      g.computeVertexNormals();
      const hills = new T.Mesh(g, patch(new T.MeshStandardMaterial({ color: 0x1a2416, roughness: 1 }), {}));
      hills.position.set(0, 0, 4700);
      scene.add(hills);
    }

    /* ================= buildings: instanced boxes, facades drawn in the shader ================= */
    const rand = (() => { let s = 1337; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();
    const R = (a, b) => a + rand() * (b - a);
    const DOWNTOWN = new T.Vector2(-120, 620);
    const xHalf = HIGH ? 2400 : LOW ? 1300 : 1700, zMax = WIN ? 3000 : HIGH ? 3000 : LOW ? 1700 : 2200;
    const perBlock = HIGH ? 1 : LOW ? .55 : .75;
    const bList = [];
    for (let bx = X0; bx < -X0; bx += BLOCK) {
      if (Math.abs(bx + BLOCK / 2) > xHalf) continue;
      for (let bz = Z0; bz < zMax; bz += BLOCK) {
        const cx = bx + BLOCK / 2, cz = bz + BLOCK / 2;
        const ix = Math.round((bx - X0) / BLOCK), iz = Math.round((bz - Z0) / BLOCK);
        if (((ix * 73856093) ^ (iz * 19349663)) % 10 === 0) continue;     // the odd open block (parks: see the ground shader, roughly)
        const dd = Math.hypot(cx - DOWNTOWN.x, cz - DOWNTOWN.y);
        const front = bz === Z0;                                          // the beachfront row: tall apartment towers
        const core = Math.exp(-dd / 520);
        const sub = core > .35 || front ? 2 : rand() < .5 ? 2 : 3;
        const lot = (BLOCK - STREET - 6) / sub;
        for (let i = 0; i < sub; i++) for (let j = 0; j < sub; j++) {
          if (rand() > perBlock) continue;
          if (rand() < .12 && !front) continue;
          const w = lot * R(.62, .92), d = lot * R(.62, .92);
          let h = front ? R(45, 150) : 10 + R(.3, 1) * (14 + 300 * Math.pow(core, 1.6)) * (rand() < .08 ? 1.8 : 1);
          h = Math.min(h, 420);
          const x = bx + STREET + 3 + lot * (i + .5) + R(-2, 2), z = bz + STREET + 3 + lot * (j + .5) + R(-2, 2);
          const style = h > 90 ? (rand() < .6 ? 2 : 1) : rand() < .25 ? 1 : 0;   // 0 punched windows, 1 ribbon windows, 2 glass curtain wall
          bList.push({ x, z, w, d, h, style, seed: rand() * 100, front });
        }
      }
    }
    // the hero: a slim glass apartment tower on the beachfront, where shot C ends at one lit window
    const HERO = { x: -500, z: 128, w: 30, d: 26, h: 168, style: 2, seed: 41.5, front: true };
    for (let i = bList.length - 1; i >= 0; i--) { const b = bList[i]; if (Math.abs(b.x - HERO.x) < 60 && Math.abs(b.z - HERO.z) < 80) bList.splice(i, 1); }
    bList.push(HERO);

    const bGeo = new T.BoxGeometry(1, 1, 1); bGeo.translate(0, .5, 0);
    const bMat = patch(new T.MeshStandardMaterial({ color: 0xffffff, roughness: .8, metalness: 0, envMapIntensity: .75 }), {
      vertexHead: 'attribute vec3 aSize; attribute vec4 aInfo; varying vec3 vLoc; varying vec3 vObjN; varying vec4 vInfo;',
      beginVertex: 'vLoc = position * aSize; vObjN = normal; vInfo = aInfo;',
      fragHead: /* glsl */`
        varying vec3 vLoc; varying vec3 vObjN; varying vec4 vInfo;
        vec3 bAlb; float bRough; float bMetal; vec3 bEm;
        void facade(){
          float style = vInfo.y, seed = vInfo.x;
          float pick = h12(vec2(seed, 9.));
          vec3 wall = pick < .3 ? vec3(.38, .36, .34) : pick < .55 ? vec3(.5, .42, .33) : pick < .7 ? vec3(.42, .26, .19) : pick < .9 ? vec3(.62, .6, .57) : vec3(.2, .22, .25);
          wall *= .8 + .3 * h12(vec2(seed, 3.));
          bEm = vec3(0.); bRough = .85; bMetal = 0.; bAlb = wall;
          if (vObjN.y > .5) { bAlb = vec3(.2, .2, .21) * (.8 + .4 * vnoise(vLoc.xz * .3)); bRough = .9; return; }   // roof
          float u = abs(vObjN.x) > .5 ? vLoc.z : vLoc.x, v = vLoc.y;
          float bay = style > 1.5 ? 1.6 : style > .5 ? 4. : 3.2, fl = style > 1.5 ? 3.4 : 3.6;
          vec2 cell = floor(vec2(u / bay, v / fl)), f = fract(vec2(u / bay, v / fl));
          float win;
          if (style > 1.5)      win = step(.06, f.x) * step(f.y, .9);                                         // curtain wall
          else if (style > .5)  win = step(.28, f.y) * step(f.y, .86);                                        // ribbon
          else                  win = step(.18, f.x) * step(f.x, .82) * step(.3, f.y) * step(f.y, .84);       // punched
          float ground = 1. - step(5., v);
          float aa = smoothstep(bay * 90., bay * 420., length(vWP - cameraPosition));                          // far away: average, don't shimmer
          win = mix(win, style > 1.5 ? .85 : .45, aa);
          float rr = h12(cell + seed * 7.1 + vec2(vObjN.x * 3., vObjN.z * 5.));
          vec3 glass = mix(vec3(.03, .045, .055), vec3(.06, .07, .07), rr);
          if (style > 1.5) glass = mix(vec3(.025, .05, .07), vec3(.05, .06, .05), h12(vec2(seed, 2.)));
          bAlb = mix(wall, glass, win);
          bRough = mix(.85, .05 + .08 * rr, win); bMetal = mix(0., .95, win);
          float lit = step(rr, mix(.0, .36, smoothstep(.0, .8, uNight + (rr - .5) * .3)));                     // more windows light up as night falls
          vec3 warm = mix(vec3(1., .72, .42), vec3(.85, .9, 1.), step(.75, h12(cell + seed)));
          float inner = .7 + .3 * smoothstep(.0, .6, f.y);
          bEm = warm * win * lit * inner * (.55 + .9 * h12(cell * 1.7 + seed)) * (1. - aa * .4);
          bEm += vec3(1., .78, .5) * ground * win * smoothstep(.1, .5, uNight) * 3.;                          // shopfronts
          bAlb *= mix(.55, 1., smoothstep(0., 12., v));                                                       // grounded: darker at the base
        }`,
      color: 'facade(); diffuseColor.rgb = bAlb;',
      rough: 'roughnessFactor = bRough; metalnessFactor = bMetal;',
      emissive: 'totalEmissiveRadiance += bEm;',
    });
    // chunks of 4×4 blocks, each its own instanced mesh, so the camera only draws what's in view (frustum culling)
    const chunks = new Map();
    bList.forEach(b => { const k = Math.floor((b.x - X0) / (BLOCK * 4)) + ':' + Math.floor((b.z - Z0) / (BLOCK * 4)); (chunks.get(k) || chunks.set(k, []).get(k)).push(b); });
    const m4 = new T.Matrix4();
    chunks.forEach(list => {
      const geo = bGeo.clone();
      const size = new Float32Array(list.length * 3), info = new Float32Array(list.length * 4);
      const box3 = new T.Box3();
      list.forEach((b, i) => {
        size.set([b.w, b.h, b.d], i * 3); info.set([b.seed, b.style, 0, 0], i * 4);
        box3.expandByPoint(new T.Vector3(b.x - b.w / 2, 0, b.z - b.d / 2)); box3.expandByPoint(new T.Vector3(b.x + b.w / 2, b.h, b.z + b.d / 2));
      });
      geo.setAttribute('aSize', new T.InstancedBufferAttribute(size, 3));
      geo.setAttribute('aInfo', new T.InstancedBufferAttribute(info, 4));
      geo.boundingSphere = box3.getBoundingSphere(new T.Sphere());
      const im = new T.InstancedMesh(geo, bMat, list.length);
      list.forEach((b, i) => im.setMatrixAt(i, m4.makeScale(b.w, b.h, b.d).setPosition(b.x, 0, b.z)));
      im.castShadow = im.receiveShadow = SHADOWS;
      scene.add(im);
    });
    // aviation beacons on the tallest towers
    const tall = bList.filter(b => b.h > 160);

    /* the lit window at the end of shot C: someone's desk, the lamp on */
    const winTex = (() => {
      const c = document.createElement('canvas'); c.width = 256; c.height = 256; const g = c.getContext('2d');
      const gr = g.createRadialGradient(80, 120, 10, 128, 140, 210); gr.addColorStop(0, '#ffd59a'); gr.addColorStop(.45, '#b06a35'); gr.addColorStop(1, '#2a160c');
      g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
      g.fillStyle = '#1a0f09'; g.fillRect(0, 186, 256, 70);                     // desk
      g.fillStyle = '#120a06'; g.fillRect(120, 120, 80, 62); g.fillRect(150, 182, 20, 6);   // television
      g.fillStyle = '#5a8f96'; g.globalAlpha = .55; g.fillRect(126, 126, 68, 50); g.globalAlpha = 1;
      g.strokeStyle = '#120a06'; g.lineWidth = 5; g.beginPath(); g.moveTo(60, 186); g.lineTo(66, 140); g.lineTo(86, 118); g.stroke();   // lamp
      g.fillStyle = '#c4502e'; g.beginPath(); g.moveTo(78, 104); g.lineTo(106, 112); g.lineTo(96, 132); g.closePath(); g.fill();
      g.fillStyle = 'rgba(40,20,10,.75)'; g.fillRect(0, 0, 26, 256); g.fillRect(230, 0, 26, 256);   // curtains
      const t = new T.CanvasTexture(c); t.encoding = T.sRGBEncoding; return t;
    })();
    const heroWin = new T.Mesh(new T.PlaneGeometry(3.1, 3.0), new T.MeshBasicMaterial({ map: winTex, color: new T.Color(2.2, 2.2, 2.2), toneMapped: true }));
    const HW = new T.Vector3(HERO.x + 1.65, 3.4 * 26 + 1.53, HERO.z - HERO.d / 2 - .06);   // two bays on the 26th floor, sea-facing side, on the facade grid
    heroWin.position.copy(HW); heroWin.rotation.y = Math.PI;
    scene.add(heroWin);

    /* ================= palms: one procedural palm, instanced, swaying in the breeze ================= */
    function palmGeometry() {
      const pos = [], col = [], nrm = [];
      const tri = (a, b, c, ca) => {
        const n = new T.Vector3().subVectors(b, a).cross(new T.Vector3().subVectors(c, a)).normalize();
        [a, b, c].forEach(v => { pos.push(v.x, v.y, v.z); nrm.push(n.x, n.y, n.z); col.push(ca[0], ca[1], ca[2]); });
      };
      const H = 11, seg = 9, sides = 7, lean = 1.4;
      const spine = s => new T.Vector3(lean * s * s, H * s, 0);
      for (let i = 0; i < seg; i++) for (let k = 0; k < sides; k++) {         // trunk: a tapering, leaning column with ring bands
        const s0 = i / seg, s1 = (i + 1) / seg, a0 = k / sides * Math.PI * 2, a1 = (k + 1) / sides * Math.PI * 2;
        const r0 = .26 - .1 * s0, r1 = .26 - .1 * s1, c0 = spine(s0), c1 = spine(s1);
        const p = (c, r, a) => new T.Vector3(c.x + Math.cos(a) * r, c.y, c.z + Math.sin(a) * r);
        const band = i % 2 ? [.36, .27, .19] : [.3, .22, .15];
        tri(p(c0, r0, a0), p(c1, r1, a0), p(c1, r1, a1), band); tri(p(c0, r0, a0), p(c1, r1, a1), p(c0, r0, a1), band);
      }
      const top = spine(1);
      const fronds = 10;
      for (let f = 0; f < fronds; f++) {                                         // fronds: an arching spine with leaflets either side
        const az = f / fronds * Math.PI * 2 + (f % 2) * .2, up = f % 3 === 0 ? .55 : f % 3 === 1 ? .15 : -.25;
        const L = 4.6 + (f % 4) * .4, dir = new T.Vector3(Math.cos(az), 0, Math.sin(az)), side = new T.Vector3(-dir.z, 0, dir.x);
        const pt = s => top.clone().addScaledVector(dir, L * s).add(new T.Vector3(0, L * (up * s - .55 * s * s), 0));
        const steps = 12;
        for (let i = 0; i < steps; i++) {
          const s0 = i / steps, s1 = (i + 1) / steps, a = pt(s0), b = pt(s1);
          const w = Math.sin(Math.PI * Math.min(1, s0 * 1.15 + .08)) * 1.25;
          const green = [.12 + .1 * s0, .23 + .06 * s0, .07];
          [1, -1].forEach(sg => {
            const tip = a.clone().lerp(b, .6).addScaledVector(side, w * sg).add(new T.Vector3(0, -.45 * w, 0));
            tri(a, b, tip, green); tri(b, a, tip, green);                          // both faces
          });
        }
      }
      const g = new T.BufferGeometry();
      g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
      g.setAttribute('normal', new T.Float32BufferAttribute(nrm, 3));
      g.setAttribute('color', new T.Float32BufferAttribute(col, 3));
      return g;
    }
    const palmMat = patch(new T.MeshStandardMaterial({ vertexColors: true, roughness: .75, side: T.DoubleSide }), {
      vertexHead: 'uniform float uTime;',
      beginVertex: /* glsl */`
        { vec3 ip = vec3(instanceMatrix[3]);
          float hgt = max(position.y, 0.) / 11.;
          float ph = ip.x * .05 + ip.z * .07;
          float sway = sin(uTime * .9 + ph) * .45 + sin(uTime * 2.1 + ph * 1.7) * .15;
          transformed.x += sway * hgt * hgt * 1.1;
          transformed.z += cos(uTime * .7 + ph) * .25 * hgt * hgt;
          float fr = max(position.y - 10.2, 0.);
          transformed.y += sin(uTime * 3.2 + ph + position.x * 1.3) * .12 * fr * length(position.xz) * .1; }`,
      emissive: 'totalEmissiveRadiance += vColor * uSunCol * .25 * smoothstep(0., .2, uSunDir.y + .05);',   // sunset shining through the leaves
    });
    const palmSpots = [];
    const roadStep = HIGH ? 17 : LOW ? 34 : 24;
    for (let x = -2200; x < 2200; x += roadStep) {
      palmSpots.push([x + R(-3, 3), 47.5 + R(-1, 1)]);                          // promenade row
      if (rand() < .7) palmSpots.push([x + roadStep / 2 + R(-2, 2), 70 + R(-.5, .5)]);   // city-side row
      if (rand() < .25) palmSpots.push([x + R(-8, 8), R(18, 36)]);             // a few on the beach
    }
    for (let i = 0; i < (HIGH ? 260 : LOW ? 60 : 140); i++) palmSpots.push([R(-1800, 1800), Z0 + Math.floor(R(0, 12)) * BLOCK + R(3, 12)]);   // along the streets
    const palms = new T.InstancedMesh(palmGeometry(), palmMat, palmSpots.length);
    palmSpots.forEach(([x, z], i) => {
      const s = R(.8, 1.25);
      m4.makeRotationY(R(0, Math.PI * 2)).scale(new T.Vector3(s, s * R(.9, 1.15), s)).setPosition(x, 0, z);
      palms.setMatrixAt(i, m4);
    });
    palms.castShadow = SHADOWS; palms.frustumCulled = false;
    scene.add(palms);

    /* ================= street lights on the coast road ================= */
    const poleXs = []; for (let x = -2200; x < 2200; x += 34) poleXs.push(x);
    const poleGeo = new T.CylinderGeometry(.08, .12, 9, 6); poleGeo.translate(0, 4.5, 0);
    const poles = new T.InstancedMesh(poleGeo, new T.MeshStandardMaterial({ color: 0x2a2c2e, roughness: .5, metalness: .7 }), poleXs.length * 2);
    poleXs.forEach((x, i) => { poles.setMatrixAt(i * 2, m4.makeTranslation(x, 0, 50.2)); poles.setMatrixAt(i * 2 + 1, m4.makeTranslation(x, 0, 67.8)); });
    poles.frustumCulled = false;
    scene.add(poles);

    /* ================= glows: headlights, tail lights, street lamps, beacons (one point cloud, additive) ================= */
    const carCount = HIGH ? 280 : LOW ? 70 : 140;
    const nLamps = poleXs.length * 2, nBeacons = tall.length;
    const nGlow = carCount * 4 + nLamps + nBeacons;
    const gPos = new Float32Array(nGlow * 3), gCol = new Float32Array(nGlow * 3), gSize = new Float32Array(nGlow);
    const glowGeo = new T.BufferGeometry();
    glowGeo.setAttribute('position', new T.BufferAttribute(gPos, 3).setUsage(T.DynamicDrawUsage));
    glowGeo.setAttribute('color', new T.BufferAttribute(gCol, 3));
    glowGeo.setAttribute('size', new T.BufferAttribute(gSize, 1));
    const glowMat = new T.ShaderMaterial({
      uniforms: Object.assign({ uScale: { value: 600 } }, U), transparent: true, depthWrite: false, blending: T.AdditiveBlending, fog: false,
      vertexShader: /* glsl */`
        attribute vec3 color; attribute float size; uniform float uScale; uniform float uNight; uniform float uFogDen; uniform float uTime;
        varying vec3 vC;
        void main(){
          vec4 mv = modelViewMatrix * vec4(position, 1.); gl_Position = projectionMatrix * mv;
          float d = -mv.z;
          float blink = size < 0. ? step(.5, fract(uTime * .5 + position.x * .01)) : 1.;
          float s = abs(size);
          gl_PointSize = clamp(s * uScale / d, 1.2, 90.);
          vC = color * (.25 + 1.6 * smoothstep(0., .6, uNight)) * exp(-d * uFogDen * .55) * blink * min(1., s * uScale / d / 1.2);
        }`,
      fragmentShader: /* glsl */`
        varying vec3 vC;
        void main(){ vec2 q = gl_PointCoord - .5; float r = dot(q, q) * 4.; float a = exp(-r * 5.) + exp(-r * 40.) * 2.; gl_FragColor = vec4(vC * a, 1.);
          #include <tonemapping_fragment>
          #include <encodings_fragment>
        }`,
    });
    const glow = new T.Points(glowGeo, glowMat); glow.frustumCulled = false;
    scene.add(glow);
    const setGlow = (i, x, y, z, r, g, b, s) => { gPos[i * 3] = x; gPos[i * 3 + 1] = y; gPos[i * 3 + 2] = z; gCol[i * 3] = r; gCol[i * 3 + 1] = g; gCol[i * 3 + 2] = b; gSize[i] = s; };
    let gi = carCount * 4;
    poleXs.forEach(x => { setGlow(gi++, x + .9, 9, 50.6, 4, 2.4, 1.2, 1.1); setGlow(gi++, x - .9, 9, 67.4, 4, 2.4, 1.2, 1.1); });
    tall.forEach(b => setGlow(gi++, b.x, b.h + 3, b.z, 5, .2, .1, -1.6));

    /* ================= traffic ================= */
    const carGeo = (() => {
      const a = new T.BoxGeometry(4.4, .8, 1.85); a.translate(0, .6, 0);
      const b = new T.BoxGeometry(2.3, .62, 1.6); b.translate(-.25, 1.3, 0);
      const pos = [], nrm = [], col = [];
      [[a, [1, 1, 1]], [b, [.06, .07, .08]]].forEach(([g, c]) => {
        const ng = g.toNonIndexed();
        pos.push(...ng.attributes.position.array); nrm.push(...ng.attributes.normal.array);
        for (let i = 0; i < ng.attributes.position.count; i++) col.push(...c);
      });
      const g = new T.BufferGeometry();
      g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new T.Float32BufferAttribute(nrm, 3)); g.setAttribute('color', new T.Float32BufferAttribute(col, 3));
      return g;
    })();
    const cars = new T.InstancedMesh(carGeo, new T.MeshStandardMaterial({ vertexColors: true, roughness: .28, metalness: .55 }), carCount);
    cars.frustumCulled = false; cars.castShadow = SHADOWS;
    const paints = [0xd8d8d8, 0x1d1f22, 0x8a1d1d, 0x24406e, 0xb8b2a6, 0x3d4a3f, 0xe3e1dc, 0x101012, 0x6e6f73, 0xc8a24a];
    const lanes = [];
    // the coast road: two lanes each way, the most traffic
    [[55.6, 1], [57.4, 1], [60.6, -1], [62.4, -1]].forEach(([z, dir]) => lanes.push({ ax: 'x', c: z, dir, from: -2400, len: 4800, w: 4 }));
    // city avenues
    for (let k = 1; k < 10; k++) {
      const z = Z0 + k * BLOCK + STREET / 2; lanes.push({ ax: 'x', c: z - 3, dir: 1, from: -xHalf, len: xHalf * 2, w: 1 }, { ax: 'x', c: z + 3, dir: -1, from: -xHalf, len: xHalf * 2, w: 1 });
    }
    for (let k = 0; k < 40; k += 3) {
      const x = X0 + (k + 8) * BLOCK + STREET / 2; if (Math.abs(x) > xHalf) continue;
      lanes.push({ ax: 'z', c: x - 3, dir: 1, from: Z0, len: zMax - Z0, w: 1 }, { ax: 'z', c: x + 3, dir: -1, from: Z0, len: zMax - Z0, w: 1 });
    }
    const wsum = lanes.reduce((s, l) => s + l.w, 0);
    const carList = [];
    for (let i = 0; i < carCount; i++) {
      let r = rand() * wsum, lane = lanes[0];
      for (const l of lanes) { r -= l.w; if (r <= 0) { lane = l; break; } }
      carList.push({ lane, off: rand() * lane.len, v: (lane.w > 1 ? 16 : 11) + rand() * 6 });
      cars.setColorAt(i, new T.Color(paints[(rand() * paints.length) | 0]));
    }
    scene.add(cars);
    const q = new T.Quaternion(), yAxis = new T.Vector3(0, 1, 0), sc = new T.Vector3(1, 1, 1), cp = new T.Vector3();
    function updateTraffic(t) {
      carList.forEach((c, i) => {
        const L = c.lane, s = ((c.off + c.v * t) % L.len), along = L.dir > 0 ? L.from + s : L.from + L.len - s;
        let dx, dz, x, z;
        if (L.ax === 'x') { x = along; z = L.c; dx = L.dir; dz = 0; } else { x = L.c; z = along; dx = 0; dz = L.dir; }
        q.setFromAxisAngle(yAxis, Math.atan2(-dz, dx));
        cars.setMatrixAt(i, m4.compose(cp.set(x, 0, z), q, sc));
        const sx = -dz * .7, sz = dx * .7;                                   // across the car
        setGlow(i * 4, x + dx * 2.25 + sx, .75, z + dz * 2.25 + sz, 3.2, 2.9, 2.4, .7);
        setGlow(i * 4 + 1, x + dx * 2.25 - sx, .75, z + dz * 2.25 - sz, 3.2, 2.9, 2.4, .7);
        setGlow(i * 4 + 2, x - dx * 2.2 + sx, .8, z - dz * 2.2 + sz, 3.5, .25, .15, .55);
        setGlow(i * 4 + 3, x - dx * 2.2 - sx, .8, z - dz * 2.2 - sz, 3.5, .25, .15, .55);
      });
      cars.instanceMatrix.needsUpdate = true;
      glowGeo.attributes.position.needsUpdate = true;
    }

    /* ================= motes drifting in the low sun, near the lens ================= */
    const MOTES = LOW || WIN ? 0 : 260;
    const mPos = new Float32Array(MOTES * 3); for (let i = 0; i < MOTES * 3; i++) mPos[i] = (Math.random() - .5) * 30;
    const motesGeo = new T.BufferGeometry(); motesGeo.setAttribute('position', new T.BufferAttribute(mPos, 3));
    const motes = new T.Points(motesGeo, new T.ShaderMaterial({
      uniforms: U, transparent: true, depthWrite: false, blending: T.AdditiveBlending,
      vertexShader: 'uniform float uTime; varying float vA; void main(){ vec3 p = position; p.y += sin(uTime * .4 + p.x) * .6; p.x += uTime * .35; p = mod(p + 15., 30.) - 15.; vec4 mv = modelViewMatrix * vec4(p, 1.); gl_Position = projectionMatrix * mv; gl_PointSize = clamp(60. / -mv.z, 1., 6.); vA = smoothstep(30., 4., -mv.z); }',
      fragmentShader: 'uniform vec3 uSunCol; varying float vA; void main(){ float r = length(gl_PointCoord - .5) * 2.; gl_FragColor = vec4(uSunCol * .12 * vA * max(1. - r, 0.), 1.); }',
    }));
    motes.frustumCulled = false;
    if (MOTES) scene.add(motes);

    /* ================= post: HDR target → bloom, sun shafts, depth of field → grade ================= */
    const fsGeo = new T.BufferGeometry();
    fsGeo.setAttribute('position', new T.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    fsGeo.setAttribute('uv', new T.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
    const fsCam = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1), fsScene = new T.Scene(), fsMesh = new T.Mesh(fsGeo); fsMesh.frustumCulled = false; fsScene.add(fsMesh);
    const VS = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }';
    const pass = (mat, target) => { fsMesh.material = mat; renderer.setRenderTarget(target); renderer.render(fsScene, fsCam); };
    const rtOpt = { type: T.HalfFloatType, minFilter: T.LinearFilter, magFilter: T.LinearFilter, depthBuffer: false };
    let rtMain = null, rtB1 = null, rtB1b = null, rtB2 = null, rtB2b = null, rtD = null, rtDb = null, rtRay = null;
    const post = {
      bright: new T.ShaderMaterial({ uniforms: { tSrc: { value: null }, uTexel: { value: new T.Vector2() }, uThr: { value: 1.6 } }, vertexShader: VS,
        fragmentShader: 'uniform sampler2D tSrc; uniform vec2 uTexel; uniform float uThr; varying vec2 vUv; void main(){ vec3 c = (texture2D(tSrc, vUv + uTexel * vec2(-1.,-1.)).rgb + texture2D(tSrc, vUv + uTexel * vec2(1.,-1.)).rgb + texture2D(tSrc, vUv + uTexel * vec2(-1.,1.)).rgb + texture2D(tSrc, vUv + uTexel).rgb) * .25; c = min(c, vec3(40.)); float l = max(c.r, max(c.g, c.b)); gl_FragColor = vec4(c * smoothstep(uThr, uThr * 2.2, l), 1.); }' }),
      down: new T.ShaderMaterial({ uniforms: { tSrc: { value: null }, uTexel: { value: new T.Vector2() } }, vertexShader: VS,
        fragmentShader: 'uniform sampler2D tSrc; uniform vec2 uTexel; varying vec2 vUv; void main(){ gl_FragColor = vec4((texture2D(tSrc, vUv + uTexel * vec2(-1.,-1.)).rgb + texture2D(tSrc, vUv + uTexel * vec2(1.,-1.)).rgb + texture2D(tSrc, vUv + uTexel * vec2(-1.,1.)).rgb + texture2D(tSrc, vUv + uTexel).rgb) * .25, 1.); }' }),
      blur: new T.ShaderMaterial({ uniforms: { tSrc: { value: null }, uDir: { value: new T.Vector2() } }, vertexShader: VS,
        fragmentShader: 'uniform sampler2D tSrc; uniform vec2 uDir; varying vec2 vUv; void main(){ vec3 c = texture2D(tSrc, vUv).rgb * .227; c += (texture2D(tSrc, vUv + uDir * 1.385).rgb + texture2D(tSrc, vUv - uDir * 1.385).rgb) * .316; c += (texture2D(tSrc, vUv + uDir * 3.231).rgb + texture2D(tSrc, vUv - uDir * 3.231).rgb) * .07; gl_FragColor = vec4(c, 1.); }' }),
      rays: new T.ShaderMaterial({ uniforms: { tSrc: { value: null }, tDepth: { value: null }, uSun: { value: new T.Vector2() }, uVis: { value: 0 } }, vertexShader: VS,
        fragmentShader: /* glsl */`
          uniform sampler2D tSrc; uniform sampler2D tDepth; uniform vec2 uSun; uniform float uVis; varying vec2 vUv;
          void main(){
            vec2 d = (vUv - uSun) / 36.; vec2 uv = vUv; float w = 1.; vec3 acc = vec3(0.);
            for (int i = 0; i < 36; i++) { uv -= d; float sky = step(.99999, texture2D(tDepth, uv).r); acc += min(max(texture2D(tSrc, uv).rgb - 1.1, 0.), vec3(6.)) * sky * w; w *= .965; }
            gl_FragColor = vec4(acc / 36. * uVis, 1.);
          }` }),
      final: new T.ShaderMaterial({
        uniforms: { tScene: { value: null }, tB1: { value: null }, tB2: { value: null }, tBlur: { value: null }, tRay: { value: null }, tDepth: { value: null },
          uUse: { value: new T.Vector3() }, uExposure: { value: 1 }, uFocus: { value: 200 }, uAperture: { value: 0 }, uNear: { value: .5 }, uFar: { value: 16000 },
          uFade: { value: 1 }, uFadeCol: { value: new T.Color(0, 0, 0) }, uTime: { value: 0 }, uRes: { value: new T.Vector2() }, uBloom: { value: .9 } },
        vertexShader: VS,
        fragmentShader: /* glsl */`
          uniform sampler2D tScene, tB1, tB2, tBlur, tRay, tDepth; uniform vec3 uUse; uniform float uExposure, uFocus, uAperture, uNear, uFar, uFade, uTime, uBloom; uniform vec3 uFadeCol; uniform vec2 uRes;
          varying vec2 vUv;
          vec3 aces(vec3 x){ return clamp((x * (2.51 * x + .03)) / (x * (2.43 * x + .59) + .14), 0., 1.); }
          float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
          void main(){
            vec2 cuv = vUv - .5;
            vec3 col;
            col.r = texture2D(tScene, .5 + cuv * (1. - .0016 * dot(cuv, cuv) * 4.)).r;      // a touch of lens fringing at the edges
            col.gb = texture2D(tScene, vUv).gb;
            if (uUse.z > 0.) {
              float z = texture2D(tDepth, vUv).r;
              float lz = uNear * uFar / (uFar - z * (uFar - uNear));
              float coc = clamp(abs(lz - uFocus) / lz * uAperture, 0., 1.);
              col = mix(col, texture2D(tBlur, vUv).rgb, coc);
            }
            if (uUse.x > 0.) col += (texture2D(tB1, vUv).rgb * .55 + texture2D(tB2, vUv).rgb * .8) * uBloom;
            if (uUse.y > 0.) col += texture2D(tRay, vUv).rgb * .8;
            col = aces(col * uExposure);
            col = pow(col, vec3(1. / 2.2));
            float l = dot(col, vec3(.2126, .7152, .0722));
            col = mix(vec3(l), col, 1.12);                                                 // a little more saturation
            col += vec3(-.02, .025, .045) * (1. - l) * (1. - l) + vec3(.05, .012, -.035) * l * l;   // teal shadows, warm highlights
            col = mix(col, col * col * (3. - 2. * col), .22);                               // filmic contrast
            col *= mix(.62, 1., smoothstep(.95, .3, length(cuv * vec2(1., .85)) * 1.25));   // vignette
            col += (hash(vUv * uRes + fract(uTime * 7.) * 91.) - .5) * .028;               // film grain
            gl_FragColor = vec4(mix(col, uFadeCol, uFade), 1.);
          }`,
      }),
    };
    function sizeTargets() {
      const pr = renderer.getPixelRatio(), w = Math.max(2, Math.floor(innerWidth * pr)), h = Math.max(2, Math.floor(innerHeight * pr));
      post.final.uniforms.uRes.value.set(w, h);
      if (!POST) return;
      [rtMain, rtB1, rtB1b, rtB2, rtB2b, rtD, rtDb, rtRay].forEach(r => r && r.dispose());
      rtMain = new T.WebGLRenderTarget(w, h, Object.assign({}, rtOpt, { depthBuffer: true }));
      if (DEPTH) { rtMain.depthTexture = new T.DepthTexture(w, h); rtMain.depthTexture.type = T.UnsignedIntType; }
      const q4 = [Math.max(1, w >> 2), Math.max(1, h >> 2)], q8 = [Math.max(1, w >> 3), Math.max(1, h >> 3)], q2 = [Math.max(1, w >> 1), Math.max(1, h >> 1)];
      rtB1 = new T.WebGLRenderTarget(...q4, rtOpt); rtB1b = new T.WebGLRenderTarget(...q4, rtOpt);
      rtB2 = new T.WebGLRenderTarget(...q8, rtOpt); rtB2b = new T.WebGLRenderTarget(...q8, rtOpt);
      if (DEPTH) { rtD = new T.WebGLRenderTarget(...q2, rtOpt); rtDb = new T.WebGLRenderTarget(...q2, rtOpt); rtRay = new T.WebGLRenderTarget(...q4, rtOpt); }
    }
    const blur = (src, tmp, w, h, k) => {
      post.blur.uniforms.tSrc.value = src.texture; post.blur.uniforms.uDir.value.set(k / w, 0); pass(post.blur, tmp);
      post.blur.uniforms.tSrc.value = tmp.texture; post.blur.uniforms.uDir.value.set(0, k / h); pass(post.blur, src);
    };
    const sunNdc = new T.Vector3();
    function renderFrame(shotFx) {
      if (!POST) { renderer.setRenderTarget(null); renderer.render(scene, camera); return; }
      renderer.setRenderTarget(rtMain); renderer.render(scene, camera);
      const W = rtMain.width, H = rtMain.height;
      post.bright.uniforms.tSrc.value = rtMain.texture; post.bright.uniforms.uTexel.value.set(1 / W, 1 / H); pass(post.bright, rtB1);
      blur(rtB1, rtB1b, rtB1.width, rtB1.height, 1.4);
      post.down.uniforms.tSrc.value = rtB1.texture; post.down.uniforms.uTexel.value.set(1 / rtB1.width, 1 / rtB1.height); pass(post.down, rtB2);
      blur(rtB2, rtB2b, rtB2.width, rtB2.height, 2);
      const F = post.final.uniforms;
      F.uUse.value.set(1, 0, 0);
      if (DEPTH) {
        // sun shafts: march toward the sun through the sky pixels
        sunNdc.copy(U.uSunDir.value).multiplyScalar(5000).add(camera.position).project(camera);
        const inFront = sunNdc.z < 1, sx = sunNdc.x * .5 + .5, sy = sunNdc.y * .5 + .5;
        const vis = inFront ? Math.max(0, 1 - Math.max(Math.abs(sunNdc.x), Math.abs(sunNdc.y)) / 1.6) * Math.max(0, 1 - U.uNight.value * 2) : 0;
        if (vis > .01) {
          post.rays.uniforms.tSrc.value = rtMain.texture; post.rays.uniforms.tDepth.value = rtMain.depthTexture;
          post.rays.uniforms.uSun.value.set(sx, sy); post.rays.uniforms.uVis.value = vis; pass(post.rays, rtRay); F.uUse.value.y = 1;
        }
        if (shotFx.aperture > 0) {
          post.down.uniforms.tSrc.value = rtMain.texture; post.down.uniforms.uTexel.value.set(.5 / W, .5 / H); pass(post.down, rtD);
          blur(rtD, rtDb, rtD.width, rtD.height, 2.2); blur(rtD, rtDb, rtD.width, rtD.height, 3.5);
          F.uUse.value.z = 1;
        }
        F.tDepth.value = rtMain.depthTexture; F.tRay.value = rtRay.texture; F.tBlur.value = rtD.texture;
      }
      F.tScene.value = rtMain.texture; F.tB1.value = rtB1.texture; F.tB2.value = rtB2.texture;
      F.uFocus.value = shotFx.focusNow; F.uAperture.value = shotFx.aperture; F.uNear.value = camera.near; F.uFar.value = camera.far;
      F.uTime.value = U.uTime.value;
      pass(post.final, null);
    }

    /* ================= the three shots ================= */
    const V = (x, y, z) => new T.Vector3(x, y, z);
    const curve = pts => new T.CatmullRomCurve3(pts, false, 'centripetal');
    const SHOTS_ = [
      { // A: aerial over the bay, drifting toward downtown with the sun low over the sea
        dur: 7, fov: 42, caption: 0,
        pos: curve([V(1250, 420, -900), V(820, 340, -760), V(420, 280, -620)]),
        look: curve([V(-150, 120, 520), V(-260, 110, 560), V(-380, 100, 520)]),
        sun: [.115, .085], night: [0, .05], focus: 1400, aperture: 0, shadow: { c: V(-100, 0, 500), r: 1500 },
      },
      { // B: the coast road at street level, palms streaming past, traffic both ways
        dur: 6.5, fov: 48, caption: 1,
        pos: curve([V(160, 4.2, 44), V(60, 3.6, 45), V(-50, 3.2, 46)]),
        look: curve([V(-300, 8, -110), V(-400, 10, -130), V(-500, 12, -140)]),
        sun: [.06, .025], night: [.12, .3], focus: 26, aperture: .28, shadow: { c: V(-80, 0, 70), r: 260 },
      },
      { // C: crane up the glass tower toward one lit window
        dur: 6, fov: 40, caption: 2,
        pos: curve([V(HW.x + 70, 30, HW.z - 160), V(HW.x + 22, 70, HW.z - 60), V(HW.x, HW.y, HW.z - 4.6)]),
        look: curve([V(HW.x - 20, 110, HW.z), V(HW.x, HW.y + 4, HW.z), V(HW.x, HW.y, HW.z)]),
        sun: [.01, -.05], night: [.45, .75], focus: 0, aperture: .22, shadow: { c: V(HERO.x, 0, HERO.z), r: 300 },
      },
    ];
    if (innerWidth / innerHeight < 1) {   // portrait: a wider lens keeps the subject in frame, and the road shot turns toward the palms
      SHOTS_.forEach(s => { s.fov = Math.min(72, s.fov * 1.55); });
      SHOTS_[1].look = curve([V(-300, 9, 20), V(-400, 11, 0), V(-500, 13, -20)]);
    }
    const TOTAL = SHOTS_.reduce((s, x) => s + x.dur, 0);
    const ease = t => t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    const easeOut = t => 1 - Math.pow(1 - t, 2.2);
    const lerp = (a, b, t) => a + (b - a) * t;
    const lookAt = new T.Vector3();

    function placeShot(i, p, time) {
      const s = SHOTS_[i];
      const e = i === 2 ? ease(p) * .92 + easeOut(p) * .08 : ease(p) * .6 + p * .4;
      s.pos.getPointAt(Math.min(1, e), camera.position);
      s.look.getPointAt(Math.min(1, e), lookAt);
      if (!reduce) {                                                       // a little handheld life in the low shots
        const k = i === 1 ? .08 : i === 2 ? .03 : .4;
        camera.position.x += Math.sin(time * 1.3) * k; camera.position.y += Math.sin(time * 1.7 + 1) * k * .6;
      }
      camera.fov = s.fov; camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
      camera.lookAt(lookAt);
      if (i === 1) camera.rotateZ(Math.sin(time * .5) * .006);
      setTimeOfDay(lerp(s.sun[0], s.sun[1], p), lerp(s.night[0], s.night[1], p));
      if (SHADOWS) {
        const sc2 = sunLight.shadow.camera, r = s.shadow.r;
        sunLight.target.position.copy(s.shadow.c);
        sunLight.position.copy(U.uSunDir.value).multiplyScalar(3000).add(s.shadow.c);
        if (sc2.right !== r) { sc2.left = -r; sc2.right = r; sc2.top = r; sc2.bottom = -r; sc2.near = 100; sc2.far = 7000; sc2.updateProjectionMatrix(); }
      }
      if (!s.focus) s.focusNow = camera.position.distanceTo(HW); else s.focusNow = s.focus;   // C keeps the window sharp as it nears
      motes.visible = i === 1;
      sky.position.copy(camera.position);
      motes.position.copy(camera.position);
      return s;
    }

    /* ================= window mode: the room's view, rendered live into a texture ================= */
    if (WIN) {
      // a beachfront flat ~16 floors up, looking west along the coast: towers on the left, the coast road and palms below, the sun setting over the sea
      if (opts.sunAz == null) sunAz = -3.28;   // the sun sits just right of the skyline from this window
      const VIEW = new T.Vector3(...(opts.view || [1500, 48, -70]));
      const yawQ = new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), opts.yaw != null ? opts.yaw : 1.85);
      // looking a little further down than the room camera lifts the skyline into the glass (the sill and desk hide the street)
      const pitchQ = new T.Quaternion().setFromAxisAngle(new T.Vector3(1, 0, 0), opts.pitch != null ? opts.pitch : -.1);
      const rt = new T.WebGLRenderTarget(2, 2, { type: floatRT ? T.HalfFloatType : T.UnsignedByteType, depthBuffer: true });
      const scale = HIGH ? .75 : LOW ? .4 : .5;
      const eye = new T.Vector3(0, 1.5, 1), off = new T.Vector3(), size = new T.Vector2();
      camera.far = 12000; scene.remove(heroWin);
      let lastNight = -1;
      setTimeOfDay(.085, 0); refreshEnv();
      return {
        texture: rt.texture, mode: 'window',
        setTime(day, overcast = 0) {
          const k = Math.max(0, Math.min(1, day));
          const night = Math.min(1, (1 - k) * 1.05);
          setTimeOfDay(-.11 + .195 * k, night);                                   // the room's "day" is the golden hour here
          U.uFogDen.value = (HIGH ? .00017 : .00022) * (1 + overcast * 1.2);
          if (Math.abs(night - lastNight) > (HIGH ? .1 : .45)) { lastNight = night; refreshEnv(); }
        },
        render(roomCam, t) {
          renderer.getDrawingBufferSize(size);
          const w = Math.max(2, Math.round(size.x * scale)), h = Math.max(2, Math.round(size.y * scale));
          if (rt.width !== w || rt.height !== h) { rt.setSize(w, h); glowMat.uniforms.uScale.value = h * .9; }
          camera.fov = roomCam.fov; camera.aspect = roomCam.aspect; camera.zoom = roomCam.zoom;
          const v = roomCam.view;
          if (v && v.enabled) camera.setViewOffset(v.fullWidth, v.fullHeight, v.offsetX, v.offsetY, v.width, v.height); else camera.clearViewOffset();
          camera.updateProjectionMatrix();
          camera.quaternion.copy(yawQ).multiply(roomCam.quaternion).multiply(pitchQ);
          off.copy(roomCam.position).sub(eye).applyQuaternion(yawQ).multiplyScalar(4);   // a step in the room is a few metres up here: a hint of parallax
          camera.position.copy(VIEW).add(off);
          U.uTime.value = t;
          updateTraffic(t + 40);
          sky.position.copy(camera.position);
          const prev = renderer.getRenderTarget();
          renderer.setRenderTarget(rt); renderer.render(scene, camera); renderer.setRenderTarget(prev);
        },
        tune(o) { if (o.sunAz != null) sunAz = o.sunAz; if (o.view) VIEW.set(...o.view); if (o.yaw != null) yawQ.setFromAxisAngle(new T.Vector3(0, 1, 0), o.yaw); if (o.pitch != null) pitchQ.setFromAxisAngle(new T.Vector3(1, 0, 0), o.pitch); },
        dispose() { rt.dispose(); cleanup(); },
      };
    }

    /* ================= run ================= */
    let raf = 0, t0 = 0, clock = 0, resolveP = null, state = 'idle', fade = { v: 1, target: 0, col: new T.Color(0, 0, 0) }, endAt = Infinity, ending = null;
    let frames = 0, slowT = 0, lastNow = 0, lastCap = -1;
    let dpr = Math.min(devicePixelRatio || 1, HIGH ? 1.5 : LOW ? 1 : 1.25);
    const resize = () => { renderer.setPixelRatio(dpr); renderer.setSize(innerWidth, innerHeight, false); sizeTargets(); glowMat.uniforms.uScale.value = innerHeight * dpr * .9; };

    function frame(now) {
      raf = requestAnimationFrame(frame);
      if (!t0) t0 = now;
      const dt = Math.min(.1, (now - (lastNow || now)) / 1000); lastNow = now;
      // performance: lower the resolution if frames are slow; give up gracefully if it is still too slow
      frames++;
      if (renderer.getPixelRatio() !== dpr) resize();                      // the host page changed the resolution under us
      if (frames > 20 && dt > 0) {
        slowT = slowT * .95 + dt * .05;
        if (frames % 45 === 0 && slowT > 1 / 38 && dpr > .75) { dpr = Math.max(.75, dpr - .25); resize(); }
        if (frames > 120 && slowT > 1 / 16 && !ending) finish('slow');
      }
      clock += dt;                                                         // a stall (the page building underneath) pauses the film instead of skipping it
      let time = opts.hold != null ? +opts.hold : clock;
      if (opts.hold != null) fade.v = 0;
      if (time >= TOTAL && !ending) finish('done');
      time = Math.min(time, TOTAL - .001);
      U.uTime.value = now / 1000 % 1000;
      let acc = 0, idx = 0;
      while (idx < SHOTS_.length - 1 && time > acc + SHOTS_[idx].dur) acc += SHOTS_[idx++].dur;
      const p = (time - acc) / SHOTS_[idx].dur;
      const s = placeShot(idx, p, time);
      // dip through black between shots
      const edge = Math.min(time - acc, acc + s.dur - time);
      const dip = idx > 0 && time - acc < .45 ? 1 - (time - acc) / .45 : idx < SHOTS_.length - 1 && acc + s.dur - time < .35 ? 1 - (acc + s.dur - time) / .35 : 0;
      fade.v += (fade.target - fade.v) * Math.min(1, dt * (ending ? 2.6 : 1.6));
      const f = Math.max(fade.v, Math.min(1, dip * 1.05));
      if (idx !== lastCap) { lastCap = idx; onCaption(s.caption); }
      onProgress(time / TOTAL);
      // the env map follows the sky as the sun sets (desktop only: it costs a few ms)
      if (HIGH && Math.abs(U.uNight.value - envNight) > .12) refreshEnv();
      updateTraffic(time + 40);
      if (SHADOWS) renderer.shadowMap.needsUpdate = true;
      post.final.uniforms.uFade.value = f; post.final.uniforms.uFadeCol.value.copy(fade.col);
      post.final.uniforms.uExposure.value = .72 + U.uNight.value * .55;
      renderFrame(s);
      if (!POST && opts.fadeEl) opts.fadeEl.style.opacity = f.toFixed(3);
      if (ending && now >= endAt) done(ending);
      void edge;
    }
    function finish(why) {
      if (ending) return;
      ending = why; fade.target = 1;
      if (why === 'done') fade.col.setRGB(.06, .035, .02);                // into the warm dark of the room, where the lamp is about to flicker on
      endAt = performance.now() + (why === 'skipped' ? 450 : 1100);
    }
    function done(why) {
      cancelAnimationFrame(raf); state = 'done';
      removeEventListener('resize', resize);
      cleanup();
      if (resolveP) resolveP(why);
    }
    function cleanup() {
      if (WIN) { if (envRT) envRT.dispose(); pmrem.dispose(); scene.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) [].concat(o.material).forEach(m => m.dispose()); }); return; }
      renderer.setRenderTarget(null);
      renderer.toneMapping = saved.toneMapping; renderer.toneMappingExposure = saved.exposure; renderer.autoClear = saved.autoClear;
      renderer.shadowMap.autoUpdate = saved.shadowAuto; renderer.setPixelRatio(saved.pr);
      [rtMain, rtB1, rtB1b, rtB2, rtB2b, rtD, rtDb, rtRay].forEach(r => r && r.dispose());
      if (envRT) envRT.dispose(); pmrem.dispose();
      scene.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) [].concat(o.material).forEach(m => { if (m.map) m.map.dispose(); m.dispose(); }); });
      Object.values(post).forEach(m => m.dispose()); fsGeo.dispose();
      if (sunLight.shadow.map) sunLight.shadow.map.dispose();
      if (ownRenderer) renderer.dispose();
    }

    return {
      tier, post: POST, shadows: SHADOWS, duration: TOTAL, buildings: bList.length,
      play() {
        if (state !== 'idle') return Promise.resolve('done');
        state = 'playing';
        resize(); addEventListener('resize', resize);
        setTimeOfDay(SHOTS_[0].sun[0], 0); refreshEnv();
        try { renderer.compile(scene, camera); } catch (e) { /* compiles on first draw instead */ }
        raf = requestAnimationFrame(frame);
        return new Promise(r => { resolveP = r; });
      },
      skip() { if (state === 'playing') finish('skipped'); },
      // for screenshots and checks: jump to a moment (seconds) and hold there
      _scene: scene, _camera: camera, _uniforms: U,
    };
  };

  window.CityIntro = { create, createWindow: (o = {}) => create(Object.assign({}, o, { mode: 'window' })) };
})();
