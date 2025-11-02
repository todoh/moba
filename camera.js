// ==================================================
// ### LÓGICA DE CÁMARA (CAMERA.JS) ###
// ==================================================

// Offset de la cámara (sin cambios)
export let cameraOffset = { x: 0, y: 0 }; 

// Constantes BASE (sin cambios)
export const BASE_ISO_TILE_W_HALF = 128; 
export const BASE_ISO_TILE_H_HALF = 64; 

// --- VARIABLES DE ZOOM (sin cambios) ---
export let currentZoom = 1.0;    
 
const MIN_ZOOM = 0.3;      
const MAX_ZOOM = 2.5;      
export const ZOOM_STEP = 1.1;     

// --- ¡MODIFICADO! VARIABLES DE ROTACIÓN (Snap + Lerp) ---
let targetCameraAngle = 0.0; // El ángulo objetivo (en saltos de 45°)
export let currentCameraAngle = 0.0; // El ángulo visual actual (suavizado)
const ANGLE_LERP_AMOUNT = 0.04; // Velocidad del "giro" de cámara
const ROTATION_STEP = Math.PI / 2; // 45 grados

// --- ¡NUEVO! Función de ayuda para interpolar ángulos (Lerp) ---
/**
 * Interpola linealmente entre dos ángulos, manejando el "cruce" (ej. de 350° a 10°).
 */
function lerpAngle(start, end, amt) {
    let difference = end - start;
    
    // Si la diferencia es más de 180°, ir por el otro lado
    if (difference > Math.PI) {
        difference -= (2 * Math.PI);
    } else if (difference < -Math.PI) {
        difference += (2 * Math.PI);
    }
    
    return start + difference * amt;
}

/**
 * ¡MODIFICADO! Gira a la izquierda en 45°.
 */
export function startRotatingLeft() {
    targetCameraAngle -= ROTATION_STEP;
}

/**
 * ¡MODIFICADO! Gira a la derecha en 45°.
 */
export function startRotatingRight() {
    targetCameraAngle += ROTATION_STEP;
}

/**
 * ¡MODIFICADO! 'stopRotating' ya no es necesario.
 * Esta función actualiza el ángulo visual hacia el ángulo objetivo.
 */
export function stopRotating() {
    // Esta función ya no es necesaria, la dejamos vacía o la eliminamos.
}

/**
 * ¡MODIFICADO! Actualiza el ángulo suavizado (lerp)
 */
export function updateCameraAngle() {
    currentCameraAngle = lerpAngle(currentCameraAngle, targetCameraAngle, ANGLE_LERP_AMOUNT);
}

/**
 * ¡NUEVO! Devuelve true si la cámara está actualmente girando.
 */
export function isCameraRotating() {
    // Comprobar si la diferencia es mayor a un pequeño umbral
    let difference = targetCameraAngle - currentCameraAngle;
    if (difference > Math.PI) difference -= (2 * Math.PI);
    if (difference < -Math.PI) difference += (2 * Math.PI);
    
    return Math.abs(difference) > 0.001;
}


/**
 * ¡MODIFICADO!
 * Proyecta coordenadas 3D a 2D.
 * ¡NUEVO! Parámetro 'useCameraOffset' para el cacheo.
 */
// camera.js - CÓDIGO CORREGIDO

export function project(worldX, worldY, worldZ, useCameraOffset = true) { // <-- ¡NUEVO PARÁMETRO!
     
    const tileW = BASE_ISO_TILE_W_HALF * currentZoom;
    const tileH = BASE_ISO_TILE_H_HALF * currentZoom;
    const verticalUnitScale = (BASE_ISO_TILE_H_HALF * 2) * currentZoom; 
    const scaledWorldY = worldY * verticalUnitScale; 

    // --- ¡AQUÍ ESTÁ LA CORRECCIÓN! ---
    // Usar 'currentCameraAngle' en lugar de 'angle'
    const cosA = Math.cos(currentCameraAngle);
    const sinA = Math.sin(currentCameraAngle);
    // --- FIN DE LA CORRECCIÓN ---

    const rotatedX = worldX * cosA - worldZ * sinA;
    const rotatedZ = worldX * sinA + worldZ * cosA;

    // ¡MODIFICADO! 'offset' ahora se decide arriba
    const offset = useCameraOffset ? cameraOffset : { x: 0, y: 0 }; // <--- ¡NUEVO!
    
    const screenX = offset.x + (rotatedX - rotatedZ) * tileW;
    const screenY = offset.y + (rotatedX + rotatedZ) * tileH - scaledWorldY;

    return { x: screenX, y: screenY };
}

