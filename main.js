// ==================================================
// ### SCRIPT PRINCIPAL (MAIN.JS) ###
// ==================================================

// 1. Importaciones de Firebase
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getDatabase, ref, set, onValue, onDisconnect, query, orderByChild, equalTo, off } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

// 2. Importaciones de la lógica del juego
import { project, updateCameraPosition, updateZoom, ZOOM_STEP, currentZoom, inverseProject } from './camera.js';
import { setupClickMove2_5D, setMoveActionDependencies, setCollisionChecker, setPortalHandler, setNpcHandler } from './move-action.js';
import { loadGameDefinitions, drawGroundTile } from './elements.js';


// 3. Configuración de Firebase
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

// Variables del Modal de NPC
let npcModalContainer, npcModalText, npcModalClose;
const MELEE_RANGE = 2.0; // Distancia (en casillas) para interactuar

// Estado de NPCs y constantes de movimiento
let npcStates = {}; 
const NPC_MOVE_SPEED = 0.02; 
const NPC_RANDOM_MOVE_CHANCE = 0.005; 
const NPC_RANDOM_WAIT_TIME = 2000; 

// Variables de Hover
let mouseScreenPos = { x: 0, y: 0 };
let hoveredItemKey = null; // 'npc_z_x', 'portal_z_x', o 'block_z_x'
const INTERACTION_RADIUS = 0.75; 

const playerSize = 1.0; 
const playerImg = new Image();
let playerImgLoaded = true;
const playerImgWidth = 250; 
const playerImgHeight = 250; 
const playerTextureURL = 'samurai.png'; 

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

    // Listeners de Zoom
    const zoomInButton = document.getElementById('zoom-in');
    const zoomOutButton = document.getElementById('zoom-out');
    const handleZoomIn = (e) => { e.preventDefault(); updateZoom(ZOOM_STEP); };
    const handleZoomOut = (e) => { e.preventDefault(); updateZoom(1 / ZOOM_STEP); };
    zoomInButton.addEventListener('touchstart', handleZoomIn, { passive: false });
    zoomInButton.addEventListener('click', handleZoomIn);
    zoomOutButton.addEventListener('touchstart', handleZoomOut, { passive: false });
    zoomOutButton.addEventListener('click', handleZoomOut);
};

