import * as THREE from 'three';

/**
 * Analytic "stadium shadow": light from the sun only reaches a point if the ray towards the sun
 * leaves the bowl through the roof opening (a rounded rectangle at roof height). This gives
 * large, soft, frustum-independent roof/stand shadows on the pitch, stands and crowd for free,
 * while the real shadow map stays tight around the action (players, ball, goals).
 */
export interface StaticShadowUniforms {
  uSSun: { value: THREE.Vector3 };
  uSOn: { value: number };
  uSCore: { value: THREE.Vector2 };
  uSR: { value: number };
  uSH: { value: THREE.Vector2 };
  uSDark: { value: number };
  [k: string]: THREE.IUniform;
}

export function makeStaticShadowUniforms(): StaticShadowUniforms {
  return {
    uSSun: { value: new THREE.Vector3(0, 1, 0) },
    uSOn: { value: 0 },
    uSCore: { value: new THREE.Vector2(50, 30) },
    uSR: { value: 14 },
    uSH: { value: new THREE.Vector2(34, 27) },
    uSDark: { value: 0 },
  };
}

const VERT_DECL = /* glsl */ `
varying vec3 vSWp;
`;

const VERT_CODE = /* glsl */ `
{
  vec4 sWp = vec4( transformed, 1.0 );
  #ifdef USE_INSTANCING
  sWp = instanceMatrix * sWp;
  #endif
  vSWp = ( modelMatrix * sWp ).xyz;
}
`;

const FRAG_DECL = /* glsl */ `
varying vec3 vSWp;
uniform vec3 uSSun;
uniform float uSOn;
uniform vec2 uSCore;
uniform float uSR;
uniform vec2 uSH;
uniform float uSDark;
float sSdRR( vec2 p ) {
  vec2 q = abs( p ) - uSCore;
  return length( max( q, 0.0 ) ) + min( max( q.x, q.y ), 0.0 ) - uSR;
}
float sHeightAt( vec2 q ) {
  vec2 d = abs( q ) - uSCore;
  float nx2;
  if ( d.x > 0.0 && d.y > 0.0 ) { vec2 nn = normalize( d ); nx2 = nn.x * nn.x; }
  else nx2 = d.x > d.y ? 1.0 : 0.0;
  return mix( uSH.x, uSH.y, nx2 );
}
float stadiumShadow( vec3 wp ) {
  if ( uSOn < 0.5 ) return 1.0;
  if ( uSOn > 1.5 ) {
    // night: floodlights are aimed at the pitch, stands get less direct light
    vec2 q = abs( wp.xz ) - vec2( 57.0, 39.0 );
    float dd = length( max( q, 0.0 ) ) + max( wp.y - 1.5, 0.0 ) * 0.9;
    return mix( 1.0, uSDark, smoothstep( 0.0, 26.0, dd ) );
  }
  float h = sHeightAt( wp.xz );
  vec2 q = wp.xz;
  float dh = 0.0;
  for ( int k = 0; k < 2; k++ ) {
    dh = h - wp.y;
    if ( dh <= 0.3 ) return 1.0;
    q = wp.xz + uSSun.xz * ( dh / max( uSSun.y, 0.05 ) );
    h = sHeightAt( q );
  }
  float soft = 0.35 + dh * 0.025;
  float lit = 1.0 - smoothstep( -soft, soft, sSdRR( q ) );
  return mix( uSDark, 1.0, lit );
}
`;

const FRAG_CODE = /* glsl */ `
{
  float sF = stadiumShadow( vSWp );
  reflectedLight.directDiffuse *= sF;
  reflectedLight.directSpecular *= sF;
}
`;

/** Call from onBeforeCompile (MeshStandard / MeshLambert / MeshPhong). */
export function patchStaticShadow(shader: THREE.WebGLProgramParametersWithUniforms, u: StaticShadowUniforms) {
  Object.assign(shader.uniforms, u);
  shader.vertexShader = VERT_DECL + shader.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n' + VERT_CODE);
  shader.fragmentShader = FRAG_DECL + shader.fragmentShader.replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\n' + FRAG_CODE);
}
