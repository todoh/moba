// ==================================================
// ### LÓGICA DE JUEGO (logica.js) ###
// ==================================================
// Contiene la lógica de movimiento, colisiones, IA, e interacciones.

import {
    MOVEMENT_SPEED, playerSize, PLAYER_LERP_AMOUNT,
    NPC_MOVE_SPEED, NPC_RANDOM_MOVE_CHANCE, NPC_RANDOM_WAIT_TIME,
    MELEE_RANGE, INTERACTION_RADIUS
} from './constantes.js';
import { inverseProject } from './camera.js';

// --- Dependencias de estado (se rellenan desde main.js) ---
// Usamos un objeto 'deps' para pasar las referencias
let deps = {};

/**
 * Inyecta las dependencias (variables de estado) desde main.js.
 * Esto permite a logica.js leer y modificar el estado centralizado.
 */
export function setLogicaDependencies(dependencies) {
    deps = dependencies;
}

/**
 * Función de ayuda: Interpolación Lineal (LERP)
 * Suaviza un movimiento de A a B.
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
 * ¡CORREGIDO!
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
 * ¡MODIFICADO! Acepta "from" para chequear escalones.
 */
export function isPositionPassable(worldX, worldZ, fromX, fromZ, isNpc = false) { 
    if (!deps.currentMapData || !deps.currentMapData.tileGrid) return false;
    
    // --- 1. Chequeo de transitabilidad (Suelo y Elemento) ---
    const tileX = Math.floor(worldX);
    const tileZ = Math.floor(worldZ);

    const { tile, elementDef } = getTileData(worldX, worldZ);
    
    if (!tile) {
        // console.log(`[DEBUG] Bloqueo: Fuera de límites (x: ${tileX}, z: ${tileZ})`);
        return false; // Fuera de los límites
    }

    const groundDef = deps.GAME_DEFINITIONS.groundTypes[tile.g];
    
    if (!groundDef) {
        console.error(`[DEBUG] ¡BLOQUEO FATAL! La definición de suelo "${tile.g}" no existe.`);
        return false;
    }

    let elementIsPassable = true;
    if (elementDef && elementDef.drawType === 'block') {
        elementIsPassable = elementDef.passable;
    }
    
    if (groundDef.passable === false || elementIsPassable === false) {
        // console.log(`[DEBUG] Bloqueo: El suelo ("${tile.g}") o elemento ("${elementDef.id}") no es transitable.`);
        return false; 
    }

    // --- 2. Comprobación de Altura (Escalones) ---
    if (isNpc) return true; // ¡Importante! Los NPCs ignoran la altura

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

    // Obtener la altura lógica (MÁXIMA) en el punto "desde" y "hacia"
    // ¡Esto usa getLogicHeightAt (la función que incluye bloques) y es CORRECTO para colisión!
    const previousGroundY = getLogicHeightAt(prevX, prevZ);
    const targetGroundY = getLogicHeightAt(worldX, worldZ);

    const MAX_STEP_HEIGHT = 0.5; // Un poco más de 1.0 para márgenes
    if (Math.abs(previousGroundY - targetGroundY) > MAX_STEP_HEIGHT) {
        // console.log(`[DEBUG] Bloqueo de altura: Y 'desde'=${previousGroundY.toFixed(2)}, Y 'objetivo'=${targetGroundY.toFixed(2)}`);
        return false;
    }
    
    return true; // Transitable
}


/**
 * Actualiza (interpola) las posiciones de TODOS los jugadores.
 * ¡CORREGIDO! Usa getGroundHeightAt para la altura visual.
 */
