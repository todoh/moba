// ==================================================
// ### LÓGICA DE CÁMARA (CAMERA.JS) ###
// ==================================================

// Offset de la cámara (scroll)
export let cameraOffset = { x: 0, y: 0 }; 

// Constantes BASE de la proyección isométrica
export const BASE_ISO_TILE_W_HALF = 128; // Ancho base
export const BASE_ISO_TILE_H_HALF = 64; // Alto base

// --- VARIABLES DE ZOOM ---
export let currentZoom = 1.0;     // Nivel de zoom actual
const MIN_ZOOM = 0.3;      // Zoom mínimo
const MAX_ZOOM = 2.5;      // Zoom máximo
export const ZOOM_STEP = 1.1;     // Factor de multiplicación

// --- ¡MODIFICADO! VARIABLES DE ROTACIÓN ---
let rotationDirection = 0; // -1 (izquierda), 0 (parado), 1 (derecha)
export let currentCameraAngle = 0.0; // El ángulo actual
const CONTINUOUS_ROTATION_SPEED = 0.02; // Velocidad de giro (radianes por frame)

// (Ya no necesitamos targetCameraAngle, ROTATION_STEP, o ANGLE_LERP_AMOUNT)

/**
 * Función de ayuda: Interpolación Lineal (LERP)
 * Suaviza un movimiento de A a B.
 * (La dejamos por si main.js la usa para otra cosa)
 */
function lerp(start, end, amt) {
    return (1 - amt) * start + amt * end;
}

/**
 * ¡NUEVO! Inicia la rotación a la izquierda.
 */
export function startRotatingLeft() {
    rotationDirection = -1;
}

/**
 * ¡NUEVO! Inicia la rotación a la derecha.
 */
export function startRotatingRight() {
    rotationDirection = 1;
}

/**
 * ¡NUEVO! Detiene cualquier rotación.
 */
export function stopRotating() {
    rotationDirection = 0;
}

/**
 * ¡MODIFICADO! Función de ayuda para actualizar el ángulo de la cámara.
 * Ahora aplica una rotación continua basada en la dirección.
 */
export function updateCameraAngle() {
    // Aplicar la velocidad de rotación
    currentCameraAngle += rotationDirection * CONTINUOUS_ROTATION_SPEED;
}


/**
 * ¡MODIFICADO!
 * Proyecta coordenadas del mundo 3D (x, y, z) a coordenadas de pantalla 2D (x, y).
 * (Sin cambios en la lógica interna, pero ahora usa el currentCameraAngle actualizado)
 */
export function project(worldX, worldY, worldZ) {
    // Calcula el tamaño del tile según el zoom
    const tileW = BASE_ISO_TILE_W_HALF * currentZoom;
    const tileH = BASE_ISO_TILE_H_HALF * currentZoom;
    
    // La altura Y del mundo se escala por la altura visual de un tile
    const verticalUnitScale = (BASE_ISO_TILE_H_HALF * 2) * currentZoom; 
    const scaledWorldY = worldY * verticalUnitScale; 

    // --- ¡MODIFICADO! Aplicar rotación ---
    const cosA = Math.cos(currentCameraAngle);
    const sinA = Math.sin(currentCameraAngle);
    
    // Rotar las coordenadas del mundo (en el plano XZ) ANTES de la proyección
    const rotatedX = worldX * cosA - worldZ * sinA;
    const rotatedZ = worldX * sinA + worldZ * cosA;
    
    // Aplicar proyección isométrica a las coordenadas rotadas
    // Usa el cameraOffset (ahora es instantáneo)
    const screenX = cameraOffset.x + (rotatedX - rotatedZ) * tileW;
    const screenY = cameraOffset.y + (rotatedX + rotatedZ) * tileH - scaledWorldY;
    // --- Fin de la modificación ---

    return { x: screenX, y: screenY };
}

/**
 * ¡MODIFICADO!
 * Convierte coordenadas de pantalla 2D (clic) a coordenadas del mundo 3D (x, z).
 * (Sin cambios en la lógica interna, pero ahora usa el currentCameraAngle actualizado)
 */
