// ==================================================
// ### LÓGICA DE ACCIÓN DE MOVIMIENTO (MOVE-ACTION.JS) ###
// ==================================================
// ¡MODIFICADO! Añade _npcHandler y cambia el orden de la lógica

import { ref, update } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { inverseProject } from './camera.js';

// Variables locales del módulo (¡MODIFICADO!)
let _myPlayerId;
let _db;
let _collisionChecker = (x, z) => false; 
let _portalHandler = (x, z) => null;
let _npcHandler = (x, z) => false; // <-- AÑADIDO
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
 * ¡NUEVO! Establece la función que se usará para chequear NPCs.
 */
export function setNpcHandler(handlerFunc) {
    _npcHandler = handlerFunc;
}


/**
 * Configura el listener de clic/toque para mover
 * (¡MODIFICADO! Cambia el orden de la lógica)
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

        const worldCoords = inverseProject(screenX, screenY);
        const myPlayerRef = ref(_db, `moba-demo-players-3d/${_myPlayerId}`);

        // ===================================
        // ### LÓGICA DE CLICK MODIFICADA ###
        // ===================================

        // --- 1. CHEQUEO DE INTERACCIÓN NPC ---
        // El _npcHandler ahora comprueba la distancia y muestra el modal él mismo
        const interactionHappened = _npcHandler(worldCoords.x, worldCoords.z);
        if (interactionHappened) {
            return; // Si interactuamos, no hacemos nada más (ni mover, ni portal)
        }

        // --- 2. LÓGICA DE PORTAL ---
        const portalDest = _portalHandler(worldCoords.x, worldCoords.z);
        if (portalDest) {
            // Se encontró un portal
            const localMapId = _getCurrentMapId();
            
            if (portalDest.mapId && portalDest.mapId !== localMapId) {
                // --- ¡PORTAL INTER-MAPA! ---
                update(myPlayerRef, {
                    x: portalDest.x,
                    z: portalDest.z,
                    currentMap: portalDest.mapId
                });
            } else {
                // --- Portal local (mismo mapa) ---
                update(myPlayerRef, {
                    x: portalDest.x,
                    z: portalDest.z
                });
            }
            return; // Usamos el portal, no hacemos nada más
        }
        
        // --- 3. CHEQUEO DE COLISIÓN ---
        if (!_collisionChecker(worldCoords.x, worldCoords.z)) {
            console.warn("Movimiento bloqueado: Casilla no transitable en", worldCoords);
            showBlockedClick(screenX, screenY);
            return; // Colisión, no mover
        }

        // --- 4. MOVIMIENTO NORMAL ---
        // Si no interactuamos, no usamos portal y no colisionamos, nos movemos.
        update(myPlayerRef, {
            x: worldCoords.x,
            z: worldCoords.z
        });
    };

    canvas.addEventListener('touchstart', handleMove, { passive: false });
    canvas.addEventListener('click', handleMove);
}

/**
 * Muestra un pequeño indicador visual de "X"... (sin cambios)
 */
function showBlockedClick(screenX, screenY) {
    // ... (código sin cambios) ...
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