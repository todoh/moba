// ==================================================
// ### SCRIPT PRINCIPAL (main.js) - VERSIÓN 3D ###
// ==================================================
// Este archivo es el nuevo "director de orquesta" de Three.js.

// 1. Importaciones de Firebase
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getDatabase, ref, set, onValue, onDisconnect, query, orderByChild, equalTo, off, update } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

// 2. ¡NUEVO! Importaciones de Three.js
import * as THREE from 'three';
// ¡ELIMINADO! OrbitControls ya no se usa para la cámara principal.
// import { OrbitControls } from 'three/addons/controls/OrbitControls.js'; 
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// 3. Importaciones de la lógica del juego
import {
    setMoveActionDependencies,
    setCollisionChecker,
    setPortalHandler,
    setNpcHandler,
    findLastValidPosition 
} from './move-action.js';
import { loadGameDefinitions } from './elements.js';
import { 
    firebaseConfig, playerSize, PLAYER_LERP_AMOUNT,
    // ¡MODIFICADO! Importar nuevas constantes de cámara
    CAMERA_ROTATE_SPEED, CAMERA_MIN_ZOOM, CAMERA_MAX_ZOOM, CAMERA_ZOOM_STEP,
    CAMERA_DEFAULT_HEIGHT, CAMERA_DEFAULT_DISTANCE, CAMERA_DEFAULT_ZOOM,
    CAMERA_ROTATE_STEP // ¡AÑADIDO!
} from './constantes.js';
import * as logica from './logica.js';

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
let canvas;
let infoBar;
let npcModalContainer, npcModalText, npcModalClose;

// 6. ¡NUEVO! Variables de Three.js
let scene, camera, renderer, raycaster, mouse;
const loader = new THREE.TextureLoader();
const gltfLoader = new GLTFLoader();
const textureCache = new Map();

// Mapas para rastrear objetos 3D
let playerMeshes = {};
let npcMeshes = {};
let worldMeshes = {}; 
let spriteMeshes = {}; 
let interactableObjects = []; 

// 7. ¡NUEVO! Variables de Control de Cámara Isométrica
let cameraTarget = new THREE.Vector3(); // Punto al que mira la cámara (centro del jugador)
let cameraAngle = -Math.PI / 4; // Ángulo azimutal inicial (isométrico)
let targetCameraAngle = cameraAngle;
// ¡MODIFICADO! Estas variables ahora controlan el ángulo y la posición
let cameraHeight = CAMERA_DEFAULT_HEIGHT; 
let cameraDistance = CAMERA_DEFAULT_DISTANCE;
let cameraZoom = CAMERA_DEFAULT_ZOOM; // ¡NUEVO! Controla el zoom ortográfico

// 7. Función principal (onload)
window.onload = () => {
    // Inicializar UI
    infoBar = document.getElementById('info-bar');
    npcModalContainer = document.getElementById('npc-modal-container');
    npcModalText = document.getElementById('npc-modal-text');
    npcModalClose = document.getElementById('npc-modal-close');
    npcModalClose.addEventListener('click', hideNpcModal); 

    // Inicializar Canvas
    canvas = document.getElementById('game-canvas');
    
    // --- ¡NUEVO! Inicializar Three.js ---
    initThree();
    
    // --- ¡NUEVO! Listeners de UI de Cámara ---
    document.getElementById('rotate-left').addEventListener('click', rotateCameraLeft);
    document.getElementById('rotate-right').addEventListener('click', rotateCameraRight);
    document.getElementById('zoom-in').addEventListener('click', zoomIn);
    document.getElementById('zoom-out').addEventListener('click', zoomOut);
    canvas.addEventListener('wheel', onMouseWheel, { passive: false });
    // ------------------------------------

    resizeCanvas(); // Ajustar tamaño inicial
    window.addEventListener('resize', resizeCanvas);

    // Inicializar Firebase
    initializeFirebase();
};

// 8. Funciones de Three.js

