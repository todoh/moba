// ==================================================
// ### LÓGICA DE JUEGO (logica.js) ###
// ==================================================
// Contiene la lógica de movimiento, colisiones, IA, e interacciones.
// ¡Este archivo casi no cambia!

import {
    MOVEMENT_SPEED, playerSize, PLAYER_LERP_AMOUNT,
    NPC_MOVE_SPEED, NPC_RANDOM_MOVE_CHANCE, NPC_RANDOM_WAIT_TIME,
    MELEE_RANGE, INTERACTION_RADIUS
} from './constantes.js';

// --- Dependencias de estado (se rellenan desde main.js) ---
let deps = {};

/**
 * Inyecta las dependencias (variables de estado) desde main.js.
 */
export function setLogicaDependencies(dependencies) {
    deps = dependencies;
}

/**
 * Función de ayuda: Interpolación Lineal (LERP)
 */
export function lerp(start, end, amt) {
    return (1 - amt) * start + amt * end;
}

/**
 * Función de ayuda segura para obtener la altura de UNA casilla (sin interpolar).
 */
export function getTileHeight(tileX, tileZ) {
    if (!deps.currentMapData || !deps.currentMapData.tileGrid) return 0;
    if (tileX < 0 || tileX >= deps.currentMapData.width || tileZ < 0 || tileZ >= deps.currentMapData.height) {
        return 0; // Fuera del mapa
    }
    const tile = deps.currentMapData.tileGrid[tileZ][tileX];
    return (tile && tile.h !== undefined) ? tile.h : 1.0;
}

/**
 * Obtiene los datos de una casilla (tile y elemento).
 */
export function getTileData(worldX, worldZ) {
    if (!deps.currentMapData || !deps.GAME_DEFINITIONS) {
        return { tile: null, elementDef: null };
    }

    const tileX = Math.floor(worldX);
    const tileZ = Math.floor(worldZ);

    if (tileX < 0 || tileX >= deps.currentMapData.width || tileZ < 0 || tileZ >= deps.currentMapData.height) {
        return { tile: null, elementDef: null }; // Fuera del mapa
    }

    const tile = deps.currentMapData.tileGrid[tileZ][tileX];
    if (!tile) {
        return { tile: null, elementDef: null };
    }

    const elementId = (typeof tile.e === 'object' && tile.e !== null) ? tile.e.id : tile.e;
    const elementDef = deps.GAME_DEFINITIONS.elementTypes[elementId] || deps.GAME_DEFINITIONS.elementTypes['none'];

    return { tile, elementDef };
}

/**
 * Obtiene la altura del SUELO (transitable) en un punto.
 * IGNORA los bloques. Se usa para la altura VISUAL del jugador.
 */
export function getGroundHeightAt(worldX, worldZ) {
    const tileX = Math.floor(worldX);
    const tileZ = Math.floor(worldZ);
    return getTileHeight(tileX, tileZ);
}


/**
 * Obtiene la altura LÓGICA (escalonada) en un punto.
 * Esta es la fuente de verdad para la altura de COLISIÓN.
 * (Incluye la altura de los bloques).
 */
export function getLogicHeightAt(worldX, worldZ) {
    const tileX = Math.floor(worldX);
    const tileZ = Math.floor(worldZ);

    // 1. Obtener la altura del SUELO (sin interpolar)
    const groundHeight = getTileHeight(tileX, tileZ);

    // 2. Comprobar si hay un bloque en esa casilla
    const { elementDef } = getTileData(worldX, worldZ);
    if (elementDef && elementDef.drawType === 'block' && elementDef.height) {
        return groundHeight + parseFloat(elementDef.height);
    }

    // 3. Devolver la altura del suelo
    return groundHeight;
}


// ==================================================
// ### LÓGICA DE MOVIMIENTO Y COLISIÓN ###
// ==================================================

/**
 * Comprueba si una posición del mundo (x, z) es transitable.
 * (Sin cambios, esta lógica es perfecta)
 */
export function isPositionPassable(worldX, worldZ, fromX, fromZ, isNpc = false) { 
    if (!deps.currentMapData || !deps.currentMapData.tileGrid) return false;
    
    // --- 1. Chequeo de transitabilidad (Suelo y Elemento) ---
    const tileX = Math.floor(worldX);
    const tileZ = Math.floor(worldZ);

    const { tile, elementDef } = getTileData(worldX, worldZ);
    
    if (!tile) return false; // Fuera de los límites

    const groundDef = deps.GAME_DEFINITIONS.groundTypes[tile.g];
    if (!groundDef) return false; // Definición no encontrada

    let elementIsPassable = true;
    if (elementDef && (elementDef.drawType === 'block' || elementDef.drawType === 'sprite')) {
        elementIsPassable = elementDef.passable;
    }
    
    if (groundDef.passable === false || elementIsPassable === false) {
        return false; 
    }

    // --- 2. Comprobación de Altura (Escalones) ---
    if (isNpc) return true; // Los NPCs ignoran la altura

    let prevX = fromX;
    let prevZ = fromZ;

    if (prevX === undefined || prevZ === undefined) {
        if (deps.interpolatedPlayersState && deps.myPlayerId && deps.interpolatedPlayersState[deps.myPlayerId]) {
            const myPlayer = deps.interpolatedPlayersState[deps.myPlayerId];
            prevX = myPlayer.x;
            prevZ = myPlayer.z;
        } else {
            prevX = worldX;
            prevZ = worldZ;
        }
    }

    const previousGroundY = getLogicHeightAt(prevX, prevZ);
    const targetGroundY = getLogicHeightAt(worldX, worldZ);

    const MAX_STEP_HEIGHT = 0.5; // Umbral de escalón
    if (Math.abs(previousGroundY - targetGroundY) > MAX_STEP_HEIGHT) {
        return false;
    }
    
    return true; // Transitable
}


