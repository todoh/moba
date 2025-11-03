// ==================================================
// ### SCRIPT PRINCIPAL (main.js) ###
// ### VERSIÓN REFACTORIZADA ###
// ==================================================
// Este archivo actúa como el "director de orquesta".
// Gestiona el estado y llama a los módulos de lógica y renderizado.

// 1. Importaciones de Firebase
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getDatabase, ref, set, onValue, onDisconnect, query, orderByChild, equalTo, off } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

// 2. Importaciones de la lógica del juego (Módulos Externos)
import {
    project,
    cameraOffset,
    updateCameraPosition,
    updateZoom, ZOOM_STEP, currentZoom,
    inverseProject,
    startRotatingLeft,
    startRotatingRight,
    stopRotating,
    updateCameraAngle,
    currentCameraAngle, calculateVisibleWorldBounds, isCameraRotating
} from './camera.js';
import { setupClickMove2_5D, setMoveActionDependencies, setCollisionChecker, setPortalHandler, setNpcHandler } from './move-action.js';
import { loadGameDefinitions } from './elements.js';

// 3. Importaciones de la lógica del juego (Nuestros Módulos)
import { firebaseConfig, playerSize } from './constantes.js';
import * as logica from './logica.js';
import * as renderizado from './renderizado.js';

// 4. Variables globales de Firebase y Estado
let app;
let auth;
let db;
let myPlayerId;
let myPlayerRef = null;
let isGameLoopRunning = false;
let GAME_DEFINITIONS = { groundTypes: {}, elementTypes: {} };

let playersListener = null;
let playersState = {};
let interpolatedPlayersState = {};

let mapListener = null;
let mapRef = null;
let currentMapData = null;
let currentMapId = "map_001";

// Estado de NPCs
let npcStates = {};

// 5. Variables de UI y Canvas
let canvas, ctx;
let infoBar;
let npcModalContainer, npcModalText, npcModalClose;

// Variables de Hover y Cámara
let mouseScreenPos = { x: 0, y: 0 };
let hoveredItemKey = null;
let lastCameraOffsetX = 0;
let lastCameraOffsetY = 0;

// Variables de Interpolación
let interpolatedPlayerVisualY = 1.0; // Y visual (cabeza) suavizada de MI jugador

// Exportar la Y del SUELO para que move-action.js la use al hacer clic
export const getPlayerGroundY = () => (interpolatedPlayerVisualY - playerSize);