function initThree() {
    // Escena
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x333333);
    scene.fog = new THREE.Fog(0x333333, 30, 70); // Ajustado

    // ¡NUEVO! Cámara Ortográfica para look isométrico
    const aspect = window.innerWidth / window.innerHeight;
    // ¡MODIFICADO! Usar la variable de zoom
    camera = new THREE.OrthographicCamera(
        cameraZoom * aspect / -2, 
        cameraZoom * aspect / 2, 
        cameraZoom / 2, 
        cameraZoom / -2, 
        0.1, 
        1000 
    );
    
    // Actualizar posición y zoom iniciales
    // cameraHeight y cameraDistance se leen de constantes
    camera.position.set(cameraDistance, cameraHeight, cameraDistance);
    camera.lookAt(0, 0, 0);

    // Renderer
    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;

    // ¡ELIMINADO! OrbitControls
    
    // Luces
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.0);
    scene.add(ambientLight);
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
    dirLight.position.set(10, 20, 5);
    dirLight.castShadow = true;
    scene.add(dirLight);

    // Raycaster (para clics)
    raycaster = new THREE.Raycaster();
    mouse = new THREE.Vector2();

    // Listeners de Input
    canvas.addEventListener('click', onCanvasClick);
    canvas.addEventListener('mousemove', onCanvasMove); // Para hover
}

function resizeCanvas() {
    if (camera && renderer) {
        // Actualizar cámara Ortográfica
        const aspect = window.innerWidth / window.innerHeight;
        // ¡MODIFICADO! Usar la variable de zoom
        camera.left = -cameraZoom * aspect;
        camera.right = cameraZoom * aspect;
        camera.top = cameraZoom;
        camera.bottom = -cameraZoom;
        camera.updateProjectionMatrix();

        renderer.setSize(window.innerWidth, window.innerHeight);
    }
}

// Helper para cargar texturas con caché
function loadTexture(src) {
    if (!src) return null;
    if (textureCache.has(src)) {
        return textureCache.get(src);
    }
    const texture = loader.load(src, (tex) => {
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        textureCache.set(src, tex);
    });
    return texture;
}

// 9. Lógica de UI (Movida desde logica.js y move-action.js)

function showNpcModal(npc) {
    // ... (código sin cambios)
    const elementDef = GAME_DEFINITIONS.elementTypes[npc.id];
    let text = "Hola.";
    
    if (npc.interaction === 'dialog' && npc.dialogText) {
        text = npc.dialogText;
    } else if (elementDef && elementDef.interaction === 'dialog' && elementDef.dialogText) {
        text = elementDef.dialogText;
    }

    if (npcModalText && npcModalContainer) {
        npcModalText.textContent = text;
        npcModalContainer.className = 'npc-modal-visible';
    }
}

function hideNpcModal() {
    if (npcModalContainer) {
        npcModalContainer.className = 'npc-modal-hidden';
    }
}

