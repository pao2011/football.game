import * as THREE from 'three';

// Utilería de la ceremonia previa: la copa sobre su pedestal (solo en las finales) y la moneda del sorteo.

const GOLD = () => new THREE.MeshStandardMaterial({ color: 0xe0b23a, metalness: 0.75, roughness: 0.28, emissive: 0x3a2604, emissiveIntensity: 0.6 });

/** Copa dorada (torneado con asas) sobre un pedestal con paño. Origen en el suelo; la copa mide ~0.7 m. */
export function buildTrophy(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'trophy';
  const gold = GOLD();
  // perfil de la copa (radio, altura): base escalonada, tallo, nudo y cuenco
  const prof: [number, number][] = [
    [0, 0], [0.13, 0], [0.13, 0.04], [0.105, 0.05], [0.1, 0.09], [0.06, 0.11], [0.035, 0.16], [0.03, 0.24],
    [0.05, 0.27], [0.03, 0.3], [0.04, 0.34], [0.1, 0.4], [0.15, 0.48], [0.17, 0.57], [0.165, 0.64], [0.175, 0.66],
    [0.168, 0.665], [0.155, 0.6], [0.0, 0.58],
  ];
  const cup = new THREE.Mesh(new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 40), gold);
  cup.castShadow = true;
  // asas: medio toro a cada lado
  for (const s of [-1, 1]) {
    // semicírculo en el plano XY abierto hacia la copa
    const h = new THREE.Mesh(new THREE.TorusGeometry(0.085, 0.017, 10, 20, Math.PI), gold);
    h.position.set(s * 0.15, 0.5, 0);
    h.rotation.z = -s * Math.PI / 2;
    h.castShadow = true;
    cup.add(h);
  }
  // cinta con los colores del torneo
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.103, 0.103, 0.03, 28, 1, true), new THREE.MeshStandardMaterial({ color: 0x1a4fd6, roughness: 0.5 }));
  band.position.y = 0.065;
  cup.add(band);
  // pedestal: columna blanca con tapa negra
  const col = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.38, 1.05, 32), new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.45 }));
  col.position.y = 0.525;
  col.castShadow = true;
  col.receiveShadow = true;
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.05, 32), new THREE.MeshStandardMaterial({ color: 0x111317, roughness: 0.3, metalness: 0.2 }));
  top.position.y = 1.075;
  cup.position.y = 1.1;
  g.add(col, top, cup);
  return g;
}

/** Moneda del sorteo (cara dorada, canto oscuro). */
export function buildCoin(): THREE.Mesh {
  const coin = new THREE.Mesh(
    new THREE.CylinderGeometry(0.06, 0.06, 0.008, 24),
    [new THREE.MeshStandardMaterial({ color: 0x8a6a20, metalness: 0.6, roughness: 0.4 }), GOLD(), new THREE.MeshStandardMaterial({ color: 0xc9ccd2, metalness: 0.7, roughness: 0.3 })],
  );
  coin.name = 'coin';
  return coin;
}

/** Libera geometrías y materiales de un objeto de utilería. */
export function disposeProp(o: THREE.Object3D) {
  o.removeFromParent();
  o.traverse((x) => {
    const mesh = x as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry.dispose();
    for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) m.dispose();
  });
}