/**
 * Actualiza (interpola) las posiciones de TODOS los jugadores.
 * (Sin cambios, actualiza el estado 'interpolatedPlayersState')
 */
export function updatePlayerPositions() {
    if (!deps.playersState || !deps.interpolatedPlayersState) return;

    for (const id in deps.playersState) {
        const p = deps.playersState[id];
        const interp = deps.interpolatedPlayersState[id];

        if (interp) {
            interp.x = lerp(interp.x, p.x, PLAYER_LERP_AMOUNT);
            interp.z = lerp(interp.z, p.z, PLAYER_LERP_AMOUNT);

            const currentVisualGroundY = getGroundHeightAt(interp.x, interp.z);
            const targetVisualY = currentVisualGroundY + playerSize;
            interp.y = lerp(interp.y, targetVisualY, PLAYER_LERP_AMOUNT * 2.0);
        }
    }
}


// ==================================================
// ### LÓGICA DE NPCs ###
// ==================================================

/**
 * Actualiza (interpola) las posiciones de TODOS los NPCs.
 * (Sin cambios, actualiza el estado 'npcStates')
 */
export function updateNpcPositions() {
    if (!deps.npcStates) return;
    const now = Date.now();

    for (const key in deps.npcStates) {
        const npc = deps.npcStates[key];

        // --- Lógica de Movimiento ---
        if (npc.isMoving) {
            const dx = npc.targetX - npc.x;
            const dz = npc.targetZ - npc.z;
            const dist = Math.hypot(dx, dz);

            if (dist < 0.1) {
                npc.isMoving = false;
                npc.x = npc.targetX;
                npc.z = npc.targetZ;
                npc.lastMoveTime = now;
            } else {
                npc.x += (dx / dist) * NPC_MOVE_SPEED;
                npc.z += (dz / dist) * NPC_MOVE_SPEED;
            }
        }
        // --- Lógica de Movimiento Aleatorio ---
        else if (
            npc.movement === 'random' &&
            now - npc.lastMoveTime > NPC_RANDOM_WAIT_TIME
        ) {
            if (Math.random() < NPC_RANDOM_MOVE_CHANCE) {
                const targetX = npc.x + (Math.random() * 4 - 2);
                const targetZ = npc.z + (Math.random() * 4 - 2);
                
                if (isPositionPassable(targetX, targetZ, npc.x, npc.z, true)) { 
                    npc.targetX = targetX;
                    npc.targetZ = targetZ;
                    npc.isMoving = true;
                }
                npc.lastMoveTime = now;
            }
        }
        // --- (Aquí iría la lógica de 'route' si se implementa) ---

        // --- Actualizar Y (Altura) ---
        const currentVisualGroundY = getGroundHeightAt(npc.x, npc.z);
        const targetVisualY = currentVisualGroundY + playerSize;
        npc.y = lerp(npc.y, targetVisualY, PLAYER_LERP_AMOUNT * 2.0);
    }
}


// ==================================================
// ### LÓGICA DE INTERACCIÓN ###
// ==================================================

/**
 * Comprueba si un clic/toque resultó en una interacción con un NPC.
 * ¡MODIFICADO! Ahora recibe el objeto 'npc' directamente.
 * @returns {boolean} - true si hubo interacción, false si no.
 */
export function getNpcInteraction(npc) {
    if (!deps.interpolatedPlayersState || !deps.myPlayerId || !npc) return false;
    const myPlayer = deps.interpolatedPlayersState[deps.myPlayerId];
    if (!myPlayer) return false;

    const distToPlayer = Math.hypot(npc.x - myPlayer.x, npc.z - myPlayer.z);
    
    if (distToPlayer > MELEE_RANGE) {
        console.log("NPC demasiado lejos para interactuar.");
        return false; 
    }

    // ¡Interactuar!
    // La UI se maneja en main.js
    console.log("Interactuando con NPC:", npc);
    // main.js llamará a showNpcModal
    return true; // Hubo interacción
}

/**
 * Comprueba si un clic/toque resultó en un portal.
 * ¡MODIFICADO! Ahora recibe la 'definition' directamente.
 * @returns {object | null} - El destino del portal, o null.
 */
export function getPortalDestination(elementDef) {
    // La comprobación de 'portal' ya se hizo en el raycaster de main.js
    if (elementDef && elementDef.drawType === 'portal' && typeof tile.e === 'object' && tile.e.destMap) {
        console.log("Portal encontrado:", tile.e);
        return {
            mapId: tile.e.destMap,
            x: tile.e.destX,
            z: tile.e.destZ
        };
    }
    return null;
}

// --- ¡ELIMINADO! ---
// updateHoveredState() ha sido eliminado.
// El Raycasting en main.js (onCanvasMove) se encarga de esto.