// 6. Funciones de Canvas
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
 * @param {string} mapId 
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
            // Procesamiento de tileGrid
            data.tileGrid = [];
            for (let z = 0; z < data.height; z++) {
                const row = [];
                for (let x = 0; x < data.width; x++) {
                    const tile = data.tiles[z * data.width + x] || { g: 'void', e: 'none' };
                    row.push(tile);
                }
                data.tileGrid.push(row);
            }
            currentMapData = data;
            
            // Poblar el estado de NPCs
            npcStates = {}; 
            for (let z = 0; z < currentMapData.height; z++) {
                for (let x = 0; x < currentMapData.width; x++) {
                    const tile = currentMapData.tileGrid[z][x];
                    if (tile && typeof tile.e === 'object' && tile.e.id) {
                        const elementDef = GAME_DEFINITIONS.elementTypes[tile.e.id];
                        // Es un NPC si es un sprite y tiene config de movimiento
                        if (elementDef && elementDef.drawType === 'sprite' && tile.e.movement) {
                            const npcKey = `npc_${z}_${x}`; 
                            npcStates[npcKey] = {
                                ...tile.e, 
                                x: x + 0.5, 
                                z: z + 0.5, 
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
        playersState = snapshot.val() || {};
        for (const id in interpolatedPlayersState) {
            if (!playersState[id]) {
                delete interpolatedPlayersState[id];
            }
        }
        for (const id in playersState) {
            if (!interpolatedPlayersState[id]) {
                interpolatedPlayersState[id] = { ...playersState[id] };
            }
        }
    });

    // 5. Iniciar bucle del juego
    if (!isGameLoopRunning) {
        isGameLoopRunning = true;
        gameLoop(); 
    }
}


// 12. Bucle principal del juego (¡MODIFICADO!)
function gameLoop() {
    if (!isGameLoopRunning) return; 
    
    requestAnimationFrame(gameLoop); 
    if (!ctx) return; 

    // Dependencias del bucle
    updateCameraPosition(myPlayerId, interpolatedPlayersState, canvas, playerSize);
    updatePlayerPositions(); 
    updateNpcPositions();
    updateHoveredState(); 
    
    ctx.fillStyle = '#333333';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 1. Dibujar el suelo
    drawGround(GAME_DEFINITIONS.groundTypes);

    // 2. Crear lista de "cosas" a dibujar
    let renderables = [];
    if (currentMapData && currentMapData.tileGrid) {
        for (let z = 0; z < currentMapData.height; z++) {
            for (let x = 0; x < currentMapData.width; x++) {
                const tile = currentMapData.tileGrid[z][x];
                if (!tile || tile.e === 'none' || !tile.e) continue;
                
                const elementId = (typeof tile.e === 'object' && tile.e !== null) ? tile.e.id : tile.e;
                const elementDef = GAME_DEFINITIONS.elementTypes[elementId];
                
                if (elementDef) {
                    // No dibujar NPCs estáticos, se dibujan desde npcStates
                    if (elementDef.drawType === 'sprite' && (tile.e.movement || (typeof tile.e === 'object' && tile.e.movement))) {
                        continue; // Saltar NPCs, se añadirán desde npcStates
                    }
                    
                    let isHovered = false;
                    let itemKey = null;
                    if (elementDef.drawType === 'portal') {
                        itemKey = `portal_${z}_${x}`;
                    } else if (elementDef.drawType === 'block') { // ¡NUEVO!
                        itemKey = `block_${z}_${x}`;
                    }

                    if (itemKey && itemKey === hoveredItemKey) {
                        isHovered = true;
                    }

                    renderables.push({
                        type: 'element',
                        x: x + 0.5,
                        z: z + 0.5,
                        y: 0,
                        definition: elementDef,
                        instance: tile.e, // <-- ¡AÑADIDO! Pasar datos de instancia (ej: altura)
                        isHovered: isHovered
                    });
                }
            }
        }
    }

    // Añadir jugadores
    for (const player of Object.values(interpolatedPlayersState)) {
        if(player.currentMap === currentMapId) {
            renderables.push({
                type: 'player',
                y: playerSize,
                ...player
            });
        }
    }

    // Añadir NPCs dinámicos desde npcStates
    for (const [key, npc] of Object.entries(npcStates)) {
        const npcDef = GAME_DEFINITIONS.elementTypes[npc.id];
        if (npcDef) {
            const isHovered = (key === hoveredItemKey); 
            renderables.push({
                type: 'element', 
                x: npc.x,
                z: npc.z,
                y: 0, 
                definition: npcDef,
                instance: npc, // <-- ¡AÑADIDO! Pasar datos de instancia
                isHovered: isHovered 
            });
        }
    }

    // 3. Ordenar
    renderables.sort((a, b) => (a.x + a.z) - (b.x + b.z));

    // 4. Dibujar todo (¡MODIFICADO!)
    for (const item of renderables) {
        if (item.type === 'player') {
            const screenPos = project(item.x, item.y, item.z); // Player usa lógica de dibujo antigua
            drawPlayer(item, screenPos);
        } else if (item.type === 'element') {
            if (item.definition.draw) {
                // ¡MODIFICADO! Pasar la función project, coordenadas del mundo, e instancia
                item.definition.draw(
                    ctx, 
                    project, 
                    item.definition, 
                    currentZoom, 
                    item.x, 
                    item.y, 
                    item.z, 
                    item.isHovered, 
                    item.instance
                );
            }
        }
    }
}

// 13. Funciones de ayuda del bucle
function updatePlayerPositions() {
    for (const id in playersState) {
        const targetPlayerData = playersState[id]; 
        const playerMesh = interpolatedPlayersState[id]; 
        if (!playerMesh || targetPlayerData.currentMap !== currentMapId) {
            continue; 
        }
        const targetX = targetPlayerData.x;
        const targetZ = targetPlayerData.z;
        const dx = targetX - playerMesh.x;
        const dz = targetZ - playerMesh.z;
        const distance = Math.sqrt(dx * dx + dz * dz);
        if (playerMesh.currentMap !== targetPlayerData.currentMap) {
             playerMesh.x = targetX;
             playerMesh.z = targetZ;
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
    }
}

function updateNpcPositions() {
    const now = Date.now();
    for (const key in npcStates) {
        const npc = npcStates[key];

        // Mover NPC hacia su objetivo si está en movimiento
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
        // Decidir si iniciar un nuevo movimiento
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
    }
}

/**
 * Comprueba qué objeto interactuable está bajo el cursor.
 */
function updateHoveredState() {
    if (!canvas) return;

    const worldCoords = inverseProject(mouseScreenPos.x, mouseScreenPos.y);
    let foundKey = null;

    // 2. Comprobar NPCs
    for (const [key, npc] of Object.entries(npcStates)) {
        if (npc.interaction === 'dialog') {
            const dist = Math.hypot(npc.x - worldCoords.x, npc.z - worldCoords.z);
            if (dist < INTERACTION_RADIUS) {
                foundKey = key;
                break;
            }
        }
    }

    // 3. Comprobar Portales y Bloques (estáticos)
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
                            foundKey = `${elementDef.drawType}_${z}_${x}`; // ej: "block_10_5"
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


function drawGround(groundTypes) {
    if (!currentMapData || !currentMapData.tileGrid) {
        drawGroundGrid();
        return;
    }
    const voidDef = groundTypes['void'] || { color: '#111' }; 
    
    for (let z = 0; z < currentMapData.height; z++) {
        for (let x = 0; x < currentMapData.width; x++) {
            const tile = currentMapData.tileGrid[z][x];
            const groundDef = (tile && groundTypes[tile.g]) 
                              ? groundTypes[tile.g] 
                              : voidDef; 
            
            drawGroundTile(ctx, project, x, z, groundDef, currentZoom);
        }
    }
}

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

function drawPlayer(player, screenPos) {
    const scaledImgWidth = playerImgWidth * currentZoom;
    const scaledImgHeight = playerImgHeight * currentZoom;
    const fallbackWidth = 16 * currentZoom;
    const fallbackHeight = 32 * currentZoom;

    if (playerImgLoaded) {
        ctx.drawImage(
            playerImg,
            screenPos.x - scaledImgWidth / 2,
            screenPos.y - scaledImgHeight,
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
        screenPos.y - scaledImgHeight - (5 * currentZoom)
    );
}

// 14. Funciones de Lógica de Juego
function isPositionPassable(worldX, worldZ) {
    if (!currentMapData || !currentMapData.tileGrid) return false; 
    const tileX = Math.floor(worldX);
    const tileZ = Math.floor(worldZ);
    if (tileX < 0 || tileX >= currentMapData.width || tileZ < 0 || tileZ >= currentMapData.height) {
        return false;
    }
    const tile = currentMapData.tileGrid[tileZ][tileX];
    if (!tile) return false; 
    
    const groundDef = GAME_DEFINITIONS.groundTypes[tile.g];
    const elementId = (typeof tile.e === 'object' && tile.e !== null) ? tile.e.id : tile.e;
    const elementDef = GAME_DEFINITIONS.elementTypes[elementId];
    
    if (!groundDef || !elementDef) return false; 
    
    // ¡MODIFICADO! Los bloques (tipo 'block') NUNCA son transitables.
    if (elementDef.drawType === 'block') {
        return false;
    }
    
    return groundDef.passable && elementDef.passable;
}

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