function showBlockedClick(screenX, screenY) {
    // ... (código sin cambios)
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

// 10. Lógica de Input 3D (Raycasting)

function onCanvasClick(event) {
    // ... (código sin cambios)
    if (!myPlayerId || !db || !canvas || !logica.isPositionPassable) return;
    if (event.target !== canvas) return;

    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);

    const intersects = raycaster.intersectObjects(interactableObjects);
    if (intersects.length === 0) return;

    const intersection = intersects[0];
    const targetPoint = intersection.point;
    const targetObject = intersection.object;

    if (targetObject.userData.type === 'npc') {
        const npcKey = targetObject.userData.key;
        const interactionHappened = logica.getNpcInteraction(npcStates[npcKey]);
        if (interactionHappened) {
            showNpcModal(npcStates[npcKey]); 
            return; 
        }
    }
    
    if (targetObject.userData.type === 'portal') {
         const portalDest = logica.getPortalDestination(targetObject.userData.definition);
         if (portalDest) {
            const localMapId = currentMapId;
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
    }

    const playerPos = playersState[myPlayerId];
    if (!playerPos) return;
    const startPos = { x: playerPos.x, z: playerPos.z };

    const finalValidPos = findLastValidPosition(
        startPos,
        targetPoint, 
        logica.isPositionPassable 
    );

    const distToFinalPos = Math.hypot(finalValidPos.x - startPos.x, finalValidPos.z - startPos.z);
    
    if (distToFinalPos < 0.25) {
        showBlockedClick(event.clientX, event.clientY);
        return;
    }

    update(myPlayerRef, {
        x: finalValidPos.x,
        z: finalValidPos.z
    });
}

function onCanvasMove(event) {
    // ... (código sin cambios)
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(interactableObjects);

    if (intersects.length > 0) {
        const type = intersects[0].object.userData.type;
        if (type === 'npc' || type === 'portal') {
            canvas.style.cursor = 'pointer';
        } else {
            canvas.style.cursor = 'default';
        }
    } else {
        canvas.style.cursor = 'default';
    }
}

// 11. ¡NUEVO! Funciones de Control de Cámara

function rotateCameraLeft() {
    targetCameraAngle -= CAMERA_ROTATE_STEP; // 90 grados -> 45 grados
}

function rotateCameraRight() {
    targetCameraAngle += CAMERA_ROTATE_STEP; // 90 grados -> 45 grados
}

function zoomIn() {
    // Un zoom más pequeño significa una vista más cercana
    setCameraZoom(cameraZoom - CAMERA_ZOOM_STEP);
}

function zoomOut() {
    // Un zoom más grande significa una vista más lejana
    setCameraZoom(cameraZoom + CAMERA_ZOOM_STEP);
}

function onMouseWheel(event) {
    event.preventDefault();
    // Normalizar la rueda del ratón
    const delta = event.deltaY > 0 ? 1 : -1;
    setCameraZoom(cameraZoom + delta * (CAMERA_ZOOM_STEP / 2)); // Zoom con rueda más suave
}

/**
 * ¡MODIFICADO! Actualiza el frustum de la cámara ortográfica para simular el zoom.
 */
function setCameraZoom(newZoom) {
    // Aplicar límites
    cameraZoom = THREE.MathUtils.clamp(newZoom, CAMERA_MIN_ZOOM, CAMERA_MAX_ZOOM);
    
    const aspect = window.innerWidth / window.innerHeight;
    camera.left = -cameraZoom * aspect;
    camera.right = cameraZoom * aspect;
    camera.top = cameraZoom;
    camera.bottom = -cameraZoom;
    camera.updateProjectionMatrix();
}

/**
 * Función helper para interpolar ángulos correctamente.
 */
function lerpAngle(start, end, amt) {
    let difference = end - start;
    if (difference > Math.PI) {
        difference -= (2 * Math.PI); // Ir por el camino corto
    } else if (difference < -Math.PI) {
        difference += (2 * Math.PI); // Ir por el camino corto
    }
    return start + difference * amt;
}


// 12. Inicialización de Firebase (Refactorizada)

async function initializeFirebase() {
    // ... (código sin cambios)
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

                GAME_DEFINITIONS = await loadGameDefinitions(db);
                
                logica.setLogicaDependencies({
                    get currentMapData() { return currentMapData; },
                    GAME_DEFINITIONS,
                    interpolatedPlayersState,
                    get myPlayerId() { return myPlayerId; },
                    get playersState() { return playersState; },
                    npcStates,
                    get currentMapId() { return currentMapId; },
                    canvas,
                    npcModalContainer,
                    npcModalText,
                });

                setMoveActionDependencies(myPlayerId, db, () => currentMapId);
                setCollisionChecker(logica.isPositionPassable);
                setPortalHandler(logica.getPortalDestination);
                setNpcHandler(logica.getNpcInteraction); 

                infoBar.innerHTML = `Conectado. <br> <strong>Tu UserID:</strong> ${myPlayerId.substring(0, 6)}<br><strong>Instrucciones:</strong> Clic/Toca para moverte. Usa la rueda/botones para zoom/rotar.`;

                onDisconnect(myPlayerRef).remove();

                onValue(myPlayerRef, (snapshot) => {
                    const playerData = snapshot.val();
                    if (playerData && playerData.currentMap !== currentMapId) {
                        loadMap(playerData.currentMap);
                    }
                });
                loadMap(currentMapId);
            } else {
                signInAnonymously(auth);
            }
        });
    } catch (error) {
        console.error("Error al inicializar Firebase:", error);
        infoBar.textContent = "Error al inicializar Firebase.";
    }
}

// 13. Función para construir el mundo 3D

