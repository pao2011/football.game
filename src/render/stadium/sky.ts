import * as THREE from 'three';

export interface LightPreset {
  skyTop: string;
  skyHorizon: string;
  skyBottom: string;
  sunDir: THREE.Vector3; // towards the light
  sunColor: string;
  sunIntensity: number;
  sunVisible: boolean;
  hemiSky: string;
  hemiGround: string;
  hemiIntensity: number;
  fog: string;
  fogNear: number;
  fogFar: number;
  fills: { dir: THREE.Vector3; color: string; intensity: number }[];
  stars: boolean;
  staticShadow: boolean;
  shadowDark: number;
  lightsOn: number; // 0..1 floodlight glow strength
}

export function lightPreset(tod: 'day' | 'sunset' | 'night'): LightPreset {
  switch (tod) {
    case 'sunset':
      return {
        skyTop: '#22356b',
        skyHorizon: '#ff9457',
        skyBottom: '#5b3b4c',
        sunDir: new THREE.Vector3(-0.62, 0.6, 0.5).normalize(),
        sunColor: '#ffb27a',
        sunIntensity: 3.0,
        sunVisible: true,
        hemiSky: '#ffc7a6',
        hemiGround: '#4a4a52',
        hemiIntensity: 1.0,
        fog: '#c98a77',
        fogNear: 150,
        fogFar: 900,
        fills: [{ dir: new THREE.Vector3(0.6, 0.8, -0.4).normalize(), color: '#9fb4ff', intensity: 0.35 }],
        stars: false,
        staticShadow: true,
        shadowDark: 0.22,
        lightsOn: 0.55,
      };
    case 'night':
      return {
        skyTop: '#010309',
        skyHorizon: '#16243f',
        skyBottom: '#0a0f1a',
        sunDir: new THREE.Vector3(0.28, 1.0, 0.42).normalize(),
        sunColor: '#eef3ff',
        sunIntensity: 2.4,
        sunVisible: false,
        hemiSky: '#6a7fae',
        hemiGround: '#1c2a1c',
        hemiIntensity: 0.3,
        fog: '#0b1322',
        fogNear: 150,
        fogFar: 850,
        fills: [
          { dir: new THREE.Vector3(-0.55, 0.85, -0.45).normalize(), color: '#e4ecff', intensity: 0.45 },
          { dir: new THREE.Vector3(0.6, 0.8, -0.45).normalize(), color: '#e4ecff', intensity: 0.3 },
          { dir: new THREE.Vector3(-0.5, 0.8, 0.6).normalize(), color: '#e4ecff', intensity: 0.25 },
        ],
        stars: true,
        staticShadow: true,
        shadowDark: 0.45,
        lightsOn: 1,
      };
    default:
      return {
        skyTop: '#2c6fd0',
        skyHorizon: '#aed2f2',
        skyBottom: '#d9e6f0',
        sunDir: new THREE.Vector3(-0.45, 1.35, 0.7).normalize(),
        sunColor: '#fff3df',
        sunIntensity: 3.2,
        sunVisible: true,
        hemiSky: '#cfe3ff',
        hemiGround: '#5d7a45',
        hemiIntensity: 1.35,
        fog: '#b9d1e8',
        fogNear: 180,
        fogFar: 1000,
        fills: [],
        stars: false,
        staticShadow: true,
        shadowDark: 0.1,
        lightsOn: 0,
      };
  }
}

export function makeSky(p: LightPreset, radius = 800): THREE.Mesh {
  const geo = new THREE.SphereGeometry(radius, 32, 16);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uTop: { value: new THREE.Color(p.skyTop) },
      uHorizon: { value: new THREE.Color(p.skyHorizon) },
      uBottom: { value: new THREE.Color(p.skyBottom) },
      uSun: { value: p.sunDir.clone() },
      uSunColor: { value: new THREE.Color(p.sunColor) },
      uSunVis: { value: p.sunVisible ? 1 : 0 },
      uStars: { value: p.stars ? 1 : 0 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize( position );
        vec4 mv = modelViewMatrix * vec4( position, 1.0 );
        gl_Position = projectionMatrix * mv;
        gl_Position.z = gl_Position.w; // always at the far plane
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uTop; uniform vec3 uHorizon; uniform vec3 uBottom;
      uniform vec3 uSun; uniform vec3 uSunColor; uniform float uSunVis; uniform float uStars;
      varying vec3 vDir;
      float hash( vec3 p ) { p = fract( p * 0.3183099 + 0.1 ); p *= 17.0; return fract( p.x * p.y * p.z * ( p.x + p.y + p.z ) ); }
      void main() {
        vec3 d = normalize( vDir );
        float h = d.y;
        vec3 col = h > 0.0 ? mix( uHorizon, uTop, pow( clamp( h, 0.0, 1.0 ), 0.55 ) ) : mix( uHorizon, uBottom, pow( clamp( -h, 0.0, 1.0 ), 0.35 ) );
        float sd = max( dot( d, normalize( uSun ) ), 0.0 );
        col += uSunColor * uSunVis * ( pow( sd, 6.0 ) * 0.35 + pow( sd, 64.0 ) * 0.6 + smoothstep( 0.9993, 0.9996, sd ) * 6.0 );
        if ( uStars > 0.5 && h > 0.05 ) {
          vec3 c = floor( d * 300.0 );
          float s = hash( c );
          col += vec3( smoothstep( 0.9975, 1.0, s ) ) * 0.9 * smoothstep( 0.05, 0.4, h );
        }
        gl_FragColor = vec4( col, 1.0 );
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const m = new THREE.Mesh(geo, mat);
  m.frustumCulled = false;
  m.renderOrder = -10;
  m.name = 'sky';
  return m;
}
