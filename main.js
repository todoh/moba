// ==================================================
// ### SCRIPT PRINCIPAL (MAIN.JS) ###
// ==================================================

// 1. Importaciones de Firebase
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getDatabase, ref, set, onValue, onDisconnect, query, orderByChild, equalTo, off } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

// 2. Importaciones de la lógica del juego
// ¡MODIFICADO! Cambiadas las funciones de rotación
import {
    project,
    cameraOffset, // <--- ¡AÑADE ESTO!
    updateCameraPosition,
    updateZoom, ZOOM_STEP, currentZoom,
    inverseProject,
    startRotatingLeft,  // ¡NUEVO!
    startRotatingRight, // ¡NUEVO!
    stopRotating,       // ¡NUEVO!
    updateCameraAngle,
    currentCameraAngle ,calculateVisibleWorldBounds, isCameraRotating 
} from './camera.js';
import { setupClickMove2_5D, setMoveActionDependencies, setCollisionChecker, setPortalHandler, setNpcHandler } from './move-action.js';
import { loadGameDefinitions, drawGroundTile } from './elements.js';


// 3. Configuración de Firebase (sin cambios)
const firebaseConfig = {
  apiKey: "AIzaSyAfK_AOq-Pc2bzgXEzIEZ1ESWvnhMJUvwI",
  authDomain: "enraya-51670.firebaseapp.com",
  databaseURL: "https://enraya-51670-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "enraya-51670",
  storageBucket: "enraya-51670.firebasestorage.app",
  messagingSenderId: "103343380727",
  appId: "1:103343380727:web:b2fa02aee03c9506915bf2",
  measurementId: "G-2G31LLJY1T"
};

// --- ¡NUEVO! Variables del Caché Estático ---
let staticWorldCache; // El canvas caché
let cacheCtx; // El contexto 2D del caché
let isCacheInvalid = true; // Flag para saber si redibujar
let lastCacheAngle = -999;
let lastCacheZoom = -999;
let lastDrawnWorldBounds = null; // Para saber si nos movimos a un área nueva
let lastCacheOffset = { x: 0, y: 0 };
// ¡NUEVO! Esta será nuestra función 'project' para el caché (sin offset)
 
// 4. Variables globales del juego y Firebase
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
const MOVEMENT_SPEED = 0.05; // Velocidad del jugador
let mapListener = null;
let mapRef = null;
let currentMapData = null;
let currentMapId = "map_001";
let canvas, ctx;
let infoBar;
let lastCameraOffsetX = 0;
let lastCameraOffsetY = 0;
// Variables del Modal de NPC (sin cambios)
let npcModalContainer, npcModalText, npcModalClose;
const MELEE_RANGE = 2.0;

// Estado de NPCs (sin cambios)
let npcStates = {};
const NPC_MOVE_SPEED = 0.02;
const NPC_RANDOM_MOVE_CHANCE = 0.005;
const NPC_RANDOM_WAIT_TIME = 2000;

// Variables de Hover (sin cambios)
let mouseScreenPos = { x: 0, y: 0 };
let hoveredItemKey = null;
const INTERACTION_RADIUS = 0.75;

const playerSize = 1.0;
const playerImg = new Image();
let playerImgLoaded = true;
const playerImgWidth = 250;
const playerImgHeight = 250;
const playerTextureURL = 'samurai.png';

// ¡NUEVO! Variables de Interpolación
const PLAYER_LERP_AMOUNT = 0.1; // Más alto = más rápido
let interpolatedPlayerVisualY = 1.0; // Y visual suavizada de MI jugador
// Exportar la Y visual para que move-action.js la use
export const getPlayerVisualY = () => interpolatedPlayerVisualY;
// ¡NUEVO! Exportar la Y del SUELO para el clic
export const getPlayerGroundY = () => (interpolatedPlayerVisualY - playerSize);

/**
 * Función de ayuda: Interpolación Lineal (LERP)
 * Suaviza un movimiento de A a B.
 */
function lerp(start, end, amt) {
    return (1 - amt) * start + amt * end;
}

