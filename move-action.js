// ==================================================
// ### LÓGICA DE ACCIÓN DE MOVIMIENTO (MOVE-ACTION.JS) ###
// ==================================================

import { ref, update } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { inverseProject } from './camera.js';
// ¡NUEVO! Importar la Y visual del jugador
import { getPlayerGroundY } from './main.js';

// Variables locales del módulo
let _myPlayerId;
let _db;
// ¡MODIFICADO! El chequeador de colisiones ahora tiene una firma diferente
let _collisionChecker = (x, z, fromX, fromZ) => false; 
let _portalHandler = (x, z) => null;
let _npcHandler = (x, z) => false; 
let _getCurrentMapId = () => null;
let _getPlayerCurrentPosFunc = () => null; // <-- ¡NUEVO!

/**
 * Establece las dependencias (sin cambios)
 */
export function setMoveActionDependencies(myPlayerId, db, getCurrentMapIdFunc) {
    _myPlayerId = myPlayerId;
    _db = db;
    _getCurrentMapId = getCurrentMapIdFunc;
}

/**
 * Establece la función que se usará para chequear colisiones.
 * ¡MODIFICADO! El 'checkerFunc' ahora acepta (x, z, fromX, fromZ)
 */
export function setCollisionChecker(checkerFunc) {
    _collisionChecker = checkerFunc;
}

/**
 * ¡NUEVO! Establece la función que se usará para obtener la posición actual del jugador.
 */
export function setPlayerPositionGetter(getterFunc) {
    _getPlayerCurrentPosFunc = getterFunc;
}


/**
 * Establece la función que se usará para chequear portales. (sin cambios)
 */
export function setPortalHandler(handlerFunc) {
    _portalHandler = handlerFunc;
}

/**
 * Establece la función que se usará para chequear NPCs. (sin cambios)
 */
export function setNpcHandler(handlerFunc) {
    _npcHandler = handlerFunc;
}


/**
 * Configura el listener de clic/toque para mover
 * ¡MODIFICADO! Ahora usa la Y del jugador y CHEQUEA EL CAMINO.
 */
export function setupClickMove2_5D(canvas) {
    
    const handleMove = (event) => {
        // ¡MODIFICADO! Añadir chequeo para _getPlayerCurrentPosFunc
        if (!_myPlayerId || !_db || !canvas || !_collisionChecker || !_getPlayerCurrentPosFunc) return;
        if (event.target !== canvas) return;
        
        event.preventDefault(); 

        let screenX, screenY;
        if (event.touches && event.touches.length > 0) {
            screenX = event.touches[0].clientX;
            screenY = event.touches[0].clientY;
        } else {
            screenX = event.clientX;
            screenY = event.clientY;
        }

        // --- ¡MODIFICACIÓN CLAVE! ---
        // 1. Obtener la Y visual ACTUAL del jugador (suavizada)
        const playerGroundY = getPlayerGroundY();
        // 2. Proyectar el clic usando esa altura (Este es el *objetivo* del clic)
        const targetWorldCoords = inverseProject(screenX, screenY, playerGroundY);
        // -----------------------------
        

        // --- ¡NUEVO! CHEQUEO DE CAMINO ---
        const playerPos = _getPlayerCurrentPosFunc();
        if (!playerPos) {
            console.warn("No se puede mover, playerPos es nulo.");
            return; // No sabemos dónde está el jugador
        }

        const startPos = { x: playerPos.x, z: playerPos.z };
        
        // Esta es la nueva función que "camina" por la línea
        const finalValidPos = findLastValidPosition(startPos, targetWorldCoords, _collisionChecker);
        
        // Si el punto final es inválido (ej. se chocó con un muro),
        // la posición final será el último punto VÁLIDO antes del muro.
        // --- FIN CHEQUEO DE CAMINO ---

        
        const myPlayerRef = ref(_db, `moba-demo-players-3d/${_myPlayerId}`);
        
        // Lógica de chequeo (sin cambios)
        
        // --- 1. CHEQUEO DE INTERACCIÓN NPC ---
        // Usamos las coordenadas del *clic original* (targetWorldCoords) para la interacción.
        const interactionHappened = _npcHandler(targetWorldCoords.x, targetWorldCoords.z);
        if (interactionHappened) {
            return; 
        }

        // --- 2. LÓGICA DE PORTAL ---
        // Usamos las coordenadas del *clic original* (targetWorldCoords) para el portal.
        const portalDest = _portalHandler(targetWorldCoords.x, targetWorldCoords.z);
        if (portalDest) {
            const localMapId = _getCurrentMapId();
            if (portalDest.mapId && portalDest.mapId !== localMapId) {
                update(myPlayerRef, {
                    x: portalDest.x,
                    z: portalDest.z,
                    currentMap: portalDest.mapId
                });
            } else {
                update(myPlayerRef, {
                    x: portalDest.x,
                    z: portalDest.z
                });
            }
            return; 
        }
        
        // --- 3. CHEQUEO DE COLISIÓN (Simplificado) ---
        // El chequeo de colisión ya se hizo en findLastValidPosition.
        
        // Si el clic original era inalcanzable (p.ej. saltar un muro),
        // finalValidPos será el último punto *antes* del muro.
        
        // Si el clic original era inalcanzable (p.ej. un muro justo delante),
        // finalValidPos será igual a startPos. No hacemos nada.
        const distToFinalPos = Math.hypot(finalValidPos.x - startPos.x, finalValidPos.z - startPos.z);
        
        if (distToFinalPos < 0.25) { // Umbral pequeño para evitar movimientos mínimos
            // Si el destino es el mismo sitio donde estamos,
            // y el clic original *no* era transitable, mostrar "bloqueado".
            // ¡MODIFICADO! Chequear el *clic original*
            if (!_collisionChecker(targetWorldCoords.x, targetWorldCoords.z, startPos.x, startPos.z)) {
                console.warn("Movimiento bloqueado: Casilla no transitable en", targetWorldCoords);
                showBlockedClick(screenX, screenY);
            }
            return; 
        }


        // --- 4. MOVIMIENTO NORMAL ---
        // ¡MODIFICADO! Mover al *último punto válido* encontrado.
        update(myPlayerRef, {
            x: finalValidPos.x,
            z: finalValidPos.z
        });
    };

    canvas.addEventListener('touchstart', handleMove, { passive: false });
    canvas.addEventListener('click', handleMove);
}

