// Dimensiones reglamentarias (metros). Sistema de coordenadas:
//  x = a lo largo del campo (líneas de gol en ±HALF_LENGTH)
//  z = a lo ancho (líneas de banda en ±HALF_WIDTH)
//  y = altura
export const PITCH_LENGTH = 105;
export const PITCH_WIDTH = 68;
export const HALF_LENGTH = PITCH_LENGTH / 2;
export const HALF_WIDTH = PITCH_WIDTH / 2;

export const GOAL_WIDTH = 7.32;
export const GOAL_HALF_WIDTH = GOAL_WIDTH / 2;
export const GOAL_HEIGHT = 2.44;
export const GOAL_DEPTH = 2.0; // profundidad de la red a ras de suelo
export const GOAL_DEPTH_TOP = 1.5; // profundidad de la red a la altura del travesaño
export const POST_RADIUS = 0.06;

export const PENALTY_AREA_DEPTH = 16.5;
export const PENALTY_AREA_HALF_WIDTH = GOAL_HALF_WIDTH + 16.5;
export const GOAL_AREA_DEPTH = 5.5;
export const GOAL_AREA_HALF_WIDTH = GOAL_HALF_WIDTH + 5.5;
export const PENALTY_SPOT_DIST = 11;
export const CENTER_CIRCLE_RADIUS = 9.15;
export const CORNER_ARC_RADIUS = 1;

export const BALL_RADIUS = 0.11;
export const GRAVITY = 9.81;

export const SIM_HZ = 60;
export const SIM_DT = 1 / SIM_HZ;

export const PLAYER_RADIUS = 0.38; // radio de colisión del cuerpo
export const PLAYER_HEIGHT = 1.8;
export const CONTROL_RADIUS = 0.75; // distancia a la que un jugador puede controlar el balón