// 6. Función principal (onload)
window.onload = () => {
    // Inicializar UI
    infoBar = document.getElementById('info-bar');
    npcModalContainer = document.getElementById('npc-modal-container');
    npcModalText = document.getElementById('npc-modal-text');
    npcModalClose = document.getElementById('npc-modal-close');
    npcModalClose.addEventListener('click', logica.hideNpcModal);

    // Inicializar Canvas
    initCanvas();
    
    // --- ¡NUEVO! Inicializar Módulo de Renderizado ---
    renderizado.initRenderSystem();
    // --------------------------------------------------

    resizeCanvas(); // Ajustar tamaño inicial
    window.addEventListener('resize', resizeCanvas);

    // Inicializar Firebase
    initializeFirebase();

    // Listeners de Zoom
    const zoomInButton = document.getElementById('zoom-in');
    const zoomOutButton = document.getElementById('zoom-out');
    const handleZoomIn = (e) => {
        e.preventDefault();
        updateZoom(ZOOM_STEP);
        renderizado.invalidateCache(); // ¡Invalidar!
    };
    const handleZoomOut = (e) => {
        e.preventDefault();
        updateZoom(1 / ZOOM_STEP);
        renderizado.invalidateCache(); // ¡Invalidar!
    };
    zoomInButton.addEventListener('touchstart', handleZoomIn, { passive: false });
    zoomInButton.addEventListener('click', handleZoomIn);
    zoomOutButton.addEventListener('touchstart', handleZoomOut, { passive: false });
    zoomOutButton.addEventListener('click', handleZoomOut);

    // Listeners de Rotación (Botones)
    const rotateLeftButton = document.getElementById('rotate-left');
    const rotateRightButton = document.getElementById('rotate-right');

    rotateLeftButton.addEventListener('mousedown', (e) => { e.preventDefault(); startRotatingLeft(); });
    rotateLeftButton.addEventListener('touchstart', (e) => { e.preventDefault(); startRotatingLeft(); }, { passive: false });
    rotateLeftButton.addEventListener('mouseup', (e) => { e.preventDefault(); stopRotating(); });
    rotateLeftButton.addEventListener('mouseleave', (e) => { stopRotating(); });
    rotateLeftButton.addEventListener('touchend', (e) => { e.preventDefault(); stopRotating(); });

    rotateRightButton.addEventListener('mousedown', (e) => { e.preventDefault(); startRotatingRight(); });
    rotateRightButton.addEventListener('touchstart', (e) => { e.preventDefault(); startRotatingRight(); }, { passive: false });
    rotateRightButton.addEventListener('mouseup', (e) => { e.preventDefault(); stopRotating(); });
    rotateRightButton.addEventListener('mouseleave', (e) => { stopRotating(); });
    rotateRightButton.addEventListener('touchend', (e) => { e.preventDefault(); stopRotating(); });

    // Listeners de Rotación (Teclado)
    let keyRotation = 0;
    window.addEventListener('keydown', (e) => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
        if (e.key === 'q' || e.key === 'Q') {
            keyRotation = -1;
            startRotatingLeft();
        } else if (e.key === 'e' || e.key === 'E') {
            keyRotation = 1;
            startRotatingRight();
        }
    });

    window.addEventListener('keyup', (e) => {
        if ((e.key === 'q' || e.key === 'Q') && keyRotation === -1) {
            keyRotation = 0;
            stopRotating();
        } else if ((e.key === 'e' || e.key === 'E') && keyRotation === 1) {
            keyRotation = 0;
            stopRotating();
        }
    });
};

// 7. Funciones de Canvas
function resizeCanvas() {
    if (canvas) {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        // ¡NUEVO! Notificar al módulo de renderizado
        renderizado.resizeRenderCache(canvas.width, canvas.height);
    }
}
function initCanvas() {
    canvas = document.getElementById('game-canvas');
    ctx = canvas.getContext('2d');
    setupClickMove2_5D(canvas);

    canvas.addEventListener('mousemove', (event) => {
        mouseScreenPos.x = event.clientX;
        mouseScreenPos.y = event.clientY;
    });

    canvas.addEventListener('wheel', (event) => {
        event.preventDefault();
        if (event.deltaY < 0) {
            updateZoom(ZOOM_STEP);
            renderizado.invalidateCache();
        } else if (event.deltaY > 0) {
            updateZoom(1 / ZOOM_STEP);
            renderizado.invalidateCache();
        }
    }, { passive: false });
}

