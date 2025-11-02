// ==================================================
// ### LÓGICA DE ACCIÓN DE MOVIMIENTO (MOVE-ACTION.JS) ###
// ==================================================

import { ref, update } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { inverseProject } from './camera.js';
// ¡NUEVO! Importar la Y visual del jugador
import { getPlayerVisualY } from './main.js';

// Variables locales del módulo
let _myPlayerId;
let _db;
let _collisionChecker = (x, z) => false; 
let _portalHandler = (x, z) => null;
let _npcHandler = (x, z) => false; 
let _getCurrentMapId = () => null;

/**
 * Establece las dependencias (sin cambios)
 */
export function setMoveActionDependencies(myPlayerId, db, getCurrentMapIdFunc) {
    _myPlayerId = myPlayerId;
    _db = db;
    _getCurrentMapId = getCurrentMapIdFunc;
}

/**
 * Establece la función que se usará para chequear colisiones. (sin cambios)
 */
export function setCollisionChecker(checkerFunc) {
    _collisionChecker = checkerFunc;
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
 * ¡MODIFICADO! Ahora usa la Y del jugador para la proyección inversa.
 */
export function setupClickMove2_5D(canvas) {
    
    const handleMove = (event) => {
        if (!_myPlayerId || !_db || !canvas || !_collisionChecker) return;
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
        const playerVisualY = getPlayerVisualY();
        // 2. Proyectar el clic usando esa altura
        const worldCoords = inverseProject(screenX, screenY, playerVisualY);
        // -----------------------------
        
        const myPlayerRef = ref(_db, `moba-demo-players-3d/${_myPlayerId}`);

        // Lógica de chequeo (sin cambios)
        
        // --- 1. CHEQUEO DE INTERACCIÓN NPC ---
        const interactionHappened = _npcHandler(worldCoords.x, worldCoords.z);
        if (interactionHappened) {
            return; 
        }

        // --- 2. LÓGICA DE PORTAL ---
        const portalDest = _portalHandler(worldCoords.x, worldCoords.z);
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
        
        // --- 3. CHEQUEO DE COLISIÓN ---
        if (!_collisionChecker(worldCoords.x, worldCoords.z)) {
            console.warn("Movimiento bloqueado: Casilla no transitable en", worldCoords);
            showBlockedClick(screenX, screenY);
            return; 
        }

        // --- 4. MOVIMIENTO NORMAL ---
        update(myPlayerRef, {
            x: worldCoords.x,
            z: worldCoords.z
        });
    };

    canvas.addEventListener('touchstart', handleMove, { passive: false });
    canvas.addEventListener('click', handleMove);
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