function clearWorld() {
    // ... (código sin cambios)
    for (const key in worldMeshes) {
        scene.remove(worldMeshes[key]);
        worldMeshes[key].geometry.dispose();
    }
    worldMeshes = {};
    for (const key in spriteMeshes) {
        // ¡MODIFICADO! Limpiar grupos
        scene.remove(spriteMeshes[key]);
        spriteMeshes[key].traverse((child) => {
            if (child.isMesh) {
                child.geometry.dispose();
                // El material se comparte, así que solo lo disponemos una vez
            }
        });
        // Disponer el material (si se comparte, debe hacerse con cuidado)
        const firstChild = spriteMeshes[key].children[0];
        if (firstChild && firstChild.isMesh) {
             firstChild.material.map?.dispose();
             firstChild.material.dispose();
        }
    }
    spriteMeshes = {};
    for (const key in npcMeshes) {
        scene.remove(npcMeshes[key]);
        npcMeshes[key].material.map?.dispose();
        npcMeshes[key].material.dispose();
        npcMeshes[key].geometry.dispose();
    }
    npcMeshes = {};
    interactableObjects = [];
}

function buildWorld(tileGrid) {
    // ... (código sin cambios)
    clearWorld();
    
    const groundMaterialCache = {};
    const blockMaterialCache = {};
    
    for (let z = 0; z < currentMapData.height; z++) {
        for (let x = 0; x < currentMapData.width; x++) {
            const tile = tileGrid[z][x];
            if (!tile) continue;
            
            const groundDef = GAME_DEFINITIONS.groundTypes[tile.g] || GAME_DEFINITIONS.groundTypes['void'];
            const height = tile.h || 1.0;
            
            // --- 1. Crear Suelo ---
            if (height > 0) {
                const geometry = new THREE.BoxGeometry(1, height, 1);
                
                if (!groundMaterialCache[tile.g]) {
                    groundMaterialCache[tile.g] = [
                        new THREE.MeshStandardMaterial({ map: loadTexture(groundDef.imgSrcRight || groundDef.imgSrcLeft), color: groundDef.color }), 
                        new THREE.MeshStandardMaterial({ map: loadTexture(groundDef.imgSrcLeft || groundDef.imgSrcRight), color: groundDef.color }), 
                        new THREE.MeshStandardMaterial({ map: loadTexture(groundDef.imgSrcTop), color: groundDef.color }), 
                        new THREE.MeshStandardMaterial({ color: 0x332211 }), 
                        new THREE.MeshStandardMaterial({ map: loadTexture(groundDef.imgSrcRight || groundDef.imgSrcLeft), color: groundDef.color }), 
                        new THREE.MeshStandardMaterial({ map: loadTexture(groundDef.imgSrcLeft || groundDef.imgSrcRight), color: groundDef.color })
                    ];
                }
                const materials = groundMaterialCache[tile.g];
                const mesh = new THREE.Mesh(geometry, materials);
                mesh.position.set(x + 0.5, height / 2, z + 0.5); 
                mesh.receiveShadow = true;
                mesh.userData = { type: 'ground', x, z }; 
                
                scene.add(mesh);
                const key = `tile_${x}_${z}`;
                worldMeshes[key] = mesh;
                interactableObjects.push(mesh);
            }

            // --- 2. Crear Elementos (Bloques, Sprites, Portales) ---
            const elementId = (typeof tile.e === 'object' && tile.e !== null) ? tile.e.id : tile.e;
            const elementDef = GAME_DEFINITIONS.elementTypes[elementId];
            if (!elementDef || elementDef.id === 'none') continue;

            const elementKey = `el_${x}_${z}`;

            if (elementDef.drawType === 'block') {
                const blockHeight = elementDef.height || 1.0;
                const blockGeo = new THREE.BoxGeometry(1, blockHeight, 1);
                
                if (!blockMaterialCache[elementId]) {
                     blockMaterialCache[elementId] = [
                        new THREE.MeshStandardMaterial({ map: loadTexture(elementDef.imgSrcRight || elementDef.imgSrcLeft) }),
                        new THREE.MeshStandardMaterial({ map: loadTexture(elementDef.imgSrcLeft || elementDef.imgSrcRight) }),
                        new THREE.MeshStandardMaterial({ map: loadTexture(elementDef.imgSrcTop) }),
                        new THREE.MeshStandardMaterial({ color: 0x333333 }),
                        new THREE.MeshStandardMaterial({ map: loadTexture(elementDef.imgSrcRight || elementDef.imgSrcLeft) }),
                        new THREE.MeshStandardMaterial({ map: loadTexture(elementDef.imgSrcLeft || elementDef.imgSrcRight) })
                    ];
                }
                const blockMesh = new THREE.Mesh(blockGeo, blockMaterialCache[elementId]);
                blockMesh.position.set(x + 0.5, height + blockHeight / 2, z + 0.5);
                blockMesh.castShadow = true;
                blockMesh.userData = { type: 'block', x, z };
                
                scene.add(blockMesh);
                worldMeshes[elementKey] = blockMesh;
                interactableObjects.push(blockMesh);

            // ¡MODIFICADO! Lógica para 'sprite' (árboles en cruz)
            } else if (elementDef.drawType === 'sprite' || (elementDef.drawType === 'portal' && elementDef.imgSrc)) {
                
                const map = loadTexture(elementDef.imgSrc);
                const aspect = (elementDef.baseWidth || 1) / (elementDef.baseHeight || 1);
                const planeHeight = (elementDef.baseHeight || 128) / 100; 
                const planeWidth = planeHeight * aspect;

                // Usar el mismo material para ambos planos
                const material = new THREE.MeshStandardMaterial({ 
                    map: map,
                    transparent: true, 
                    side: THREE.DoubleSide, 
                    alphaTest: 0.1 
                });
                
                // ¡NUEVO! Crear un grupo para los dos planos
                const crossGroup = new THREE.Group();
                crossGroup.position.set(x + 0.5, height + (planeHeight / 2), z + 0.5);
                
                // Plano 1 (Z-axis)
                const geometry1 = new THREE.PlaneGeometry(planeWidth, planeHeight);
                const planeMesh1 = new THREE.Mesh(geometry1, material);
                planeMesh1.castShadow = true;
                // Asignar userData al mesh individual para el raycasting
                planeMesh1.userData = { type: elementDef.drawType, x, z, key: elementKey, definition: elementDef };
                crossGroup.add(planeMesh1);
                
                // Plano 2 (X-axis, rotado 90 grados)
                const geometry2 = new THREE.PlaneGeometry(planeWidth, planeHeight);
                const planeMesh2 = new THREE.Mesh(geometry2, material);
                planeMesh2.rotation.y = Math.PI / 2; // Girar 90 grados
                planeMesh2.castShadow = true;
                // Asignar userData al mesh individual para el raycasting
                planeMesh2.userData = { type: elementDef.drawType, x, z, key: elementKey, definition: elementDef };
                crossGroup.add(planeMesh2);

                scene.add(crossGroup);
                spriteMeshes[elementKey] = crossGroup; // Guardar el grupo

                if (elementDef.drawType === 'portal') {
                    interactableObjects.push(planeMesh1, planeMesh2);
                }
            
            } else if (elementDef.drawType === 'portal' && !elementDef.imgSrc) {
                const portalGeo = new THREE.CylinderGeometry(0.5, 0.5, 0.2, 16);
                const portalMat = new THREE.MeshBasicMaterial({ color: 0x00FFFF, transparent: true, opacity: 0.5 });
                const portalMesh = new THREE.Mesh(portalGeo, portalMat);
                portalMesh.position.set(x + 0.5, height + 0.1, z + 0.5);
                
                portalMesh.userData = { type: 'portal', x, z, key: elementKey, definition: elementDef };
                interactableObjects.push(portalMesh);
                
                scene.add(portalMesh);
                worldMeshes[elementKey] = portalMesh;
            }
        }
    }
}