/**
 * ¡MODIFICADO!
 * "Camina" en línea recta desde startPos a endPos y devuelve
 * el último punto transitable encontrado, usando un radio para el jugador.
 */
function findLastValidPosition(startPos, endPos, collisionChecker) {
    const dx = endPos.x - startPos.x;
    const dz = endPos.z - startPos.z;
    const distance = Math.hypot(dx, dz);
    
    // Definir el tamaño del paso (ej. 0.5 de una casilla)
    const stepSize = 0.3; 
    const numSteps = Math.ceil(distance / stepSize);

    // --- ¡SOLUCIÓN AÑADIDA! ---
    // Define qué tan "ancho" es el jugador. 0.3 - 0.4 es un buen valor.
    const PLAYER_RADIUS = 0.35; 

    if (numSteps === 0) {
        return startPos;
    }

    let lastValidPos = startPos;
    let prevX = startPos.x;
    let prevZ = startPos.z;

    for (let i = 1; i <= numSteps; i++) {
        const t = i / numSteps;
        const checkX = startPos.x + dx * t;
        const checkZ = startPos.z + dz * t;

        // --- ¡SOLUCIÓN AÑADIDA! ---
        // Calcula un punto de sondeo "adelantado" en la dirección del movimiento
        // Añadir una comprobación (distance > 0) para evitar 'division by zero'
        const checkX_Forward = checkX + (distance > 0 ? (dx / distance) * PLAYER_RADIUS : 0);
        const checkZ_Forward = checkZ + (distance > 0 ? (dz / distance) * PLAYER_RADIUS : 0);

        // --- ¡SOLUCIÓN MODIFICADA! ---
        // Comprueba el punto "adelantado" en lugar del centro
        if (collisionChecker(checkX_Forward, checkZ_Forward, prevX, prevZ)) {
            // Este punto es válido, actualizar
            lastValidPos = { x: checkX, z: checkZ }; // <--- Todavía guardamos la posición del CENTRO
            prevX = checkX;
            prevZ = checkZ;
        } else {
            // Chocamos con un muro o un escalón.
            // Devolver el *último* punto que SÍ fue válido.
            return lastValidPos;
        }
    }

    // Si todo el camino fue válido, debemos chequear el destino final exacto
    // --- ¡SOLUCIÓN MODIFICADA! ---
    // Chequear también el punto "adelantado" del destino final
    const endX_Forward = endPos.x + (distance > 0 ? (dx / distance) * PLAYER_RADIUS : 0);
    const endZ_Forward = endPos.z + (distance > 0 ? (dz / distance) * PLAYER_RADIUS : 0);
    
    if (collisionChecker(endX_Forward, endZ_Forward, prevX, prevZ)) {
        return endPos; // El destino final es válido
    } else {
        return lastValidPos; // El destino final no es válido, usar el paso anterior
    }
}


/**
 * Muestra un pequeño indicador visual de "X". (sin cambios)
 */
function showBlockedClick(screenX, screenY) {
    let indicator = document.createElement('div');
    indicator.textContent = '❌';
    indicator.style.position = 'absolute';
    indicator.style.left = `${screenX - 12}px`;
    indicator.style.top = `${screenY - 12}px`;
    indicator.style.fontSize = '24px';
    indicator.style.pointerEvents = 'none'; 
    indicator.style.zIndex = '100';
    indicator.style.transition = 'opacity 0.5s, transform 0.5s';
    indicator.style.opacity = '1';
    indicator.style.transform = 'scale(1)';
    
    document.body.appendChild(indicator);

    setTimeout(() => {
        indicator.style.opacity = '0';
        indicator.style.transform = 'scale(1.5)';
    }, 100); 

    setTimeout(() => {
        document.body.removeChild(indicator);
    }, 600); 
}