export function updatePlayerPositions() {
    if (!deps.playersState || !deps.interpolatedPlayersState) return;

    for (const id in deps.playersState) {
        const p = deps.playersState[id];
        const interp = deps.interpolatedPlayersState[id];

        if (interp) {
            // Interpolar X y Z
            interp.x = lerp(interp.x, p.x, PLAYER_LERP_AMOUNT);
            interp.z = lerp(interp.z, p.z, PLAYER_LERP_AMOUNT);

            // --- ¡¡¡CORRECCIÓN CLAVE!!! ---
            // Calcular la Y del SUELO OBJETIVO (ignora bloques)
const targetGroundY = getLogicHeightAt(p.x, p.z);
            // Calcular la Y VISUAL (cabeza)
            const targetVisualY = targetGroundY + playerSize;

            // Interpolar la Y visual
            interp.y = lerp(interp.y, targetVisualY, PLAYER_LERP_AMOUNT);
        }
    }
}


// ==================================================
// ### LÓGICA DE NPCs ###
// ==================================================

/**
 * Actualiza (interpola) las posiciones de TODOS los NPCs.
 * ¡CORREGIDO! Usa getGroundHeightAt para la altura visual.
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
                // Llegó al destino
                npc.isMoving = false;
                npc.x = npc.targetX;
                npc.z = npc.targetZ;
                npc.lastMoveTime = now;
            } else {
                // Moverse hacia el destino
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
                const targetX = npc.x + (Math.random() * 4 - 2); // -2 a +2
                const targetZ = npc.z + (Math.random() * 4 - 2); // -2 a +2
                
                if (isPositionPassable(targetX, targetZ, npc.x, npc.z, true)) { 
                    npc.targetX = targetX;
                    npc.targetZ = targetZ;
                    npc.isMoving = true;
                }
                npc.lastMoveTime = now; // Reiniciar incluso si falla
            }
        }
        // --- Lógica de Movimiento por Ruta (Patrol) ---
        else if (
            npc.movement === 'patrol' &&
            npc.movementPath &&
            npc.movementPath.length > 0 &&
            now - npc.lastMoveTime > NPC_RANDOM_WAIT_TIME // Usar como "tiempo de espera"
        ) {
            npc.currentTargetIndex = (npc.currentTargetIndex + 1) % npc.movementPath.length;
            const nextPos = npc.movementPath[npc.currentTargetIndex];
            const tile = deps.currentMapData.tileGrid[nextPos.z][nextPos.x];

            if (tile) {
                npc.targetX = nextPos.x + 0.5;
                npc.targetZ = nextPos.z + 0.5;
                npc.isMoving = true;
            }
            npc.lastMoveTime = now;
        }


        // --- Actualizar Y (Altura) ---
        // --- ¡¡¡CORRECCIÓN CLAVE!!! ---
        // Calcular la Y del suelo OBJETIVO (ignora bloques)
        const targetGroundY = getGroundHeightAt(npc.x, npc.z);
        // --- FIN DE LA CORRECCIÓN ---

        // Calcular la Y VISUAL (cabeza)
        const targetVisualY = targetGroundY + playerSize;
        // Interpolar la Y visual
        npc.y = lerp(npc.y, targetVisualY, PLAYER_LERP_AMOUNT);
    }
}


// ==================================================
// ### LÓGICA DE INTERACCIÓN ###
// ==================================================

/**
 * Comprueba si un clic/toque resultó en una interacción con un NPC.
 * @returns {boolean} - true si hubo interacción, false si no.
 */
export function getNpcInteraction(worldX, worldZ) {
    if (!deps.interpolatedPlayersState || !deps.myPlayerId) return false;
    const myPlayer = deps.interpolatedPlayersState[deps.myPlayerId];
    if (!myPlayer) return false;

    for (const key in deps.npcStates) {
        const npc = deps.npcStates[key];
        const dist = Math.hypot(npc.x - worldX, npc.z - worldZ);

        if (dist < INTERACTION_RADIUS) {
            const distToPlayer = Math.hypot(npc.x - myPlayer.x, npc.z - myPlayer.z);
            if (distToPlayer > MELEE_RANGE) {
                console.log("NPC demasiado lejos para interactuar.");
                // Opcional: mostrar un mensaje
                return false; // No interactuar, pero SÍ bloquear el movimiento
            }

            // ¡Interactuar!
            console.log("Interactuando con NPC:", npc);
            showNpcModal(npc);
            return true; // Hubo interacción
        }
    }
    return false; // No hubo interacción
}