/**
 * ¡MODIFICADO!
 * Convierte coordenadas de pantalla 2D (clic) a coordenadas del mundo 3D (x, z).
 * ¡NUEVO! Parámetro 'useCameraOffset' para el cacheo.
 */
export function inverseProject(screenX, screenY, playerY = 0, useCameraOffset = true) { // <-- ¡NUEVO PARÁMETRO!
    const tileW = BASE_ISO_TILE_W_HALF * currentZoom;
    const tileH = BASE_ISO_TILE_H_HALF * currentZoom;
    const verticalUnitScale = (BASE_ISO_TILE_H_HALF * 2) * currentZoom;
    const scaledPlayerY = playerY * verticalUnitScale;

    // ¡MODIFICADO! Usar el offset solo si se solicita
    const offset = useCameraOffset ? cameraOffset : { x: 0, y: 0 };
    
    const screenXFromOrigin = screenX - offset.x;
    const screenYFromOrigin = screenY - offset.y + scaledPlayerY;
    
    const rotatedX = (screenXFromOrigin / tileW + screenYFromOrigin / tileH) / 2;
    const rotatedZ = (screenYFromOrigin / tileH - screenXFromOrigin / tileW) / 2;

    const cosA = Math.cos(currentCameraAngle);
    const sinA = Math.sin(currentCameraAngle);

    const worldX = rotatedX * cosA + rotatedZ * sinA;
    const worldZ = -rotatedX * sinA + rotatedZ * cosA;
    
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

    // --- ¡¡¡CORRECCIÓN DEFINITIVA DEL BUG!!! ---
    // El error estaba aquí. Se usaba 'rotatedZ' (que era 'undefined')
    // en lugar de 'rotatedPlayerZ'. Esto hacía que el offset fuera NaN.
    const playerScreenXWithoutOffset = (rotatedPlayerX - rotatedPlayerZ) * tileW; // <-- ¡ARREGLADO!
    const playerScreenYWithoutOffset = (rotatedPlayerX + rotatedPlayerZ) * tileH - scaledPlayerHeight; // <-- ¡ARREGLADO!
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

// AÑADIR ESTA FUNCIÓN A CAMERA.JS

/**
 * ¡NUEVO! Calcula los límites del mundo (minX/minZ a maxX/maxZ)
 * que están actualmente visibles en la pantalla.
 * @param {HTMLCanvasElement} canvas El canvas principal
 * @param {number} playerY La altura Y del jugador (para la proyección inversa)
 * @param {number} padding Un "margen" para asegurar que no se corten los bordes
 * @returns {object} { minX, maxX, minZ, maxZ }
 */
export function calculateVisibleWorldBounds(canvas, playerY, padding = 4) {
    const { width, height } = canvas;
    
    // Proyectar las 4 esquinas de la pantalla al mundo
    // ¡¡¡IMPORTANTE!!! Usar 'useCameraOffset = true' aquí
    // porque 'inverseProject' RESTA el offset.
    // Necesitamos las coordenadas del mundo absolutas.
    const topLeft = inverseProject(0, 0, playerY, true);
    const topRight = inverseProject(width, 0, playerY, true);
    const bottomLeft = inverseProject(0, height, playerY, true);
    const bottomRight = inverseProject(width, height, playerY, true);

    // Encontrar los valores mínimos y máximos de X y Z
    const minX = Math.floor(Math.min(topLeft.x, topRight.x, bottomLeft.x, bottomRight.x) - padding);
    const maxX = Math.ceil(Math.max(topLeft.x, topRight.x, bottomLeft.x, bottomRight.x) + padding);
    const minZ = Math.floor(Math.min(topLeft.z, topRight.z, bottomLeft.z, bottomRight.z) - padding);
    const maxZ = Math.ceil(Math.max(topLeft.z, topRight.z, bottomLeft.z, bottomRight.z) + padding);

    return { minX, maxX, minZ, maxZ };
}