// 14. Carga de Mapas (Refactorizada)

function loadMap(mapId) {
    // ... (código sin cambios)
    console.log(`Cargando mapa: ${mapId}`);
    if (mapListener) off(mapRef, 'value', mapListener);
    if (playersListener) {
        const oldQuery = query(ref(db, 'moba-demo-players-3d'), orderByChild('currentMap'), equalTo(currentMapId));
        off(oldQuery, 'value', playersListener);
    }

    playersState = {};
    npcStates = {};
    currentMapId = mapId;

    logica.setLogicaDependencies({
        get currentMapData() { return currentMapData; },
        GAME_DEFINITIONS,
        interpolatedPlayersState,
        get myPlayerId() { return myPlayerId; },
        get playersState() { return playersState; },
        npcStates,
        get currentMapId() { return currentMapId; },
        canvas, npcModalContainer, npcModalText,
    });

    mapRef = ref(db, `moba-demo-maps/${mapId}`);
    mapListener = onValue(mapRef, (snapshot) => {
        const data = snapshot.val();
        if (data && data.tiles) {
            data.tileGrid = [];
            for (let z = 0; z < data.height; z++) {
                const row = [];
                for (let x = 0; x < data.width; x++) {
                    const tile = data.tiles[z * data.width + x] || { g: 'void', e: 'none', h: 1.0 };
                    if (tile.h === undefined) tile.h = 1.0;
                    row.push(tile);
                }
                data.tileGrid.push(row);
            }
            currentMapData = data;
            
            buildWorld(currentMapData.tileGrid);

            npcStates = {};
            for (let z = 0; z < currentMapData.height; z++) {
                for (let x = 0; x < currentMapData.width; x++) {
                    const tile = currentMapData.tileGrid[z][x];
                    if (tile && typeof tile.e === 'object' && tile.e.id) {
                        const elementDef = GAME_DEFINITIONS.elementTypes[tile.e.id];
                        if (elementDef && elementDef.drawType === 'npc') {
                            const npcKey = `npc_${z}_${x}`;
                            const groundHeight = logica.getGroundHeightAt(x + 0.5, z + 0.5);
                            npcStates[npcKey] = {
                                ...tile.e,
                                id: tile.e.id, 
                                x: x + 0.5,
                                z: z + 0.5,
                                y: groundHeight + playerSize, 
                                targetX: x + 0.5,
                                targetZ: z + 0.5,
                                isMoving: false,
                                lastMoveTime: Date.now(),
                            };
                            spawnNpcMesh(npcStates[npcKey], npcKey);
                        }
                    }
                }
            }
            
            let spawnPos = data.startPosition 
                ? { x: data.startPosition.x + 0.5, z: data.startPosition.z + 0.5 }
                : { x: (data.width / 2) + 0.5, z: (data.height / 2) + 0.5 };
            
            onValue(myPlayerRef, (playerSnap) => {
                if (!playerSnap.exists()) {
                    set(myPlayerRef, {
                        id: myPlayerId, x: spawnPos.x, z: spawnPos.z, currentMap: mapId
                    });
                }
            }, { onlyOnce: true });

        } else {
            console.warn(`No se encontraron datos para el mapa ${mapId}.`);
            currentMapData = null;
        }
    });

    const playersQuery = query(ref(db, 'moba-demo-players-3d'), orderByChild('currentMap'), equalTo(mapId));
    playersListener = onValue(playersQuery, (snapshot) => {
        playersState = snapshot.val() || {};
        
        for (const id in playersState) {
            if (!interpolatedPlayersState[id]) {
                const groundHeight = logica.getGroundHeightAt(playersState[id].x, playersState[id].z);
                interpolatedPlayersState[id] = {
                    ...playersState[id],
                    y: groundHeight + playerSize 
                };
                if (!playerMeshes[id]) {
                    spawnPlayerMesh(interpolatedPlayersState[id]);
                }
            }
        }
        for (const id in playerMeshes) {
            if (!playersState[id]) {
                scene.remove(playerMeshes[id]);
                playerMeshes[id].geometry.dispose();
                playerMeshes[id].material.dispose();
                delete playerMeshes[id];
                delete interpolatedPlayersState[id];
            }
        }
    });

    if (!isGameLoopRunning) {
        isGameLoopRunning = true;
        gameLoop();
    }
}