// 8. Inicializar Firebase y autenticación
async function initializeFirebase() {
    try {
        app = initializeApp(firebaseConfig);
        auth = getAuth(app);
        db = getDatabase(app);

        infoBar.textContent = "Autenticando...";

        onAuthStateChanged(auth, async (user) => {
            if (user) {
                myPlayerId = user.uid;
                myPlayerRef = ref(db, `moba-demo-players-3d/${myPlayerId}`);

                infoBar.textContent = "Cargando definiciones del juego...";

                try {
                    GAME_DEFINITIONS = await loadGameDefinitions(db);
                } catch (defError) {
                    console.error("Error fatal al cargar definiciones:", defError);
                    infoBar.textContent = "Error: No se pudieron cargar las definiciones.";
                    return;
                }
                
                // --- ¡NUEVO! Inyectar dependencias en los módulos ---
                const logicDeps = {
                    currentMapData: currentMapData, // Pasa la referencia
                    GAME_DEFINITIONS: GAME_DEFINITIONS,
                    interpolatedPlayersState: interpolatedPlayersState,
                    myPlayerId: myPlayerId,
                    playersState: playersState,
                    npcStates: npcStates,
                    currentMapId: currentMapId,
                    canvas: canvas,
                    npcModalContainer: npcModalContainer,
                    npcModalText: npcModalText,
                    interpolatedPlayerVisualY: interpolatedPlayerVisualY,
                    mouseScreenPos: mouseScreenPos
                };
                 // Esta es una trampa común: necesitamos pasar el *objeto* para que las
                 // actualizaciones se reflejen. O, mejor, pasar un objeto contenedor.
                 // Por simplicidad, re-llamaremos a setLogicaDependencies cuando cambien.
                 // ¡PERO! JS pasa objetos por referencia. Así que esto debería funcionar.
                 // Vamos a re-inyectar dependencias clave por si acaso.
                logica.setLogicaDependencies({
                    get currentMapData() { return currentMapData; },
                    GAME_DEFINITIONS,
                    interpolatedPlayersState,
                    get myPlayerId() { return myPlayerId; },
                    get playersState() { return playersState; }, // <-- ¡¡¡CORRECCIÓN 1!!!
                    npcStates,
                    get currentMapId() { return currentMapId; },
                    canvas,
                    npcModalContainer,
                    npcModalText,
                    get interpolatedPlayerVisualY() { return interpolatedPlayerVisualY; },
                    mouseScreenPos
                });

                renderizado.setRenderizadoDependencies({
                    ctx,
                    canvas,
                    get currentMapData() { return currentMapData; },
                    GAME_DEFINITIONS,
                    interpolatedPlayersState,
                    npcStates,
                    get hoveredItemKey() { return hoveredItemKey; },
                    get myPlayerId() { return myPlayerId; }
                });
                // ----------------------------------------------------

                // Configurar move-action con las funciones de logica.js
                setMoveActionDependencies(myPlayerId, db, () => currentMapId);
                setCollisionChecker(logica.isPositionPassable);
                setPortalHandler(logica.getPortalDestination);
                setNpcHandler(logica.getNpcInteraction);

                infoBar.innerHTML = `Conectado. <br> <strong>Tu UserID:</strong> ${myPlayerId.substring(0, 6)}<br><strong>Instrucciones:</strong> Toca para moverte.`;

                onDisconnect(myPlayerRef).remove();

                onValue(myPlayerRef, (snapshot) => {
                    const playerData = snapshot.val();
                    if (playerData && playerData.currentMap !== currentMapId) {
                        console.log(`¡Cambio de mapa detectado! Moviendo a ${playerData.currentMap}`);
                        if (interpolatedPlayersState[myPlayerId]) {
                            interpolatedPlayersState[myPlayerId].x = playerData.x;
                            interpolatedPlayersState[myPlayerId].z = playerData.z;
                            interpolatedPlayerVisualY = playerSize + logica.getLogicHeightAt(playerData.x, playerData.z);
                        }
                        loadMap(playerData.currentMap);
                    }
                });

                loadMap(currentMapId);

            } else {
                signInAnonymously(auth).catch((error) => {
                    console.error("Error al iniciar sesión anónimamente:", error);
                    infoBar.textContent = "Error al conectar con Firebase Auth.";
                });
            }
        });

    } catch (error) {
        console.error("Error al inicializar Firebase:", error);
        infoBar.textContent = "Error al inicializar Firebase. Revisa la consola.";
    }
}

/**
 * Carga un mapa y configura los listeners.
 */