/**
 * Muestra el modal del NPC.
 */
export function showNpcModal(npc) {
    const elementDef = deps.GAME_DEFINITIONS.elementTypes[npc.id];
    let text = "Hola.";
    if (elementDef && elementDef.dialog) {
        text = elementDef.dialog;
    } else if (npc.dialog) {
        text = npc.dialog;
    }

    if (deps.npcModalText && deps.npcModalContainer) {
        deps.npcModalText.textContent = text;
        deps.npcModalContainer.className = 'npc-modal-visible';
    }
}

/**
 * Oculta el modal del NPC.
 */
export function hideNpcModal() {
    if (deps.npcModalContainer) {
        deps.npcModalContainer.className = 'npc-modal-hidden';
    }
}

/**
 * Comprueba si un clic/toque resultó en un portal.
 * @returns {object | null} - El destino del portal, o null.
 */
export function getPortalDestination(worldX, worldZ) {
    const { tile, elementDef } = getTileData(worldX, worldZ);
    if (elementDef && elementDef.drawType === 'portal' && elementDef.destination) {
        console.log("Portal encontrado:", elementDef.destination);
        return elementDef.destination;
    }
    return null;
}

/**
 * Actualiza el estado de "hover" (sobre qué objeto está el ratón).
 */
export function updateHoveredState() {
    if (!deps.canvas || !deps.mouseScreenPos || !deps.interpolatedPlayersState || !deps.myPlayerId) {
        return { hoveredItemKey: null, cursorStyle: 'default' };
    }

    // 1. Proyectar el ratón al suelo
    const playerGroundY = deps.interpolatedPlayerVisualY - playerSize;
    const worldCoords = inverseProject(deps.mouseScreenPos.x, deps.mouseScreenPos.y, playerGroundY);

    let foundKey = null;
    let cursorStyle = 'default';

    // 2. Comprobar NPCs
    for (const key in deps.npcStates) {
        const npc = deps.npcStates[key];
        const dist = Math.hypot(npc.x - worldCoords.x, npc.z - worldCoords.z);
        if (dist < INTERACTION_RADIUS) {
            foundKey = key;
            cursorStyle = 'pointer';
            break;
        }
    }

    // 3. Comprobar Portales y Bloques
    if (!foundKey && deps.currentMapData && deps.currentMapData.tileGrid) {
        const checkRadius = 2; // Revisar un área pequeña alrededor del clic
        const xStart = Math.max(0, Math.floor(worldCoords.x) - checkRadius);
        const xEnd = Math.min(deps.currentMapData.width, Math.ceil(worldCoords.x) + checkRadius);
        const zStart = Math.max(0, Math.floor(worldCoords.z) - checkRadius);
        const zEnd = Math.min(deps.currentMapData.height, Math.ceil(worldCoords.z) + checkRadius);

        for (let z = zStart; z < zEnd; z++) {
            if (foundKey) break;
            for (let x = xStart; x < xEnd; x++) {
                const tile = deps.currentMapData.tileGrid[z][x];
                if (tile && typeof tile.e === 'object' && tile.e.id) {
                    const elementDef = deps.GAME_DEFINITIONS.elementTypes[tile.e.id];
                    if (elementDef && (elementDef.drawType === 'portal' || elementDef.drawType === 'block')) {
                        // Comprobar la distancia al *centro* del bloque
                        const dist = Math.hypot((x + 0.5) - worldCoords.x, (z + 0.5) - worldCoords.z);
                        if (dist < INTERACTION_RADIUS) {
                            foundKey = `${elementDef.drawType}_${z}_${x}`;
                            if (elementDef.drawType === 'portal') {
                                cursorStyle = 'pointer';
                            }
                            break;
                        }
                    }
                }
            }
        }
    }

    return { hoveredItemKey: foundKey, cursorStyle };
}

