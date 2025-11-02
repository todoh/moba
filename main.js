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
    updateCameraPosition, 
    updateZoom, ZOOM_STEP, currentZoom, 
    inverseProject,
    startRotatingLeft,  // ¡NUEVO!
    startRotatingRight, // ¡NUEVO!
    stopRotating,       // ¡NUEVO!
    updateCameraAngle,
    currentCameraAngle 
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
    const handleZoomIn = (e) => { e.preventDefault(); updateZoom(ZOOM_STEP); };
    const handleZoomOut = (e) => { e.preventDefault(); updateZoom(1 / ZOOM_STEP); };
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
        } else if (event.deltaY > 0) {
            updateZoom(1 / ZOOM_STEP);
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
    
    // 3. Configurar nuevas referencias
    mapRef = ref(db, `moba-demo-maps/${mapId}`);
    const playersQuery = query(ref(db, 'moba-demo-players-3d'), orderByChild('currentMap'), equalTo(mapId));

    // 4. Iniciar nuevos listeners
    mapListener = onValue(mapRef, (snapshot) => {
        const data = snapshot.val();
        if (data && data.tiles) {
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
            if (data.startPosition && data.startPosition.x !== null && data.startPosition.z !== null) {
                spawnPos = { x: data.startPosition.x + 0.5, z: data.startPosition.z + 0.5 };
            } else {
                spawnPos = { x: data.width / 2, z: data.height / 2 };
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
 * ¡MODIFICADO!
 * Bucle principal del juego.
 * Ahora usa la Y visual suavizada para el jugador y la cámara.
 */
function gameLoop() {
    if (!isGameLoopRunning) return; 
    
    requestAnimationFrame(gameLoop); 
    if (!ctx) return; 

    // 1. Actualizar ángulo de la cámara (sin cambios)
    updateCameraAngle();

    // 2. Actualizar Y suavizada
    if (myPlayerId && interpolatedPlayersState[myPlayerId]) {
        const myPlayer = interpolatedPlayersState[myPlayerId];
        // ¡CORRECCIÓN 2! Esta línea faltaba. Calcula la Y objetivo.
        const targetPlayerVisualY = playerSize + getGroundHeightAt(myPlayer.x, myPlayer.z);
        // Ahora interpola hacia ese objetivo
        interpolatedPlayerVisualY = lerp(interpolatedPlayerVisualY, targetPlayerVisualY, PLAYER_LERP_AMOUNT);
    }
    
    // 3. Actualizar cámara (sin cambios)
    updateCameraPosition(myPlayerId, interpolatedPlayersState, canvas, interpolatedPlayerVisualY);
    
    // 4. Actualizar posiciones (sin cambios)
    updatePlayerPositions(); 
    updateNpcPositions();
    updateHoveredState(); 
    
    ctx.fillStyle = '#333333';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // --- ¡MODIFICADO! ---
    // 1. Dibujar el suelo (Ahora pasamos el ángulo)
    drawGround(GAME_DEFINITIONS.groundTypes, currentCameraAngle);

    // 2. Crear lista de "cosas" a dibujar
    let renderables = [];
    
    // Añadir jugadores a la lista
    for (const id in interpolatedPlayersState) {
        const p = interpolatedPlayersState[id];
        renderables.push({
            id: p.id,
            x: p.x,
            y: p.y, // ¡Usar la Y interpolada!
            z: p.z,
            type: 'player',
            isHovered: false
        });
    }

    // Añadir NPCs a la lista
    for (const [key, npc] of Object.entries(npcStates)) {
        renderables.push({
            id: npc.id,
            x: npc.x,
            y: npc.y, // ¡Usar la Y interpolada!
            z: npc.z,
            type: 'element',
            definition: GAME_DEFINITIONS.elementTypes[npc.id],
            instance: npc,
            isHovered: (hoveredItemKey === key)
        });
    }

    // Añadir elementos del mapa (Bloques, Portales)
    if (currentMapData && currentMapData.tileGrid) {
        for (let z = 0; z < currentMapData.height; z++) {
            for (let x = 0; x < currentMapData.width; x++) {
                const tile = currentMapData.tileGrid[z][x];
                if (!tile || !tile.e || tile.e === 'none') continue;
                
                const elementId = (typeof tile.e === 'object') ? tile.e.id : tile.e;
                const elementDef = GAME_DEFINITIONS.elementTypes[elementId];

                if (elementDef && (elementDef.drawType === 'block' || elementDef.drawType === 'portal')) {
                     const key = `${elementDef.drawType}_${z}_${x}`;
                     renderables.push({
                        id: key,
                        x: x + 0.5,
                        y: getGroundHeightAt(x + 0.5, z + 0.5), // Base para bloques
                        z: z + 0.5,
                        type: 'element',
                        definition: elementDef,
                        instance: (typeof tile.e === 'object') ? tile.e : null,
                        isHovered: (hoveredItemKey === key)
                    });
                }
            }
        }
    }
     
    // --- ¡MODIFICADO! ---
    // 3. Ordenar (¡Lógica de ordenamiento dinámica!)
    
    // Pre-calcular el coseno y seno del ángulo actual
    const cosA = Math.cos(currentCameraAngle);
    const sinA = Math.sin(currentCameraAngle);
    
    // Calcular el vector de "profundidad"
    // Este es el vector que apunta "hacia dentro" de la pantalla
    const depthX = cosA + sinA;
    const depthZ = cosA - sinA;

    // Asignar una "clave de profundidad" (sortKey) a cada objeto
    for (const item of renderables) {
        // La profundidad es un producto punto de la posición (x,z) y el vector de profundidad
        item.sortKey = item.x * depthX + item.z * depthZ;
    }

    // Ordenar usando la nueva clave
    renderables.sort((a, b) => a.sortKey - b.sortKey);


    // 4. Dibujar todo (¡MODIFICADO! Pasar el ángulo)
    for (const item of renderables) {
        if (item.type === 'player') {
            const screenPos = project(item.x, item.y, item.z); 
            drawPlayer(item, screenPos);
        } else if (item.type === 'element') {
            if (item.definition.draw) {
                let baseHeight = item.y;
                // Los sprites se dibujan *sobre* la altura del suelo (item.y)
                // Los bloques se dibujan *desde* la altura del suelo (item.y)
                // (La función drawBlock maneja esto internamente)
                
                item.definition.draw(
                    ctx, project, item.definition, currentZoom, 
                    item.x, 
                    baseHeight, 
                    item.z, 
                    item.isHovered, 
                    item.instance,
                    currentCameraAngle // <-- ¡NUEVO! Pasar el ángulo
                );
            }
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
            playerMesh.x += normX * MOVEMENT_SPEED;
            playerMesh.z += normZ * MOVEMENT_SPEED;
        }
        
        // --- ¡NUEVO! Interpolar Y ---
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
    
    // ¡MODIFICADO! Usar la Y suavizada del jugador para la proyección
    const worldCoords = inverseProject(mouseScreenPos.x, mouseScreenPos.y, interpolatedPlayerVisualY);
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
        for (let z = 0; z < currentMapData.height; z++) {
            if (foundKey) break; 
            for (let x = 0; x < currentMapData.width; x++) {
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
 * Dibuja el suelo 3D. (sin cambios)
 */
function drawGround(groundTypes, cameraAngle = 0) { // <-- ¡NUEVO! Aceptar ángulo
    if (!currentMapData || !currentMapData.tileGrid) {
        drawGroundGrid(); 
        return;
    }
    const voidDef = groundTypes['void'] || { color: '#111' }; 
    
    // --- ¡NUEVA LÓGICA DE DIRECCIÓN DE BUCLE! ---
    const cosA = Math.cos(cameraAngle);
    const sinA = Math.sin(cameraAngle);

    // Determinar la dirección de los ejes del mundo en la pantalla
    const xDepth = cosA + sinA; // Profundidad del eje X
    const zDepth = cosA - sinA; // Profundidad del eje Z

    // Configurar bucles para dibujar de atrás hacia adelante
    const zStart = (zDepth > 0) ? 0 : currentMapData.height - 1;
    const zEnd = (zDepth > 0) ? currentMapData.height : -1;
    const zIncrement = (zDepth > 0) ? 1 : -1;

    const xStart = (xDepth > 0) ? 0 : currentMapData.width - 1;
    const xEnd = (xDepth > 0) ? currentMapData.width : -1;
    const xIncrement = (xDepth > 0) ? 1 : -1;

    for (let z = zStart; z !== zEnd; z += zIncrement) {
        for (let x = xStart; x !== xEnd; x += xIncrement) {
    // --- Fin de la nueva lógica ---
            
            const tile = currentMapData.tileGrid[z][x];
            const groundDef = (tile && groundTypes[tile.g]) 
                              ? groundTypes[tile.g] 
                              : voidDef; 
            
            const height = (tile && tile.h !== undefined) ? tile.h : 1.0;
            
            // ¡MODIFICADO! Pasar el ángulo
            drawGroundTile(ctx, project, x, z, groundDef, height, currentZoom, cameraAngle);
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