function loadMap(mapId) {
    console.log(`Cargando mapa: ${mapId}`);

    // 1. Limpiar listeners antiguos
    if (mapListener) {
        off(mapRef, 'value', mapListener);
    }
    if (playersListener) {
        const oldPlayersQuery = query(ref(db, 'moba-demo-players-3d'), orderByChild('currentMap'), equalTo(currentMapId));
        off(oldPlayersQuery, 'value', playersListener);
    }

    // 2. Limpiar estado local
    playersState = {};
    npcStates = {}; // ¡Importante!
    currentMapId = mapId;
    renderizado.invalidateCache();
    
    // --- Re-inyectar dependencias que cambiaron ---
    logica.setLogicaDependencies({
        get currentMapData() { return currentMapData; },
        GAME_DEFINITIONS,
        interpolatedPlayersState,
        get myPlayerId() { return myPlayerId; },
        get playersState() { return playersState; }, // <-- ¡¡¡CORRECCIÓN 2!!!
        npcStates,    // Nueva referencia
        get currentMapId() { return currentMapId; }, // Nuevo valor
        canvas,
        npcModalContainer,
        npcModalText,
        get interpolatedPlayerVisualY() { return interpolatedPlayerVisualY; },
        mouseScreenPos
    });
    renderizado.setRenderizadoDependencies({
        ctx,
        canvas,
        get currentMapData() { return currentMapData; },
        GAME_DEFINITIONS,
        interpolatedPlayersState,
        npcStates,    // Nueva referencia
        get hoveredItemKey() { return hoveredItemKey; },
        get myPlayerId() { return myPlayerId; }
    });
    // ------------------------------------------------

    // 3. Configurar nuevas referencias
    mapRef = ref(db, `moba-demo-maps/${mapId}`);
    const playersQuery = query(ref(db, 'moba-demo-players-3d'), orderByChild('currentMap'), equalTo(mapId));

    // 4. Iniciar nuevos listeners
    mapListener = onValue(mapRef, (snapshot) => {
        const data = snapshot.val();
        if (data && data.tiles) {

            data.width = data.width || 20;
            data.height = data.height || 20;

            data.tileGrid = [];
            for (let z = 0; z < data.height; z++) {
                const row = [];
                for (let x = 0; x < data.width; x++) {
                    const tile = data.tiles[z * data.width + x] || { g: 'void', e: 'none', h: 1.0 };
                    if (tile.h === undefined) {
                        tile.h = 1.0;
                    }
                    row.push(tile);
                }
                data.tileGrid.push(row);
            }
            currentMapData = data; // Actualizar la referencia
            renderizado.invalidateCache();

            // Poblar el estado de NPCs
            npcStates = {}; // Limpiar
            for (let z = 0; z < currentMapData.height; z++) {
                for (let x = 0; x < currentMapData.width; x++) {
                    const tile = currentMapData.tileGrid[z][x];
                    if (tile && typeof tile.e === 'object' && tile.e.id) {
                        const elementDef = GAME_DEFINITIONS.elementTypes[tile.e.id];
                        
                        // --- ¡¡¡CORRECCIÓN DE LÓGICA DE NPC!!! ---
                        // Antes: if (elementDef && elementDef.drawType === 'sprite' && tile.e.movement)
                        // Esto era demasiado estricto. Si un NPC no tenía 'movement', no aparecía.
                        // Ahora, cualquier 'sprite' es tratado como un NPC (se mueva o no).
                        if (elementDef && elementDef.drawType === 'sprite') {
                        // --- FIN DE LA CORRECCIÓN ---
                            
                            const npcKey = `npc_${z}_${x}`;
                            npcStates[npcKey] = {
                                ...tile.e,
                                x: x + 0.5,
                                z: z + 0.5,
                                y: playerSize + logica.getLogicHeightAt(x + 0.5, z + 0.5),
                                targetX: x + 0.5,
                                targetZ: z + 0.5,
                                isMoving: false,
                                currentTargetIndex: 0,
                                lastMoveTime: Date.now(),
                                originKey: npcKey
                            };
                        }
                    }
                }
            }
            console.log("Estado de NPCs inicializado:", npcStates);

            // Lógica de Spawn
            let spawnPos;
            if (data.startPosition && typeof data.startPosition.x === 'number' && typeof data.startPosition.z === 'number') {
                spawnPos = { x: data.startPosition.x + 0.5, z: data.startPosition.z + 0.5 };
            } else {
                spawnPos = { x: (data.width / 2) + 0.5, z: (data.height / 2) + 0.5 };
            }
            currentMapData.initialSpawn = spawnPos;

            interpolatedPlayerVisualY = playerSize + logica.getLogicHeightAt(spawnPos.x, spawnPos.z);

            onValue(myPlayerRef, (playerSnap) => {
                const playerData = playerSnap.val();
                if (!playerData) {
                    console.log("Jugador no existe, creando en spawn point.");
                    set(myPlayerRef, {
                        id: myPlayerId,
                        x: spawnPos.x,
                        z: spawnPos.z,
                        currentMap: mapId
                    });
                } else if (playerData.currentMap !== mapId) {
                    if (interpolatedPlayersState[myPlayerId]) {
                        interpolatedPlayersState[myPlayerId].x = playerData.x;
                        interpolatedPlayersState[myPlayerId].z = playerData.z;
                        interpolatedPlayersState[myPlayerId].y = playerSize + logica.getLogicHeightAt(playerData.x, playerData.z);
                        if (myPlayerId === interpolatedPlayersState[myPlayerId].id) {
                            interpolatedPlayerVisualY = interpolatedPlayersState[myPlayerId].y;
                        }
                    }
                    console.log(`Teleportación a ${mapId} confirmada.`);
                }
            }, { onlyOnce: true });

        } else {
            console.warn(`No se encontraron datos para el mapa ${mapId}.`);
            currentMapData = null;
        }
    });

    playersListener = onValue(playersQuery, (snapshot) => {
        playersState = snapshot.val() || {}; // Actualizar referencia
        for (const id in interpolatedPlayersState) {
            if (!playersState[id]) {
                delete interpolatedPlayersState[id];
            }
        }
        for (const id in playersState) {
            if (!interpolatedPlayersState[id]) {
                interpolatedPlayersState[id] = {
                    ...playersState[id],
                    y: playerSize + logica.getLogicHeightAt(playersState[id].x, playersState[id].z)
                };
            }
        }
    });

    // 5. Iniciar bucle del juego
    if (!isGameLoopRunning) {
        isGameLoopRunning = true;
        gameLoop();
    }
}


