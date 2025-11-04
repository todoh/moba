// ==================================================
// ### LÓGICA DE ACCIÓN DE MOVIMIENTO (MOVE-ACTION.JS) ###
// ==================================================
// ¡Este archivo ahora es una utilidad pura de pathfinding!

import { ref, update } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

// --- Variables locales del módulo ---
// (Estas ya no son necesarias para findLastValidPosition)
// let _myPlayerId;
// let _db;
// let _getCurrentMapId = () => null;

// --- Funciones de dependencia (para findLastValidPosition) ---
let _collisionChecker = (x, z, fromX, fromZ) => false; 
let _portalHandler = (x, z) => null; // (Se mantiene por si se usa en el futuro)
let _npcHandler = (x, z) => false;   // (Se mantiene por si se usa en el futuro)


/**
 * Establece las dependencias (¡Simplificado!)
 */
export function setMoveActionDependencies(myPlayerId, db, getCurrentMapIdFunc) {
    // _myPlayerId = myPlayerId;
    // _db = db;
    // _getCurrentMapId = getCurrentMapIdFunc;
}

/**
 * Establece la función que se usará para chequear colisiones.
 */
export function setCollisionChecker(checkerFunc) {
    _collisionChecker = checkerFunc;
}

/**
 * Establece la función que se usará para chequear portales.
 */
export function setPortalHandler(handlerFunc) {
    _portalHandler = handlerFunc;
}

/**
 * Establece la función que se usará para chequear NPCs.
 */
export function setNpcHandler(handlerFunc) {
    _npcHandler = handlerFunc;
}

// --- ¡ELIMINADO! ---
// setupClickMove2_5D(canvas)
// showBlockedClick(screenX, screenY)
// setPlayerPositionGetter(getterFunc)
// La lógica de clic ahora vive en main.js

/**
 * ¡CONSERVADO Y MEJORADO!
 * "Camina" en línea recta desde startPos a endPos y devuelve
 * el último punto transitable encontrado, usando un radio para el jugador.
 * @param {object} startPos - {x, z}
 * @param {object} endPos - {x, z} (puede ser un THREE.Vector3)
 * @param {function} collisionChecker - La función logica.isPositionPassable
 */
export function findLastValidPosition(startPos, endPos, collisionChecker) {
    const dx = endPos.x - startPos.x;
    const dz = endPos.z - startPos.z;
    const distance = Math.hypot(dx, dz);
    
    const stepSize = 0.1; // Paso pequeño para mayor precisión
    const numSteps = Math.ceil(distance / stepSize);
    const PLAYER_RADIUS = 0.4; // Radio del jugador (un poco menos de media casilla)

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

        // Calcula un punto de sondeo "adelantado" en la dirección del movimiento
        const checkX_Forward = checkX + (distance > 0 ? (dx / distance) * PLAYER_RADIUS : 0);
        const checkZ_Forward = checkZ + (distance > 0 ? (dz / distance) * PLAYER_RADIUS : 0);

        // Comprueba el punto "adelantado"
        if (collisionChecker(checkX_Forward, checkZ_Forward, prevX, prevZ, false)) {
            // Este punto es válido, actualizar
            lastValidPos = { x: checkX, z: checkZ }; // Guardamos la posición del CENTRO
            prevX = checkX;
            prevZ = checkZ;
        } else {
            // Chocamos con un muro o un escalón.
            // Devolver el *último* punto que SÍ fue válido.
            return lastValidPos;
        }
    }

    // Si todo el camino fue válido, chequear el destino final exacto
    const endX_Forward = endPos.x + (distance > 0 ? (dx / distance) * PLAYER_RADIUS : 0);
    const endZ_Forward = endPos.z + (distance > 0 ? (dz / distance) * PLAYER_RADIUS : 0);
    
    if (collisionChecker(endX_Forward, endZ_Forward, prevX, prevZ, false)) {
        return endPos; // El destino final es válido
    } else {
        return lastValidPos; // El destino final no es válido, usar el paso anterior
    }
}