// 5. Función principal (onload)
window.onload = () => {
    infoBar = document.getElementById('info-bar');
    initCanvas();
    // --- ¡NUEVO! Inicializar el caché ---
    staticWorldCache = document.createElement('canvas');
    cacheCtx = staticWorldCache.getContext('2d');
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    npcModalContainer = document.getElementById('npc-modal-container');
    npcModalText = document.getElementById('npc-modal-text');
    npcModalClose = document.getElementById('npc-modal-close');
    npcModalClose.addEventListener('click', hideNpcModal);

    playerImg.onload = () => { playerImgLoaded = true; };
    playerImg.onerror = () => {
        console.error("No se pudo cargar la textura del jugador. Se usará un bloque de color.");
        playerImgLoaded = false;
    }
    playerImg.crossOrigin = "anonymous";
    playerImg.src = playerTextureURL;

    initializeFirebase();

    // Listeners de Zoom (sin cambios)
    const zoomInButton = document.getElementById('zoom-in');
    const zoomOutButton = document.getElementById('zoom-out');
    const handleZoomIn = (e) => {
        e.preventDefault();
        updateZoom(ZOOM_STEP);
        isCacheInvalid = true; // ¡Invalidar!
    };
    const handleZoomOut = (e) => {
        e.preventDefault();
        updateZoom(1 / ZOOM_STEP);
        isCacheInvalid = true; // ¡Invalidar!
    };
    zoomInButton.addEventListener('touchstart', handleZoomIn, { passive: false });
    zoomInButton.addEventListener('click', handleZoomIn);
    zoomOutButton.addEventListener('touchstart', handleZoomOut, { passive: false });
    zoomOutButton.addEventListener('click', handleZoomOut);

    // --- ¡MODIFICADO! Listeners de Rotación Continua (Botones) ---
    const rotateLeftButton = document.getElementById('rotate-left');
    const rotateRightButton = document.getElementById('rotate-right');

    // Izquierda
    rotateLeftButton.addEventListener('mousedown', (e) => { e.preventDefault(); startRotatingLeft(); });
    rotateLeftButton.addEventListener('touchstart', (e) => { e.preventDefault(); startRotatingLeft(); }, { passive: false });
    rotateLeftButton.addEventListener('mouseup', (e) => { e.preventDefault(); stopRotating(); });
    rotateLeftButton.addEventListener('mouseleave', (e) => { stopRotating(); }); // Parar si el ratón se va
    rotateLeftButton.addEventListener('touchend', (e) => { e.preventDefault(); stopRotating(); });

    // Derecha
    rotateRightButton.addEventListener('mousedown', (e) => { e.preventDefault(); startRotatingRight(); });
    rotateRightButton.addEventListener('touchstart', (e) => { e.preventDefault(); startRotatingRight(); }, { passive: false });
    rotateRightButton.addEventListener('mouseup', (e) => { e.preventDefault(); stopRotating(); });
    rotateRightButton.addEventListener('mouseleave', (e) => { stopRotating(); }); // Parar si el ratón se va
    rotateRightButton.addEventListener('touchend', (e) => { e.preventDefault(); stopRotating(); });

    // --- ¡NUEVOS! Listeners de Rotación Continua (Teclado) ---

    // Usamos esta variable para evitar que al soltar una tecla se pare la rotación
    // si la otra sigue pulsada.
    let keyRotation = 0; // -1 para Q, 1 para E

    window.addEventListener('keydown', (e) => {
        // Evitar que la rotación se active si se está escribiendo en un input (si tuvieras uno)
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
        // Solo parar si soltamos la tecla que corresponde a la dirección actual
        if ((e.key === 'q' || e.key === 'Q') && keyRotation === -1) {
            keyRotation = 0;
            stopRotating();
        } else if ((e.key === 'e' || e.key === 'E') && keyRotation === 1) {
            keyRotation = 0;
            stopRotating();
        }
    });
};

// 6. Funciones de Canvas (sin cambios)
function resizeCanvas() {
    if (canvas) {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;

        // ¡NUEVO! Redimensionar el caché y marcarlo como inválido
        if (staticWorldCache) {
            staticWorldCache.width = canvas.width;
            staticWorldCache.height = canvas.height;
            isCacheInvalid = true;
        }
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
            isCacheInvalid = true; // ¡Invalidar!
        } else if (event.deltaY > 0) {
            updateZoom(1 / ZOOM_STEP);
            isCacheInvalid = true; // ¡Invalidar!
        }
    }, { passive: false });
}