export function inverseProject(screenX, screenY, playerY = 0) {
    // Calcula el tamaño del tile según el zoom
    const tileW = BASE_ISO_TILE_W_HALF * currentZoom;
    const tileH = BASE_ISO_TILE_H_HALF * currentZoom;
    
    // Escala la altura Y del jugador
    const verticalUnitScale = (BASE_ISO_TILE_H_HALF * 2) * currentZoom;
    const scaledPlayerY = playerY * verticalUnitScale;

    // Ajustar por el offset de la cámara Y la altura del jugador
    const screenXFromOrigin = screenX - cameraOffset.x;
    const screenYFromOrigin = screenY - cameraOffset.y + scaledPlayerY; // <-- ¡Modificación clave!
    
    // --- ¡MODIFICADO! ---
    // 1. Ecuaciones de la inversa de la *proyección isométrica*
    // Esto nos da las coordenadas ROTADAS (rotatedX, rotatedZ)
    const rotatedX = (screenXFromOrigin / tileW + screenYFromOrigin / tileH) / 2;
    const rotatedZ = (screenYFromOrigin / tileH - screenXFromOrigin / tileW) / 2;

    // 2. Pre-calcular seno y coseno del ángulo actual
    const cosA = Math.cos(currentCameraAngle);
    const sinA = Math.sin(currentCameraAngle);

    // 3. Aplicar la rotación *inversa* para obtener (worldX, worldZ)
    // worldX = rotatedX * cos(a) + rotatedZ * sin(a)
    // worldZ = -rotatedX * sin(a) + rotatedZ * cos(a)
    const worldX = rotatedX * cosA + rotatedZ * sinA;
    const worldZ = -rotatedX * sinA + rotatedZ * cosA;
    // --- Fin de la modificación ---
    
    return { x: worldX, z: worldZ };
}

/**
 * ¡MODIFICADO!
 * Función para actualizar la posición de la cámara y seguir al jugador.
 * (Sin cambios en la lógica interna, pero ahora usa el currentCameraAngle actualizado)
 */
export function updateCameraPosition(myPlayerId, interpolatedPlayersState, canvas, playerVisualY) {
    if (!myPlayerId || !interpolatedPlayersState[myPlayerId] || !canvas) {
        return; 
    }

    const myPlayer = interpolatedPlayersState[myPlayerId];
    const playerHeight = playerVisualY; // Y visual (groundH + size)

    // Calcula el tamaño del tile y la altura del jugador según el zoom
    const tileW = BASE_ISO_TILE_W_HALF * currentZoom;
    const tileH = BASE_ISO_TILE_H_HALF * currentZoom;
    
    const verticalUnitScale = (BASE_ISO_TILE_H_HALF * 2) * currentZoom; 
    const scaledPlayerHeight = playerHeight * verticalUnitScale;

    // --- Calcular el OBJETIVO de la cámara ---
    const targetScreenX = canvas.width / 2;
    const verticalOffset = 100 * currentZoom; 
    const targetScreenY = canvas.height / 2 + verticalOffset;

    // --- ¡MODIFICADO! Aplicar rotación al cálculo ---
    const cosA = Math.cos(currentCameraAngle);
    const sinA = Math.sin(currentCameraAngle);

    // Rotar las coordenadas del jugador
    const rotatedPlayerX = myPlayer.x * cosA - myPlayer.z * sinA;
    const rotatedPlayerZ = myPlayer.x * sinA + myPlayer.z * cosA;

    // --- ¡CORRECCIÓN DEL TYPO! ---
    // Proyectar el jugador rotado (sin offset)
    // Se usaba 'rotatedZ' en lugar de 'rotatedPlayerZ'
    const playerScreenXWithoutOffset = (rotatedPlayerX - rotatedPlayerZ) * tileW;
    const playerScreenYWithoutOffset = (rotatedPlayerX + rotatedPlayerZ) * tileH - scaledPlayerHeight;
    // --- Fin de la corrección ---

    // El offset OBJETIVO es la diferencia
    const targetCameraX = targetScreenX - playerScreenXWithoutOffset;
    const targetCameraY = targetScreenY - playerScreenYWithoutOffset;
    
    // --- ¡CORRECCIÓN! ---
    // Se elimina el 'lerp' (suavizado) para un seguimiento instantáneo.
    // Esto previene el "desplazamiento" brusco al girar o hacer zoom.
    cameraOffset.x = targetCameraX;
    cameraOffset.y = targetCameraY;
}

/**
 * Actualiza el nivel de zoom (sin cambios)
 */
export function updateZoom(factor) {
    currentZoom *= factor;
    currentZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, currentZoom));
}

