// Utilidades de mando: elegir el mando "bueno" y avisar al conectar o desconectar.
// Los navegadores solo muestran el mando después de pulsar un botón, y algunos sistemas
// exponen dispositivos falsos (teclados o ratones HID) antes que el mando real.

export function getPads(): Gamepad[] {
  if (typeof navigator === 'undefined' || !navigator.getGamepads) return [];
  try {
    return Array.from(navigator.getGamepads()).filter((p): p is Gamepad => !!p && p.connected);
  } catch {
    return [];
  }
}

/** Mandos reales (descarta dispositivos con pocos botones o ejes), en el orden del navegador. */
export function realPads(): Gamepad[] {
  return getPads().filter((p) => p.buttons.length >= 4 && p.axes.length >= 2);
}

/** Mejor mando disponible: prefiere el de mapa estándar y, si no, el que más botones y ejes tenga. */
export function activePad(): Gamepad | null {
  const pads = getPads().filter((p) => p.buttons.length >= 4 && p.axes.length >= 2);
  if (pads.length === 0) return null;
  const score = (p: Gamepad) => (p.mapping === 'standard' ? 1000 : 0) + p.buttons.length * 2 + p.axes.length;
  return pads.sort((a, b) => score(b) - score(a))[0];
}

/** Ejes del stick derecho (regates): estándar 2/3; en mandos sin mapa estándar suelen ser 2/3 o 2/5. */
export function rightStick(gp: Gamepad): { x: number; y: number } {
  if (gp.mapping === 'standard' || gp.axes.length < 6) return { x: gp.axes[2] ?? 0, y: gp.axes[3] ?? 0 };
  // sin mapa estándar con 6+ ejes (p. ej. DualShock en algunos navegadores): el eje 3 es L2 y el 5 el stick derecho vertical
  const alt = Math.abs(gp.axes[5] ?? 0) > Math.abs(gp.axes[3] ?? 0) ? gp.axes[5] : gp.axes[3];
  return { x: gp.axes[2] ?? 0, y: alt ?? 0 };
}

/** Cruceta: botones 12-15 (estándar) o el eje "hat" (9) de mandos sin mapa estándar. */
export function dpad(gp: Gamepad): { up: boolean; down: boolean; left: boolean; right: boolean } {
  const b = (i: number) => !!gp.buttons[i]?.pressed;
  const d = { up: b(12), down: b(13), left: b(14), right: b(15) };
  if (gp.mapping !== 'standard' && gp.axes.length > 9) {
    // el hat vale -1 (arriba), -0.43 (derecha), 0.14 (abajo), 0.71 (izquierda), 1.29 (reposo), con diagonales entre medias
    const h = gp.axes[9];
    if (Math.abs(h) <= 1.01) {
      const idx = Math.round((h + 1) * 3.5); // 0 arriba, 1 arr.-der., 2 der., 3 ab.-der., 4 abajo, 5 ab.-izq., 6 izq., 7 arr.-izq.
      if ([7, 0, 1].includes(idx)) d.up = true;
      if ([1, 2, 3].includes(idx)) d.right = true;
      if ([3, 4, 5].includes(idx)) d.down = true;
      if ([5, 6, 7].includes(idx)) d.left = true;
    }
  }
  return d;
}

/** Botón pulsado (también como valor analógico: gatillos). */
export function padButton(gp: Gamepad, i: number): boolean {
  const b = gp.buttons[i];
  return !!b && (b.pressed || b.value > 0.4);
}

/** ¿Está permitido el mando en esta página? Dentro de un iframe sin permiso el navegador lo oculta. */
export function gamepadBlocked(): boolean {
  try {
    const fp = (document as unknown as { featurePolicy?: { allowsFeature(f: string): boolean }; permissionsPolicy?: { allowsFeature(f: string): boolean } });
    const pol = fp.permissionsPolicy ?? fp.featurePolicy;
    if (pol && !pol.allowsFeature('gamepad')) return true;
  } catch {
    // sin información: se asume que sí
  }
  return false;
}