// 8. Inicializar Firebase y autenticación (sin cambios)
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

                setMoveActionDependencies(myPlayerId, db, () => currentMapId);
                setCollisionChecker(isPositionPassable);
                setPortalHandler(getPortalDestination);
                setNpcHandler(getNpcInteraction);

                infoBar.innerHTML = `Conectado. <br> <strong>Tu UserID:</strong> ${myPlayerId.substring(0, 6)}<br><strong>Instrucciones:</strong> Toca para moverte.`;

                onDisconnect(myPlayerRef).remove();

                onValue(myPlayerRef, (snapshot) => {
                    const playerData = snapshot.val();
                    if (playerData && playerData.currentMap !== currentMapId) {
                        console.log(`¡Cambio de mapa detectado! Moviendo a ${playerData.currentMap}`);
                        if (interpolatedPlayersState[myPlayerId]) {
                            interpolatedPlayersState[myPlayerId].x = playerData.x;
                            interpolatedPlayersState[myPlayerId].z = playerData.z;
                            // ¡NUEVO! Resetear la Y suavizada al cambiar de mapa
                            interpolatedPlayerVisualY = playerSize + getGroundHeightAt(playerData.x, playerData.z);
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
 * ¡MODIFICADO! Añade 'y' inicial a playersState.
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
    npcStates = {};
    currentMapId = mapId;
    isCacheInvalid = true; // ¡Forzar redibujo del caché al cargar mapa!

    // 3. Configurar nuevas referencias
    mapRef = ref(db, `moba-demo-maps/${mapId}`);
    const playersQuery = query(ref(db, 'moba-demo-players-3d'), orderByChild('currentMap'), equalTo(mapId));

    // 4. Iniciar nuevos listeners
    mapListener = onValue(mapRef, (snapshot) => {
        const data = snapshot.val();
        if (data && data.tiles) {
            
            // --- ¡¡¡CORRECCIÓN!!! ---
            // Añadir valores de fallback para width y height por si
            // faltan en la base de datos.
            data.width = data.width || 20; // Fallback a 20
            data.height = data.height || 20; // Fallback a 20
            // --- FIN CORRECCIÓN ---

            // Procesamiento de tileGrid (sin cambios)
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
            currentMapData = data;
            isCacheInvalid = true; // Datos del mapa cambiaron, invalidar caché

            // Poblar el estado de NPCs (sin cambios)
            npcStates = {};
            for (let z = 0; z < currentMapData.height; z++) {
                for (let x = 0; x < currentMapData.width; x++) {
                    const tile = currentMapData.tileGrid[z][x];
                    if (tile && typeof tile.e === 'object' && tile.e.id) {
                        const elementDef = GAME_DEFINITIONS.elementTypes[tile.e.id];
                        if (elementDef && elementDef.drawType === 'sprite' && tile.e.movement) {
                            const npcKey = `npc_${z}_${x}`;
                            npcStates[npcKey] = {
                                ...tile.e,
                                x: x + 0.5,
                                z: z + 0.5,
                                // ¡NUEVO! Añadir Y inicial
                                y: playerSize + getGroundHeightAt(x + 0.5, z + 0.5),
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
            // --- ¡¡¡CORRECCIÓN CRÍTICA!!! ---
            // Comprobar explícitamente si 'x' y 'z' son NÚMEROS.
            // La comprobación anterior (!== null) fallaba si las propiedades eran 'undefined'.
            if (data.startPosition && typeof data.startPosition.x === 'number' && typeof data.startPosition.z === 'number') {
                spawnPos = { x: data.startPosition.x + 0.5, z: data.startPosition.z + 0.5 };
            } else {
                // Esto ahora es seguro gracias al fallback Y se centra en la casilla
                spawnPos = { x: (data.width / 2) + 0.5, z: (data.height / 2) + 0.5 };
            }
            currentMapData.initialSpawn = spawnPos;

            // ¡NUEVO! Establecer la Y inicial del jugador al cargar el mapa
            interpolatedPlayerVisualY = playerSize + getGroundHeightAt(spawnPos.x, spawnPos.z);

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
                         // ¡NUEVO! Actualizar Y al teletransportarse
                         interpolatedPlayersState[myPlayerId].y = playerSize + getGroundHeightAt(playerData.x, playerData.z);
                         if(myPlayerId === interpolatedPlayersState[myPlayerId].id) {
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

    // ¡MODIFICADO! Añadir 'y' inicial al estado interpolado
    playersListener = onValue(playersQuery, (snapshot) => {
        playersState = snapshot.val() || {};
        for (const id in interpolatedPlayersState) {
            if (!playersState[id]) {
                delete interpolatedPlayersState[id];
            }
        }
        for (const id in playersState) {
            if (!interpolatedPlayersState[id]) {
                // Es un nuevo jugador
                interpolatedPlayersState[id] = {
                    ...playersState[id],
                    // ¡NUEVO! Añadir Y inicial
                    y: playerSize + getGroundHeightAt(playersState[id].x, playersState[id].z)
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
 * ¡NUEVO! Función de ayuda segura para obtener la altura de UNA casilla.
 */
function getTileHeight(tileX, tileZ) {
    if (!currentMapData || !currentMapData.tileGrid) return 0;

    // Tratar los bordes del mapa
    const clampedX = Math.max(0, Math.min(tileX, currentMapData.width - 1));
    const clampedZ = Math.max(0, Math.min(tileZ, currentMapData.height - 1));

    // if (tileX < 0 || tileX >= currentMapData.width || tileZ < 0 || tileZ >= currentMapData.height) {
    //     return 0; // Fuera del mapa, altura 0
    // }

    const tile = currentMapData.tileGrid[clampedZ][clampedX];
    return (tile && tile.h !== undefined) ? tile.h : 1.0; // Usar 1.0 como fallback
}


/**
 * ¡MODIFICADO! Obtiene la altura del suelo en una coordenada del mundo.
 * Ahora usa interpolación bilineal para una altura suave entre casillas.
 */
function getGroundHeightAt(worldX, worldZ) {
    // 1. Coordenadas de la casilla base (esquina superior-izquierda)
    const x0 = Math.floor(worldX);
    const z0 = Math.floor(worldZ);

    // 2. Coordenadas de la casilla siguiente (esquina inferior-derecha)
    const x1 = x0 + 1;
    const z1 = z0 + 1;

    // 3. Obtener la altura de las 4 casillas de esquina
    const h00 = getTileHeight(x0, z0); // Arriba-Izquierda
    const h10 = getTileHeight(x1, z0); // Arriba-Derecha
    const h01 = getTileHeight(x0, z1); // Abajo-Izquierda
    const h11 = getTileHeight(x1, z1); // Abajo-Derecha

    // 4. Calcular el "peso" o la fracción (qué tan lejos está el punto dentro de la casilla)
    const tx = worldX - x0; // Fracción X (0.0 a 1.0)
    const tz = worldZ - z0; // Fracción Z (0.0 a 1.0)

    // 5. Interpolar
    // 5a. Interpolar a lo largo del eje X para las dos filas Z
    const lerp_z0 = lerp(h00, h10, tx); // Interpolación superior
    const lerp_z1 = lerp(h01, h11, tx); // Interpolación inferior

    // 5b. Interpolar a lo largo del eje Z entre los dos valores X
    const finalHeight = lerp(lerp_z0, lerp_z1, tz);

    return finalHeight;
}



 /**
 * ¡¡¡MODIFICADO!!!
 * Dibuja SOLO el suelo PLANO (h <= 1.0) al canvas caché.
 */
function redrawStaticCache(worldBounds) {
    console.log("--- REDIBUJANDO CACHÉ ESTÁTICO (SOLO SUELO PLANO) ---");

    // 1. Limpiar el caché
    cacheCtx.fillStyle = '#333333';
    cacheCtx.fillRect(0, 0, staticWorldCache.width, staticWorldCache.height);

    // 2. Dibujar el suelo (usando projectForCache, que NO tiene offset)
    if (currentMapData && currentMapData.tileGrid) {
        // ¡MODIFICADO! Añadido '1.0' al final
        // ¡Dibuja SÓLO el suelo con altura <= 1.0!
        drawGround(cacheCtx, GAME_DEFINITIONS.groundTypes, currentCameraAngle, worldBounds, project, 1.0);
    }

    // ¡¡¡ELIMINADO!!!
    // Ya no dibujamos bloques ni portales en el caché.
    // Se dibujarán en el gameLoop.

    // 4. Marcar el caché como válido
    isCacheInvalid = false;
    lastCacheAngle = currentCameraAngle;
    lastCacheZoom = currentZoom;
    lastDrawnWorldBounds = worldBounds;
}

// ¡NUEVO! Función de ayuda para comprobar si los límites han cambiado
function haveBoundsChanged(boundsA, boundsB) {
    if (!boundsA || !boundsB) return true;
    return boundsA.minX !== boundsB.minX || boundsA.maxX !== boundsB.maxX ||
           boundsA.minZ !== boundsB.minZ || boundsA.maxZ !== boundsB.maxZ;
}


/**
 * ¡¡¡MODIFICADO!!!
 * Bucle principal del juego.
 * Ahora ordena y dibuja TODOS los objetos 3D (jugadores, NPCs, bloques, suelo alto).
 *//**
 * ¡¡¡MODIFICADO!!!
 * Bucle principal del juego.
 * Ahora ordena y dibuja TODOS los objetos 3D (jugadores, NPCs, bloques, suelo alto).
 * * --- ¡CORREGIDO! Error de 'ReferenceError: Cannot access 'playerGroundY' ---
 */
function gameLoop() {
    if (!isGameLoopRunning) return;
    requestAnimationFrame(gameLoop);
    if (!ctx || !currentMapData) return; // Esperar a que el mapa cargue

    // 1. Actualizar ángulo de la cámara (¡ahora usa lerp!)
    updateCameraAngle();

    // 2. ¡MOVIDO! Actualizar TODAS las posiciones primero
    updatePlayerPositions(); // <-- CALCULA Y NUEVA
    updateNpcPositions();

    // 3. ¡NUEVO! Actualizar la Y visual de MI jugador para la cámara
    if (myPlayerId && interpolatedPlayersState[myPlayerId]) {
        interpolatedPlayerVisualY = interpolatedPlayersState[myPlayerId].y;
    }

    // --- ¡¡¡CORRECCIÓN!!! ---
    // Declaramos 'playerGroundY' aquí, ANTES de que se use.
    const playerGroundY = interpolatedPlayerVisualY - playerSize;
    // --- FIN DE LA CORRECCIÓN ---

    // 4. ¡MOVIDO! Actualizar la cámara AHORA (usa la Y nueva)
    updateCameraPosition(myPlayerId, interpolatedPlayersState, canvas, playerGroundY);
    
    // Comprobar si la cámara se movió para invalidar el caché
    if (cameraOffset.x !== lastCameraOffsetX || cameraOffset.y !== lastCameraOffsetY) {
        isCacheInvalid = true;
        lastCameraOffsetX = cameraOffset.x;
        lastCameraOffsetY = cameraOffset.y;
    }
    
    // 5. ¡MOVIDO! Actualizar el hover AHORA (usa la Y nueva)
    updateHoveredState();

    // 6. Calcular límites visuales AHORA (usa la Y nueva)
    // La línea 'const playerGroundY = ...' se movió hacia arriba
    const worldBounds = calculateVisibleWorldBounds(canvas, playerGroundY);

    // --- ¡NUEVA LÓGICA DE CACHÉ! ---
    // Invalida el caché si:
    // 1. Está girando.
    // 2. El zoom cambió (se marca en 'handleZoomIn/Out').
    // 3. El ángulo *finalizó* de girar (y es diferente al caché).
    // 4. Los límites del mundo visibles (frustum) han cambiado.
    const isRotating = isCameraRotating();

    if (isRotating || isCacheInvalid || haveBoundsChanged(worldBounds, lastDrawnWorldBounds)) {
        // Redibujar SIEMPRE si es inválido, está girando, o nos movemos.
        redrawStaticCache(worldBounds);
    }
    // --------------------------------

    // 1. Limpiar pantalla principal
    ctx.fillStyle = '#333333';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 2. ¡DIBUJAR EL CACHÉ!
    // El caché (staticWorldCache) se dibujó con project(..., false) -> SIN offset
    // Ahora lo movemos a su sitio en la pantalla.
    ctx.drawImage(staticWorldCache, 0, 0);

    // 3. Crear lista de "cosas" a dibujar
    let renderables = [];

    // --- AÑADIR JUGADORES ---
    for (const id in interpolatedPlayersState) {
        const p = interpolatedPlayersState[id];
        // Comprobar si está dentro de los límites visibles
        if (p.x >= worldBounds.minX && p.x <= worldBounds.maxX &&
            p.z >= worldBounds.minZ && p.z <= worldBounds.maxZ)
        {
            renderables.push({
                id: p.id,
                type: 'player',
                x: p.x,
                y: p.y - playerSize, // Esta es la Y del SUELO
                z: p.z
            });
        }
    }

    // --- AÑADIR NPCs ---
    for (const [key, npc] of Object.entries(npcStates)) {
         if (npc.x >= worldBounds.minX && npc.x <= worldBounds.maxX &&
            npc.z >= worldBounds.minZ && npc.z <= worldBounds.maxZ)
        {
            const elementDef = GAME_DEFINITIONS.elementTypes[npc.id];
            if (elementDef) {
                renderables.push({
                    id: key,
                    type: 'element', // Los NPCs se dibujan como 'element'
                    definition: elementDef,
                    x: npc.x,
                    y: npc.y - playerSize, // Y es la altura del suelo, no la cabeza
                    z: npc.z,
                    isHovered: (hoveredItemKey === key),
                    instance: npc // Pasar la instancia del NPC
                });
            }
        }
    }

    // --- ¡¡¡NUEVO!!! AÑADIR SUELO ALTO, BLOQUES Y PORTALES ---
    if (currentMapData && currentMapData.tileGrid) {
        const zStart = Math.max(0, worldBounds.minZ);
        const zEnd = Math.min(currentMapData.height, worldBounds.maxZ);
        const xStart = Math.max(0, worldBounds.minX);
        const xEnd = Math.min(currentMapData.width, worldBounds.maxX);

        for (let z = zStart; z < zEnd; z++) {
            for (let x = xStart; x < xEnd; x++) {
                if (z < 0 || z >= currentMapData.height || x < 0 || x >= currentMapData.width) continue;

                const tile = currentMapData.tileGrid[z][x];
                if (!tile) continue;

                const height = (tile.h !== undefined) ? tile.h : 1.0;
                const elementId = (typeof tile.e === 'object' && tile.e) ? tile.e.id : tile.e;
                const elementDef = GAME_DEFINITIONS.elementTypes[elementId];
                
                // 1. Añadir SUELO ALTO (¡Tu acantilado!)
                if (height > 1.0) { // <-- ¡CLAVE! Si el suelo es más alto que 1.0
                    const groundDef = GAME_DEFINITIONS.groundTypes[tile.g] || GAME_DEFINITIONS.groundTypes['void'];
                    if (groundDef) {
                        renderables.push({
                            id: `ground_${z}_${x}`,
                            type: 'ground', // Nuevo tipo para el dibujado
                            definition: groundDef,
                            x: x, // drawGroundTile usa x, z
                            y: height, // 'y' almacena la altura
                            z: z, 
                            isHovered: false, 
                            instance: null
                        });
                    }
                }

                // 2. Añadir BLOQUES y PORTALES (Elementos 3D)
                if (elementDef && (elementDef.drawType === 'block' || elementDef.drawType === 'portal')) {
                    // ¡OJO! La altura base de un bloque es la del suelo.
                    const baseHeight = getGroundHeightAt(x + 0.5, z + 0.5);
                    const itemKey = `${elementDef.drawType}_${z}_${x}`;
                    
                    renderables.push({
                        id: itemKey,
                        type: 'element', // Tipo 'element'
                        definition: elementDef,
                        x: x + 0.5, // drawBlock usa el centro
                        y: baseHeight, // 'y' es la altura del suelo de abajo
                        z: z + 0.5,
                        isHovered: (hoveredItemKey === itemKey),
                        instance: null
                    });
                }
            }
        }
    }


    // 4. Ordenar (¡¡¡LÓGICA COMPLETAMENTE NUEVA!!!)
    if (currentMapData) {
        const cosA = Math.cos(currentCameraAngle);
        const sinA = Math.sin(currentCameraAngle);

        renderables.sort((a, b) => {
            // Coordenadas del centro para el ordenado
            let a_x = (a.type === 'ground') ? a.x + 0.5 : a.x;
            let a_z = (a.type === 'ground') ? a.z + 0.5 : a.z;
            let b_x = (b.type === 'ground') ? b.x + 0.5 : b.x;
            let b_z = (b.type === 'ground') ? b.z + 0.5 : b.z;

            // Calcular la "profundidad" de la pantalla para 'a' y 'b'
            const depthA = (a_x * cosA - a_z * sinA) + (a_x * sinA + a_z * cosA);
            const depthB = (b_x * cosA - b_z * sinA) + (b_x * sinA + b_z * cosA);

            // --- ¡¡¡AJUSTE FINO!!! ---
            // Si las profundidades son casi iguales, usar la altura Y como desempate.
            if (Math.abs(depthA - depthB) < 0.001) { 
                
                // Desempate por la `y` de la *base*.
                // (Nota: 'y' en los 'renderables' ya es la 'y' de la base/suelo
                // gracias a las correcciones anteriores)
                let a_y_base = a.y;
                let b_y_base = b.y;
                
                if (Math.abs(a_y_base - b_y_base) > 0.001) {
                    // Dibujar el que tenga base MÁS BAJA (e.g. suelo) primero.
                    return a_y_base - b_y_base;
                }
                
                // Si las bases son iguales (NPC y Suelo en el mismo tile)
                // Dar prioridad al suelo para que se dibuje primero.
                if (a.type === 'ground' && b.type !== 'ground') {
                    return -1; // 'a' (suelo) viene primero
                }
                if (a.type !== 'ground' && b.type === 'ground') {
                    return 1; // 'b' (suelo) viene primero
                }
                
                return 0;
            }

            // --- ¡¡¡CORRECCIÓN PRINCIPAL!!! ---
            // Orden principal por profundidad ASCENDENTE.
            return depthA - depthB;
        });
    }

    // 5. Dibujar TODO (¡MODIFICADO!)
    for (const item of renderables) {
        if (item.type === 'player') {
            // Para dibujar el jugador, SÍ necesitamos la 'Y' de la cabeza.
            // La 'y' en el item es la del suelo, así que sumamos playerSize.
            const screenPos = project(item.x, item.y + playerSize, item.z);
            drawPlayer(item, screenPos);

        } else if (item.type === 'element') {
            // Dibuja NPCs, Bloques y Portales
            // La 'y' en el item es la del suelo, que es lo que esperan
            // las funciones de dibujo (drawSprite, drawBlock).
            if (item.definition.draw) {
                item.definition.draw(
                    ctx, project, item.definition, currentZoom,
                    item.x,
                    item.y, // 'baseHeight' (suelo)
                    item.z,
                    item.isHovered,
                    item.instance,
                    currentCameraAngle
                );
            }
        } else if (item.type === 'ground') { // <-- ¡NUEVA SECCIÓN!
            // Dibuja el tile de suelo alto
            // 'y' almacena la altura
            drawGroundTile(
                ctx,
                project, // El project global con offset
                item.x,
                item.z,
                item.definition,
                item.y, // 'y' almacena la altura
                currentZoom,
                currentCameraAngle
            );
        }
    }
}
/**
 * ¡MODIFICADO!
 * Interpola la 'y' de todos los jugadores (incluido el mío, aunque se anule)
 */
function updatePlayerPositions() {
    for (const id in playersState) {
        const targetPlayerData = playersState[id];
        const playerMesh = interpolatedPlayersState[id];
        if (!playerMesh || targetPlayerData.currentMap !== currentMapId) {
            continue;
        }

        // Interpolar X y Z
        const targetX = targetPlayerData.x;
        const targetZ = targetPlayerData.z;
        const dx = targetX - playerMesh.x;
        const dz = targetZ - playerMesh.z;
        const distance = Math.sqrt(dx * dx + dz * dz);

        if (playerMesh.currentMap !== targetPlayerData.currentMap) {
             playerMesh.x = targetX;
             playerMesh.z = targetZ;
             // ¡NUEVO! Actualizar Y al cambiar de mapa
             playerMesh.y = playerSize + getGroundHeightAt(targetX, targetZ);
             playerMesh.currentMap = targetPlayerData.currentMap;
             continue;
        }

        if (distance < MOVEMENT_SPEED) {
            playerMesh.x = targetX;
            playerMesh.z = targetZ;
        } else {
            const normX = dx / distance;
            const normZ = dz / distance;
            
            // --- ¡¡¡MODIFICACIÓN CLAVE!!! ---
            // 1. Calcular el *próximo* paso potencial
            const nextX = playerMesh.x + normX * MOVEMENT_SPEED;
            const nextZ = playerMesh.z + normZ * MOVEMENT_SPEED;

            // 2. Comprobar la colisión en ESE paso
            // (isPositionPassable está definida más abajo en main.js)
            if (isPositionPassable(nextX, nextZ)) {
                // 3. Si es seguro, mover
                playerMesh.x = nextX;
                playerMesh.z = nextZ;
            } else {
                // 4. Si no es seguro (else), simplemente NO actualizamos
                // la posición. El jugador se detendrá automáticamente
                // al "chocar" con el obstáculo.
                
                // Opcional: Para evitar que se "atasque" si el target
                // sigue siendo inalcanzable, podríamos forzar el target
                // local a la posición actual para detener el intento,
                // pero no es estrictamente necesario.
                
                // playerMesh.x = playerMesh.x; (no hacer nada)
                // playerMesh.z = playerMesh.z; (no hacer nada)
            }
            // --- FIN DE LA MODIFICACIÓN ---
        }

        // --- ¡NUEVO! Interpolar Y ---
        // La Y se interpola en la posición final del fotograma (ya sea
        // la nueva o la antigua si hubo colisión).
        const targetY = playerSize + getGroundHeightAt(playerMesh.x, playerMesh.z);
        playerMesh.y = lerp(playerMesh.y, targetY, PLAYER_LERP_AMOUNT);
    }
}

/**
 * ¡MODIFICADO!
 * Interpola la 'y' de los NPCs.
 */
function updateNpcPositions() {
    const now = Date.now();
    for (const key in npcStates) {
        const npc = npcStates[key];

        // Mover NPC (X, Z)
        if (npc.isMoving) {
            const dx = npc.targetX - npc.x;
            const dz = npc.targetZ - npc.z;
            const distance = Math.sqrt(dx * dx + dz * dz);

            if (distance < NPC_MOVE_SPEED) {
                npc.x = npc.targetX;
                npc.z = npc.targetZ;
                npc.isMoving = false;
                npc.lastMoveTime = now;
                if (npc.movement === 'route' && npc.route && npc.route.length > 0) {
                    npc.currentTargetIndex = (npc.currentTargetIndex + 1) % npc.route.length;
                }
            } else {
                const normX = dx / distance;
                const normZ = dz / distance;
                npc.x += normX * NPC_MOVE_SPEED;
                npc.z += normZ * NPC_MOVE_SPEED;
            }
        }
        // Decidir nuevo movimiento (lógica sin cambios)
        else {
            if (npc.movement === 'route' && npc.route && npc.route.length > 0) {
                const targetWaypoint = npc.route[npc.currentTargetIndex];
                const targetX = targetWaypoint[0] + 0.5;
                const targetZ = targetWaypoint[1] + 0.5;
                if (npc.x !== targetX || npc.z !== targetZ) {
                    npc.targetX = targetX;
                    npc.targetZ = targetZ;
                    npc.isMoving = true;
                }
            } else if (npc.movement === 'random') {
                if (now - npc.lastMoveTime > NPC_RANDOM_WAIT_TIME && Math.random() < NPC_RANDOM_MOVE_CHANCE) {
                    const randomDir = Math.floor(Math.random() * 4);
                    let targetX = npc.x;
                    let targetZ = npc.z;
                    if (randomDir === 0) targetX += 1;
                    else if (randomDir === 1) targetX -= 1;
                    else if (randomDir === 2) targetZ += 1;
                    else if (randomDir === 3) targetZ -= 1;
                    if (isPositionPassable(targetX, targetZ)) {
                        npc.targetX = targetX;
                        npc.targetZ = targetZ;
                        npc.isMoving = true;
                    }
                }
            }
        }

        // --- ¡NUEVO! Interpolar Y del NPC ---
        const targetNpcY = playerSize + getGroundHeightAt(npc.x, npc.z);
        npc.y = lerp(npc.y, targetNpcY, PLAYER_LERP_AMOUNT);
    }
}

/**
 * Comprueba qué objeto interactuable está bajo el cursor.
 * ¡MODIFICADO! Usa la Y del jugador para la proyección inversa.
 */
function updateHoveredState() {
    if (!canvas) return;

    // --- ¡¡¡ARREGLO DEFINITIVO!!! ---
    // ¡DEBEMOS USAR LA ALTURA DEL SUELO, NO LA ALTURA DE LA CABEZA!
    const playerGroundY = interpolatedPlayerVisualY - playerSize;
    const worldCoords = inverseProject(mouseScreenPos.x, mouseScreenPos.y, playerGroundY);
    // --- FIN DEL ARREGLO ---

    let foundKey = null;

    // 2. Comprobar NPCs (lógica sin cambios)
    for (const [key, npc] of Object.entries(npcStates)) {
        if (npc.interaction === 'dialog') {
            const dist = Math.hypot(npc.x - worldCoords.x, npc.z - worldCoords.z);
            if (dist < INTERACTION_RADIUS) {
                foundKey = key;
                break;
            }
        }
    }

    // 3. Comprobar Portales y Bloques (lógica sin cambios)
    if (!foundKey && currentMapData && currentMapData.tileGrid) {
        // Optimización: solo comprobar las casillas cercanas al cursor
        const checkRadius = 2;
        const xStart = Math.max(0, Math.floor(worldCoords.x) - checkRadius);
        const xEnd = Math.min(currentMapData.width, Math.ceil(worldCoords.x) + checkRadius);
        const zStart = Math.max(0, Math.floor(worldCoords.z) - checkRadius);
        const zEnd = Math.min(currentMapData.height, Math.ceil(worldCoords.z) + checkRadius);

        for (let z = zStart; z < zEnd; z++) {
            if (foundKey) break;
            for (let x = xStart; x < xEnd; x++) {
                const tile = currentMapData.tileGrid[z][x];
                if (tile && typeof tile.e === 'object' && tile.e.id) {
                    const elementDef = GAME_DEFINITIONS.elementTypes[tile.e.id];
                    if (elementDef && (elementDef.drawType === 'portal' || elementDef.drawType === 'block')) {
                        const dist = Math.hypot((x + 0.5) - worldCoords.x, (z + 0.5) - worldCoords.z);
                        if (dist < INTERACTION_RADIUS) {
                            foundKey = `${elementDef.drawType}_${z}_${x}`;
                            break;
                        }
                    }
                }
            }
        }
    }

    hoveredItemKey = foundKey;
    canvas.style.cursor = hoveredItemKey ? 'pointer' : 'crosshair';
}


/**
 * ¡¡¡MODIFICADO!!!
 * Dibuja el suelo 3D.
 * Acepta 'maxHeightToDraw' para que el caché pueda dibujar solo el suelo plano.
 */
function drawGround(ctx, groundTypes, cameraAngle = 0, worldBounds, projectFunc, maxHeightToDraw = 999) {
   if (!currentMapData || !currentMapData.tileGrid) {
        drawGroundGrid(); // Dibuja una rejilla si no hay mapa
        return;
    }

    if (!worldBounds) {
        worldBounds = {
            minX: 0, maxX: currentMapData.width,
            minZ: 0, maxZ: currentMapData.height
        };
    }

    const voidDef = groundTypes['void'] || { color: '#111' };

    const cosA = Math.cos(cameraAngle);
    const sinA = Math.sin(cameraAngle);
    const xDepth = cosA + sinA;
    const zDepth = cosA - sinA;

    const mapMinZ = 0;
    const mapMaxZ = currentMapData.height - 1;
    const mapMinX = 0;
    const mapMaxX = currentMapData.width - 1;

    const zLoopStart = Math.max(mapMinZ, Math.floor(worldBounds.minZ));
    const zLoopEnd = Math.min(mapMaxZ, Math.ceil(worldBounds.maxZ));
    const xLoopStart = Math.max(mapMinX, Math.floor(worldBounds.minX));
    const xLoopEnd = Math.min(mapMaxX, Math.ceil(worldBounds.maxX));

    const zStart = (zDepth > 0) ? zLoopStart : zLoopEnd;
    const zEnd = (zDepth > 0) ? zLoopEnd + 1 : zLoopStart - 1;
    const zIncrement = (zDepth > 0) ? 1 : -1;

    const xStart = (xDepth > 0) ? xLoopStart : xLoopEnd;
    const xEnd = (xDepth > 0) ? xLoopEnd + 1 : xLoopStart - 1;
    const xIncrement = (xDepth > 0) ? 1 : -1;

    for (let z = zStart; z !== zEnd; z += zIncrement) {
        for (let x = xStart; x !== xEnd; x += xIncrement) {
            
            if (z < 0 || z >= currentMapData.height || x < 0 || x >= currentMapData.width) {
                continue;
            }

            const tile = currentMapData.tileGrid[z][x];

            // --- ¡NUEVO! Comprobar altura ANTES de dibujar ---
            const height = (tile && tile.h !== undefined) ? tile.h : 1.0;
            if (height > maxHeightToDraw) {
                continue; // Saltar este tile, se dibujará en el gameLoop
            }
            // --- FIN DEL NUEVO CÓDIGO ---

            const groundDef = (tile && groundTypes[tile.g])
                              ? groundTypes[tile.g]
                              : voidDef;

            // ¡MODIFICADO! 'height' ya se ha calculado arriba
            // const height = (tile && tile.h !== undefined) ? tile.h : 1.0; 

            drawGroundTile(ctx, projectFunc, x, z, groundDef, height, currentZoom, cameraAngle);
        }
    }
}

// drawGroundGrid (sin cambios)
function drawGroundGrid() {
    ctx.strokeStyle = '#4CAF50';
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.5;
    const gridSize = 20;
    for (let i = -gridSize; i <= gridSize; i++) {
        let p1 = project(i, 0, -gridSize);
        let p2 = project(i, 0, gridSize);
        ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
        let p3 = project(-gridSize, 0, i);
        let p4 = project(gridSize, 0, i);
        ctx.beginPath(); ctx.moveTo(p3.x, p3.y); ctx.lineTo(p4.x, p4.y); ctx.stroke();
    }
    ctx.globalAlpha = 1.0;
}

/**
 * Dibuja al jugador. (sin cambios)
 */
function drawPlayer(player, screenPos) {
    const scaledImgWidth = playerImgWidth * currentZoom;
    const scaledImgHeight = playerImgHeight * currentZoom;
    const fallbackWidth = 16 * currentZoom;
    const fallbackHeight = 32 * currentZoom;

    if (playerImgLoaded) {
        ctx.drawImage(
            playerImg,
            screenPos.x - scaledImgWidth / 2,
            screenPos.y - scaledImgHeight, // Dibujar hacia arriba desde los pies
            scaledImgWidth,
            scaledImgHeight
        );
    } else {
        ctx.fillStyle = (player.id === myPlayerId) ? '#00FFFF' : '#FF0000';
        ctx.fillRect(
            screenPos.x - fallbackWidth / 2,
            screenPos.y - fallbackHeight,
            fallbackWidth,
            fallbackHeight
        );
    }
    ctx.fillStyle = 'white';
    ctx.textAlign = 'center';
    ctx.font = `${12 * currentZoom}px Inter`;
    ctx.fillText(
        player.id.substring(0, 6),
        screenPos.x,
        screenPos.y - scaledImgHeight - (5 * currentZoom) // Texto encima de la cabeza
    );
}

// 14. Funciones de Lógica de Juego (sin cambios)
/**
 * Chequeo de colisión (incluye escalones).
 */
function isPositionPassable(worldX, worldZ) {
    if (!currentMapData || !currentMapData.tileGrid) return false;
    const tileX = Math.floor(worldX);
    const tileZ = Math.floor(worldZ);
    if (tileX < 0 || tileX >= currentMapData.width || tileZ < 0 || tileZ >= currentMapData.height) {
        return false; // Fuera del mapa
    }
    const tile = currentMapData.tileGrid[tileZ][tileX];
    if (!tile) return false;

    const groundDef = GAME_DEFINITIONS.groundTypes[tile.g];
    const elementId = (typeof tile.e === 'object' && tile.e !== null) ? tile.e.id : tile.e;
    const elementDef = GAME_DEFINITIONS.elementTypes[elementId];

    if (!groundDef || !elementDef) return false;

    if (elementDef.drawType === 'block') {
        return false; // Los bloques siempre colisionan
    }

    const basePassable = groundDef.passable && elementDef.passable;
    if (!basePassable) {
        return false;
    }

    // --- Chequeo de Altura ---
    const myPlayer = interpolatedPlayersState[myPlayerId];
    if (!myPlayer) {
        return true;
    }

    // ¡MODIFICADO! Usar la Y visual suavizada para una colisión más natural
    const currentHeight = interpolatedPlayerVisualY - playerSize;
    const targetHeight = getGroundHeightAt(worldX, worldZ);

    // ¡MODIFICADO! Aumentar el MAX_STEP_HEIGHT ligeramente para compensar la interpolación
    const MAX_STEP_HEIGHT = 1.0; // ¡Ajustado a 1.0!

    if (Math.abs(currentHeight - targetHeight) > MAX_STEP_HEIGHT) {
        return false; // El escalón es demasiado alto
    }

    return true; // Es transitable
}

// getPortalDestination (sin cambios)
function getPortalDestination(worldX, worldZ) {
    if (!currentMapData || !currentMapData.tileGrid) return null;
    const tileX = Math.floor(worldX);
    const tileZ = Math.floor(worldZ);
    if (tileX < 0 || tileX >= currentMapData.width || tileZ < 0 || tileZ >= currentMapData.height) {
        return null;
    }
    const tile = currentMapData.tileGrid[tileZ][tileX];

    if (tile && typeof tile.e === 'object' && tile.e.id) {
        const elementId = tile.e.id;
        const elementDef = GAME_DEFINITIONS.elementTypes[elementId];

        if (elementDef && elementDef.drawType === 'portal')
        {
            if (tile.e.destMap && tile.e.destX !== null && tile.e.destZ !== null) {
                return {
                    mapId: tile.e.destMap,
                    x: tile.e.destX + 0.5,
                    z: tile.e.destZ + 0.5
                };
            }
            else if (tile.e.destX !== null && tile.e.destZ !== null) {
                return {
                    mapId: currentMapId,
                    x: tile.e.destX + 0.5,
                    z: tile.e.destZ + 0.5
                };
            }
        }
    }

    return null;
}


// --- Funciones de Interacción con NPC (Sin cambios) ---
function showNpcModal(text) {
    if (npcModalContainer) {
        npcModalText.textContent = text || "Hola, viajero.";
        npcModalContainer.className = 'npc-modal-visible';
    }
}

function hideNpcModal() {
    if (npcModalContainer) {
        npcModalContainer.className = 'npc-modal-hidden';
    }
}

function getNpcInteraction(worldX, worldZ) {
    const myPlayer = interpolatedPlayersState[myPlayerId];
    if (!myPlayer) {
        return false;
    }

    let clickedNpc = null;
    let minDistanceSq = INTERACTION_RADIUS * INTERACTION_RADIUS;

    for (const npc of Object.values(npcStates)) {
        const dx = npc.x - worldX; // Distancia del NPC al CLIC
        const dz = npc.z - worldZ;
        const distanceSq = dx * dx + dz * dz;

        if (distanceSq < minDistanceSq) {
            minDistanceSq = distanceSq;
            clickedNpc = npc;
        }
    }

    if (!clickedNpc) {
        return false;
    }

    if (clickedNpc.interaction !== 'dialog') {
        return false;
    }

    const playerX = myPlayer.x;
    const playerZ = myPlayer.z;
    const npcX = clickedNpc.x;
    const npcZ = clickedNpc.z;

    const distance = Math.sqrt(Math.pow(playerX - npcX, 2) + Math.pow(playerZ - npcZ, 2));

    if (distance <= MELEE_RANGE) {
        console.log(`Interactuando con NPC ${clickedNpc.id}. Distancia: ${distance}`);
        showNpcModal(clickedNpc.dialogText);
        return true;
    } else {
        console.log(`NPC ${clickedNpc.id} demasiado lejos. Distancia: ${distance}`);
        return false;
    }
}