/**
 * Bucle principal del juego.
 */
function gameLoop() {
    if (!isGameLoopRunning) return;
    requestAnimationFrame(gameLoop);
    if (!ctx || !currentMapData) return; // Esperar a que el mapa cargue

    // 1. Actualizar ángulo de la cámara (Módulo Camera)
    updateCameraAngle();

    // 2. Actualizar TODAS las posiciones (Módulo Lógica)
    logica.updatePlayerPositions();
    logica.updateNpcPositions();

    // 3. Actualizar la Y visual de MI jugador para la cámara (Estado local)
    if (myPlayerId && interpolatedPlayersState[myPlayerId]) {
        interpolatedPlayerVisualY = interpolatedPlayersState[myPlayerId].y;
    }

    // 4. Definir la Y del suelo de mi jugador
    const playerGroundY = interpolatedPlayerVisualY - playerSize;

    // 5. Actualizar la cámara (Módulo Camera)
    updateCameraPosition(myPlayerId, interpolatedPlayersState, canvas, interpolatedPlayerVisualY);

    // Comprobar si la cámara se movió para invalidar el caché
    if (cameraOffset.x !== lastCameraOffsetX || cameraOffset.y !== lastCameraOffsetY) {
        renderizado.invalidateCache();
        lastCameraOffsetX = cameraOffset.x;
        lastCameraOffsetY = cameraOffset.y;
    }

    // 6. Actualizar el hover (Módulo Lógica)
    const hoverState = logica.updateHoveredState();
    hoveredItemKey = hoverState.hoveredItemKey;
    canvas.style.cursor = hoverState.cursorStyle;

    // 7. Calcular límites visuales (Módulo Camera)
    const worldBounds = calculateVisibleWorldBounds(canvas, playerGroundY);

    // 8. Dibujar todo (Módulo Renderizado)
    renderizado.renderGameLoop(
        worldBounds,
        cameraOffset,
        lastCameraOffsetX,
        lastCameraOffsetY,
        logica.getLogicHeightAt // Pasar la función como dependencia
    );
}