// 15. Funciones de Spawning

function spawnPlayerMesh(state) {
    // ... (código sin cambios)
    const geometry = new THREE.BoxGeometry(0.8, playerSize, 0.8);
    const material = new THREE.MeshStandardMaterial({ 
        color: state.id === myPlayerId ? 0x00ffff : 0xff0000 
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(state.x, state.y - playerSize + (playerSize / 2), state.z); 
    mesh.castShadow = true;
    playerMeshes[state.id] = mesh;
    scene.add(mesh);
}

function spawnNpcMesh(state, key) {
    // ... (código sin cambios)
    // Esta función ya crea un solo plano, lo cual es correcto para el NPC
    // que rotará para mirar a la cámara.
    const elementDef = GAME_DEFINITIONS.elementTypes[state.id];
    if (!elementDef) {
        console.warn(`No se encontró definición para NPC con id ${state.id}`);
        return;
    }

    const map = loadTexture(elementDef.imgSrc);
    
    const aspect = (elementDef.baseWidth || 1) / (elementDef.baseHeight || 1);
    const planeHeight = (elementDef.baseHeight || 128) / 100; 
    const planeWidth = planeHeight * aspect;

    const geometry = new THREE.PlaneGeometry(planeWidth, planeHeight);
    const material = new THREE.MeshStandardMaterial({ 
        map: map,
        transparent: true, 
        side: THREE.DoubleSide, 
        alphaTest: 0.1
    });
    
    const planeMesh = new THREE.Mesh(geometry, material);
    
    const groundY = state.y - playerSize;
    planeMesh.position.set(state.x, groundY + (planeHeight / 2), state.z);
    
    planeMesh.castShadow = true;
    planeMesh.userData = { 
        type: 'npc', 
        key: key,
        planeHeight: planeHeight 
    };
    
    npcMeshes[key] = planeMesh;
    scene.add(planeMesh);
    interactableObjects.push(planeMesh);
}


// 16. Bucle Principal del Juego (¡MODIFICADO!)

function gameLoop() {
    if (!isGameLoopRunning) return;
    requestAnimationFrame(gameLoop);
    if (!renderer || !scene || !camera) return;

    // 1. Actualizar lógica de estado
    logica.updatePlayerPositions();
    logica.updateNpcPositions();

    // 2. Sincronizar Meshes 3D
    for (const id in interpolatedPlayersState) {
        const state = interpolatedPlayersState[id]; 
        const mesh = playerMeshes[id];
        if (mesh) {
            const targetPos = new THREE.Vector3(state.x, state.y - (playerSize / 2), state.z);
            mesh.position.lerp(targetPos, PLAYER_LERP_AMOUNT);
            
            // Rotar jugador según el movimiento
            if (mesh.lastPos) {
                const dx = mesh.position.x - mesh.lastPos.x;
                const dz = mesh.position.z - mesh.lastPos.z;
                if (Math.abs(dx) > 0.01 || Math.abs(dz) > 0.01) {
                    const angle = Math.atan2(dx, dz);
                    mesh.rotation.y = angle;
                }
            }
            mesh.lastPos = mesh.position.clone();
        }
    }
    
    for (const key in npcStates) {
        const state = npcStates[key]; 
        const mesh = npcMeshes[key];
        if (mesh && mesh.userData.planeHeight) {
            const groundY = state.y - playerSize;
            const planeHeight = mesh.userData.planeHeight;
            const targetY = groundY + (planeHeight / 2);
            const targetPos = new THREE.Vector3(state.x, targetY, state.z);
            mesh.position.lerp(targetPos, PLAYER_LERP_AMOUNT);
            
            // ¡MODIFICADO! Hacer que el NPC mire a la cámara (en eje Y)
            mesh.lookAt(camera.position.x, mesh.position.y, camera.position.z);
        }
    }
    
    // ¡NUEVO! Rotar los 'sprites' (árboles) para que miren a la cámara también
    // (Esto es opcional al método de cruz, pero más simple de implementar)
    // Comentado por ahora para usar el método de "cruz"
    /*
    for (const key in spriteMeshes) {
        const mesh = spriteMeshes[key];
        // Solo rotamos los que son 'sprite', no portales-con-imagen
        if (mesh.userData.type === 'sprite') {
            mesh.lookAt(camera.position.x, mesh.position.y, camera.position.z);
        }
    }
    */
    // Los 'spriteMeshes' que son grupos (en cruz) no necesitan rotar.

    // 3. ¡NUEVO! Actualizar Cámara Isométrica
    if (playerMeshes[myPlayerId]) {
        // Mover el punto de mira de la cámara
        cameraTarget.lerp(playerMeshes[myPlayerId].position, 0.1);
    }
    
    // Interpolar el ángulo de rotación
    cameraAngle = lerpAngle(cameraAngle, targetCameraAngle, CAMERA_ROTATE_SPEED);

    // ¡MODIFICADO! Calcular la nueva posición de la cámara
    // Usamos 'cameraDistance' para el offset X/Z y 'cameraHeight' para la Y
    const newCamX = cameraTarget.x + cameraDistance * Math.cos(cameraAngle);
    const newCamZ = cameraTarget.z + cameraDistance * Math.sin(cameraAngle);
    
    // ¡MODIFICADO! La altura Y de la cámara ahora es relativa al jugador
    camera.position.set(newCamX, cameraTarget.y + cameraHeight, newCamZ); 
    camera.lookAt(cameraTarget); // Apuntar siempre al jugador

    // 4. Renderizar
    renderer.render(scene, camera);
}

