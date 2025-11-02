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

/**
 * Proyecta coordenadas del mundo 3D (x, y, z) a coordenadas de pantalla 2D (x, y).
 */
export function project(worldX, worldY, worldZ) {
    // Calcula el tamaño del tile según el zoom
    const tileW = BASE_ISO_TILE_W_HALF * currentZoom;
    const tileH = BASE_ISO_TILE_H_HALF * currentZoom;
    
    // La altura del jugador (Y) también se escala con el zoom
    const scaledWorldY = worldY * currentZoom; 

    const screenX = cameraOffset.x + (worldX - worldZ) * tileW;
    const screenY = cameraOffset.y + (worldX + worldZ) * tileH - scaledWorldY;
    return { x: screenX, y: screenY };
}

/**
 * Convierte coordenadas de pantalla 2D (clic) a coordenadas del plano del suelo 3D (x, z).
 */
export function inverseProject(screenX, screenY) {
    // Calcula el tamaño del tile según el zoom
    const tileW = BASE_ISO_TILE_W_HALF * currentZoom;
    const tileH = BASE_ISO_TILE_H_HALF * currentZoom;

    // Ajustar por el offset de la cámara (asumiendo y=0)
    const screenXFromOrigin = screenX - cameraOffset.x;
    const screenYFromOrigin = screenY - cameraOffset.y;
    
    // Ecuaciones de la inversa
    const worldX = (screenXFromOrigin / tileW + screenYFromOrigin / tileH) / 2;
    const worldZ = (screenYFromOrigin / tileH - screenXFromOrigin / tileW) / 2;
    
    return { x: worldX, z: worldZ };
}

/**
 * Función para actualizar la posición de la cámara y seguir al jugador.
 * Las dependencias (myPlayerId, etc.) se pasan como argumentos para evitar importaciones circulares.
 */
export function updateCameraPosition(myPlayerId, interpolatedPlayersState, canvas, playerSize) {
    if (!myPlayerId || !interpolatedPlayersState[myPlayerId] || !canvas) {
        return; 
    }

    const myPlayer = interpolatedPlayersState[myPlayerId];
    const playerHeight = playerSize; 

    // Calcula el tamaño del tile y la altura del jugador según el zoom
    const tileW = BASE_ISO_TILE_W_HALF * currentZoom;
    const tileH = BASE_ISO_TILE_H_HALF * currentZoom;
    const scaledPlayerHeight = playerHeight * currentZoom;

    // Dónde queremos que esté el jugador en la pantalla.
    // Añadimos un offset vertical para que el personaje esté más abajo del centro.
    const targetScreenX = canvas.width / 2;
    const verticalOffset = 100 * currentZoom; // El offset también se escala con el zoom
    const targetScreenY = canvas.height / 2 + verticalOffset;

    // Calculamos dónde estaría el jugador SIN offset (con zoom aplicado)
    const playerScreenXWithoutOffset = (myPlayer.x - myPlayer.z) * tileW;
    const playerScreenYWithoutOffset = (myPlayer.x + myPlayer.z) * tileH - scaledPlayerHeight;

    // El offset es la diferencia
    cameraOffset.x = targetScreenX - playerScreenXWithoutOffset;
    cameraOffset.y = targetScreenY - playerScreenYWithoutOffset;
}

/**
 * Actualiza el nivel de zoom
 * @param {number} factor - Multiplicador (ej: 1.1 para zoom in, 0.9 para zoom out)
 */
export function updateZoom(factor) {
    currentZoom *= factor;
    // Limita el zoom a los valores MIN y MAX
    currentZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, currentZoom));
}
