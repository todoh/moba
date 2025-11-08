// ==================================================
// ### SCRIPT PRINCIPAL (main.js) - VERSIÓN 3D ###
// ==================================================
// ¡MODIFICADO! para funcionar con 'entityTypes' y el menú de interacción
// ¡MODIFICADO (GLTF)! para cargar modelos 3D .glb / .gltf

// 1. Importaciones de Firebase
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
// ¡MODIFICADO! Añadir 'get' para leer los SVGs
import { getDatabase, ref, set, onValue, onDisconnect, query, orderByChild, equalTo, off, update, get } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

// 2. Importaciones de Three.js
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as Menu from './menu.js';
// 3. Importaciones de la lógica del juego
import {
    setMoveActionDependencies,
    setCollisionChecker,
    setPortalHandler,
    setNpcHandler,
    findLastValidPosition 
} from './move-action.js';
// ¡MODIFICADO! 'loadGameDefinitions' ahora carga la nueva estructura
import { loadGameDefinitions } from './elements.js';
import { 
    firebaseConfig, playerSize, PLAYER_LERP_AMOUNT,
    CAMERA_ROTATE_SPEED, CAMERA_MIN_ZOOM, CAMERA_MAX_ZOOM, CAMERA_ZOOM_STEP,
    CAMERA_DEFAULT_HEIGHT, CAMERA_DEFAULT_DISTANCE, CAMERA_DEFAULT_ZOOM,
    CAMERA_ROTATE_STEP, 
    CAMERA_VERTICAL_OFFSET,
    getFirebaseStorageUrl,
    getFirebaseModelUrl, // ¡¡¡NUEVA IMPORTACIÓN!!!
    MELEE_RANGE // <--- ¡¡¡IMPORTACIÓN AÑADIDA!!!
} from './constantes.js';
import * as logica from './logica.js';

// 4. Variables globales de Firebase y Estado
let app;
let auth;
let db;
let myPlayerId;
let myPlayerRef = null;
let isGameLoopRunning = false;
// ¡MODIFICADO! GAME_DEFINITIONS.elementTypes ahora lo contiene TODO (bloques, portales, entidades)
let GAME_DEFINITIONS = { groundTypes: {}, elementTypes: {} };

let playersListener = null;
let playersState = {};
let interpolatedPlayersState = {};

let mapListener = null;
let mapRef = null;
let currentMapData = null;
let currentMapId = "inicio";

// Estado de NPCs (entidades que se mueven)
let npcStates = {};

// 5. Variables de UI y Canvas
let canvas;
let infoBar;
let speechBubble, speechBubbleText;
let activeNpcKey = null; // Rastrea quién está hablando

// ¡NUEVO! Variables del Menú de Interacción
let interactionMenu;
let interactionMenuTitle;
let interactionMenuButtons;
let interactionMenuCloseBtn;
let activeInteractionTarget = null; // { entityDef, entityInstance, tileRef, position, x, z }
let isInteractionMenuOpen = false;

// 6. Variables de Three.js
let scene, camera, renderer, raycaster, mouse;
const loader = new THREE.TextureLoader();
const gltfLoader = new GLTFLoader();
const textureCache = new Map();
// ¡NUEVO! Cachés para SVG
const svgDataCache = new Map(); // Almacena el TEXTO del SVG (string)
const svgTextureCache = new Map(); // Almacena la TEXTURA 3D rasterizada
// --- ¡NUEVO (GLTF)! ---
const gltfCache = new Map(); // Almacena escenas de GLTF cargadas
// ---

// Mapas para rastrear objetos 3D
let playerMeshes = {};
let npcMeshes = {}; // Entidades que se MUEVEN
let worldMeshes = {}; // Suelo, Bloques, Portales-Cilindro
let spriteMeshes = {}; // Entidades ESTÁTICAS (árboles, rocas, o GRUPOS GLTF)
let interactableObjects = []; 

// 7. Variables de Control de Cámara Isométrica
let cameraTarget = new THREE.Vector3(); 
let cameraAngle = -Math.PI / 4; 
let targetCameraAngle = cameraAngle;
let cameraHeight = CAMERA_DEFAULT_HEIGHT; 
let cameraDistance = CAMERA_DEFAULT_DISTANCE;
let cameraZoom = CAMERA_DEFAULT_ZOOM; 
let lookAtPoint = new THREE.Vector3(); 

// 7. Función principal (onload)
window.onload = () => {
    // Inicializar UI
    infoBar = document.getElementById('info-bar');
    speechBubble = document.getElementById('speech-bubble');
    speechBubbleText = document.getElementById('speech-bubble-text');
    
    // ¡NUEVO! Inicializar Menú de Interacción
    interactionMenu = document.getElementById('interaction-menu-modal');
    interactionMenuTitle = document.getElementById('interaction-menu-title');
    interactionMenuButtons = document.getElementById('interaction-menu-buttons');
    interactionMenuCloseBtn = document.getElementById('interaction-menu-close-btn');
    interactionMenuCloseBtn.addEventListener('click', hideInteractionMenu);

    // Inicializar Canvas
    canvas = document.getElementById('game-canvas');
    
    // --- Inicializar Three.js ---
    initThree();
    
    // --- Listeners de UI de Cámara ---
    document.getElementById('rotate-left').addEventListener('click', rotateCameraLeft);
    document.getElementById('rotate-right').addEventListener('click', rotateCameraRight);
    document.getElementById('zoom-in').addEventListener('click', zoomIn);
    document.getElementById('zoom-out').addEventListener('click', zoomOut);
    canvas.addEventListener('wheel', onMouseWheel, { passive: false });
    
    // --- Listener de UI de Menú ---
    document.getElementById('menu-toggle-btn').addEventListener('click', () => {
        if(playersState && playersState[myPlayerId]) {
            Menu.toggleMenu(playersState[myPlayerId]);
        } else {
            console.warn("No se pueden mostrar los datos del menú, el jugador no existe.");
        }
    });
    
    resizeCanvas(); // Ajustar tamaño inicial
    window.addEventListener('resize', resizeCanvas);

    // Inicializar Firebase
    initializeFirebase();
};

// 8. Funciones de Three.js

function initThree() {
    scene = new THREE.Scene();
    const skyColor = 0xadd8e6; // Un color azul claro (light blue)
    scene.background = new THREE.Color(skyColor);
    scene.fog = new THREE.Fog(skyColor, 30, 70); // ¡Importante que la niebla coincida con el fondo!

    const aspect = window.innerWidth / window.innerHeight;
    camera = new THREE.OrthographicCamera(
        cameraZoom * aspect / -2, 
        cameraZoom * aspect / 2, 
        cameraZoom / 2, 
        cameraZoom / -2, 
        0.1, 
        1000 
    );
    
    camera.position.set(cameraDistance, cameraHeight, cameraDistance);
    camera.lookAt(0, 0, 0);

    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;

    const ambientLight = new THREE.AmbientLight(0xffffff, 2.0); // Aumentado de 1.0 a 2.0
    scene.add(ambientLight);
    const dirLight = new THREE.DirectionalLight(0xffffff, 2.5); // Aumentado de 1.5 a 2.5
    dirLight.position.set(10, 20, 5);
    dirLight.castShadow = true;
    scene.add(dirLight);

    raycaster = new THREE.Raycaster();
    mouse = new THREE.Vector2();

    canvas.addEventListener('click', onCanvasClick);
    canvas.addEventListener('mousemove', onCanvasMove);
}

function resizeCanvas() {
    if (camera && renderer) {
        const aspect = window.innerWidth / window.innerHeight;
        camera.left = -cameraZoom * aspect;
        camera.right = cameraZoom * aspect;
        camera.top = cameraZoom;
        camera.bottom = -cameraZoom;
        camera.updateProjectionMatrix();

        renderer.setSize(window.innerWidth, window.innerHeight);
    }
}

/**
 * ¡NUEVO!
 * Carga los datos de texto de un SVG desde Firebase.
 * @param {string} svgId - El ID del SVG (ej: 'tank_svg')
 * @returns {Promise<string|null>} - El string de datos SVG o null.
 */
async function loadSvgData(svgId) {
    // 1. Comprobar caché de datos
    if (svgDataCache.has(svgId)) {
        return svgDataCache.get(svgId);
    }

    // 2. Si no está, crear una promesa para cargarlo
    const svgRef = ref(db, `moba-demo-svgs/${svgId}`);
    const promise = get(svgRef).then(snapshot => {
        if (snapshot.exists()) {
            const data = snapshot.val().data;
            svgDataCache.set(svgId, data); // Guardar el dato real
            return data;
        } else {
            console.warn(`(Juego) No se encontró el SVG con ID: ${svgId}`);
            svgDataCache.set(svgId, null); // Marcar como nulo para no reintentar
            return null;
        }
    }).catch(err => {
        console.error(`Error cargando SVG ${svgId}:`, err);
        svgDataCache.set(svgId, null);
        return null;
    });

    // 3. Guardar la *promesa* en caché para evitar peticiones duplicadas
    svgDataCache.set(svgId, promise);
    return promise;
}


/**
 * ¡MODIFICADO!
 * Carga una textura. Ahora acepta una definición (para saber el tamaño)
 * y el tipo de textura (ej. 'imgSrc' o 'imgSrcTop').
 * Maneja tanto PNG/JPG de Storage como SVG de la DB.
 * @param {object} def - La definición del objeto (para 'baseWidth', 'baseHeight')
 * @param {string} textureType - La propiedad de la 'def' que contiene el src (ej: 'imgSrc', 'imgSrcTop')
 * @returns {THREE.Texture | null}
 */
function loadTexture(def, textureType = 'imgSrc') {
    if (!def) return null;
    const src = def[textureType];
    if (!src) return null;

    // --- Lógica SVG ---
    if (src.startsWith('svg:')) {
        const svgId = src.substring(4);
        const width = def.baseWidth || 128; // Tamaño por defecto si no se define
        const height = def.baseHeight || 128;
        const cacheKey = `${svgId}_${width}x${height}`;

        // 1. Comprobar caché de textura 3D
        if (svgTextureCache.has(cacheKey)) {
            return svgTextureCache.get(cacheKey);
        }

        // 2. Crear una textura vacía. Se rellenará de forma asíncrona.
        const texture = new THREE.Texture(); 
        texture.colorSpace = THREE.SRGBColorSpace; // Importante para colores correctos
        
        // 3. Guardar la textura (aún vacía) en caché para devolverla inmediatamente
        svgTextureCache.set(cacheKey, texture); 

        // 4. Iniciar la carga asíncrona
        loadSvgData(svgId).then(svgData => {
            if (!svgData) {
                console.warn(`No se pudo cargar textura para SVG: ${svgId}`);
                svgTextureCache.delete(cacheKey); // Limpiar caché si falla
                return;
            }

            // Crear Data URL
            const dataUrl = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
            
            const img = new Image();
            img.onload = () => {
                // Rasterizar a un canvas
                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                
                // Actualizar la textura de Three.js (que ya fue devuelta)
                texture.image = canvas;
                texture.needsUpdate = true;
            };
            img.onerror = (err) => {
                 console.error(`Error al rasterizar SVG ${svgId}:`, err);
                 svgTextureCache.delete(cacheKey); // Limpiar caché si falla
            };
            img.src = dataUrl;
        });

        // 5. Devolver la textura (aún vacía)
        return texture; 

    } 
    // --- Lógica PNG/JPG (Existente) ---
    else {
        const storageUrl = getFirebaseStorageUrl(src);
        if (!storageUrl) {
            console.warn(`(Juego) No se pudo generar la URL de Storage para: ${src}`);
            return null;
        }
        
        if (textureCache.has(storageUrl)) {
            return textureCache.get(storageUrl);
        }
        
        loader.crossOrigin = "anonymous"; 
        const texture = loader.load(storageUrl, (tex) => { 
            tex.wrapS = THREE.RepeatWrapping;
            tex.wrapT = THREE.RepeatWrapping;
            textureCache.set(storageUrl, tex); 
        });
        return texture;
    }
}


// 9. Lógica de UI (Bocadillo y Menú de Interacción)

function showNpcModal(npc, npcKey, dialogText) { 
    if (activeNpcKey || isInteractionMenuOpen) {
        hideNpcModal();
        hideInteractionMenu();
    }
    let text = dialogText || "Hola."; 
    if (speechBubbleText && speechBubble) {
        speechBubbleText.textContent = text;
        speechBubble.className = 'speech-bubble-visible';
        activeNpcKey = npcKey || `dialog_${Date.now()}`; 
    }
}

function hideNpcModal() {
    if (speechBubble) {
        speechBubble.className = 'speech-bubble-hidden';
    }
    activeNpcKey = null;
}

function showInteractionMenu(target) {
    if (isInteractionMenuOpen || activeNpcKey) {
        hideInteractionMenu();
        hideNpcModal();
    }
    
    const { entityDef, entityInstance, tileRef, position } = target;
    const interactions = entityDef.interactions || [];
    
    if (interactions.length === 0) return; 

    activeInteractionTarget = target; 
    
    interactionMenuButtons.innerHTML = '';
    
    interactions.forEach(interaction => {
        const button = document.createElement('button');
        let label = interaction.label;
        
        if (entityInstance && entityInstance.state === 'waiting' && entityInstance.waitEndTime) {
            if (Date.now() < entityInstance.waitEndTime) {
                if (interaction.actionType === 'wait_replace') {
                    button.disabled = true;
                    label = `${label} (Esperando...)`;
                }
            } else {
                if (interaction.actionType === 'wait_replace') {
                    label = interaction.labelEnd || 'Completado'; 
                }
            }
        }
        
        button.textContent = label;
        if (button.disabled) {
            button.style.opacity = "0.5";
            button.style.cursor = "not-allowed";
        } else {
            button.onclick = () => onInteractionButtonClick(interaction);
        }
        interactionMenuButtons.appendChild(button);
    });
    
    const screenPos = position.clone().project(camera);
    const screenX = (screenPos.x * 0.5 + 0.5) * window.innerWidth;
    const screenY = (screenPos.y * -0.5 + 0.5) * window.innerHeight;

    interactionMenu.style.left = `${screenX}px`;
    interactionMenu.style.top = `${screenY}px`;
    interactionMenu.className = 'interaction-menu-visible';
    isInteractionMenuOpen = true;
}

function hideInteractionMenu() {
    if (interactionMenu) {
        interactionMenu.className = 'interaction-menu-hidden';
    }
    isInteractionMenuOpen = false;
    activeInteractionTarget = null; 
}

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

// 10. Lógica de Input 3D (Raycasting)

function onCanvasClick(event) {
    if (activeNpcKey) {
        hideNpcModal();
        return; 
    }
    if (isInteractionMenuOpen) {
        hideInteractionMenu();
        return;
    }
    
    if (!myPlayerId || !db || !canvas || !logica.isPositionPassable) return;
    if (event.target !== canvas) return;

    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);

    const intersects = raycaster.intersectObjects(interactableObjects);
    if (intersects.length === 0) return;

    const intersection = intersects[0];
    const targetPoint = intersection.point;
    let targetObject = intersection.object;

    // ¡NUEVA MEJORA! Si hacemos clic en un hijo de un grupo (ej. un plano de un 'cross' o parte de un GLTF)
    // queremos subir al objeto padre (el Grupo) para obtener el userData unificado.
    while (targetObject.parent && !targetObject.userData.key) {
        targetObject = targetObject.parent;
    }
    const userData = targetObject.userData;


    let entityDef = userData.definition;
    let entityInstance = userData.instance; 
    let entityType = userData.type;
    let interactions = (entityDef && entityDef.interactions) ? entityDef.interactions : [];
    
    if (entityType === 'ground') {
        entityDef = null; 
        interactions = [];
    }
    
    if (!entityDef) {
        return handleMoveClick(targetPoint);
    }
    
    // Si es un portal y NO tiene interacciones definidas, 
    // ¡asumir que la acción por defecto es teletransportar!
    if (entityType === 'portal' && interactions.length === 0) {
        console.log("Portal sin interacción explícita, asumiendo 'portal_teleport'");
        interactions.push({ 
            actionType: 'portal_teleport', 
            label: 'Teletransportar' 
        });
    }

    const entityPos = new THREE.Vector3(
        userData.x + 0.5, 
        logica.getGroundHeightAt(userData.x + 0.5, userData.z + 0.5),
        userData.z + 0.5
    );
    // Usamos el 'range' de la definición, o 2.0 por defecto
    const interactionRange = (entityDef && entityDef.range) ? entityDef.range : MELEE_RANGE;
    const inRange = logica.getNpcInteraction(entityPos, interactionRange); 

    if (!inRange) {
        return handleMoveClick(targetPoint);
    }

    const tileIndex = userData.z * currentMapData.width + userData.x;
    const tileRef = ref(db, `moba-demo-maps/${currentMapId}/tiles/${tileIndex}`);
    
    const target = {
        entityDef: entityDef,
        entityInstance: entityInstance,
        tileRef: tileRef,
        position: targetObject.position, 
        x: userData.x, 
        z: userData.z, 
        meshKey: userData.key 
    };

    if (interactions.length === 0) {
        return handleMoveClick(targetPoint);
    }
    
    activeInteractionTarget = target;

    if (interactions.length === 1) {
        onInteractionButtonClick(interactions[0]);
        return; 
    }
    
    if (interactions.length > 1) {
        showInteractionMenu(target);
        return; 
    }
}
function handleMoveClick(targetPoint) {
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
        return;
    }

    update(myPlayerRef, {
        x: finalValidPos.x,
        z: finalValidPos.z
    });
}

function onInteractionButtonClick(interaction) {
    if (!activeInteractionTarget) {
        console.error("Se intentó una acción sin un objetivo activo.");
        return;
    }
    
    const target = activeInteractionTarget;
    
    switch (interaction.actionType) {
        case 'dialog':
            showNpcModal(target.entityInstance, target.meshKey, interaction.dialogText);
            break;
            
        case 'collect_replace':
        case 'replace_self':
            executeReplacement(target, interaction.replaceId);
            break;
            
        case 'wait_replace':
            executeWaitAndReplace(target, interaction);
            break;
            
        case 'portal_teleport':
             const portalDest = logica.getPortalDestination(target.entityInstance);
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
             } else {
                 showNpcModal(null, 'portal_error', 'Este portal aún no tiene un destino configurado.');
             }
            break;
            
        case 'none':
        default:
            console.log("Acción 'none' o desconocida:", interaction.label);
            break;
    }
    
    hideInteractionMenu(); 
}

function executeReplacement(target, replaceId) {
    let newElementInstance = 'none'; 
    
    if (replaceId && replaceId !== 'none') {
        const def = GAME_DEFINITIONS.elementTypes[replaceId];
        
        if (def) {
            // Unificado: cualquier cosa visible es una instancia de objeto
            if (def.drawType === 'sprite' || def.drawType === 'portal' || def.drawType === 'block') {
                 newElementInstance = { 
                    id: def.id 
                 };
                 // Copiar propiedades por defecto de la nueva definición
                 if (def.movement) {
                     newElementInstance.movement = def.movement;
                     newElementInstance.route = [];
                 }
                 if(def.drawType === 'portal') {
                     newElementInstance.destMap = null;
                     newElementInstance.destX = null;
                     newElementInstance.destZ = null;
                 }
            }
        } else {
            console.warn(`ID de reemplazo "${replaceId}" no encontrado. Se usará 'none'.`);
        }
    }

    update(target.tileRef, {
        e: newElementInstance
    }).catch((err) => {
        console.error("Error al reemplazar el elemento:", err);
    });
}

function executeWaitAndReplace(target, interaction) {
    const instance = target.entityInstance;
    
    if (instance && instance.state === 'waiting' && instance.waitEndTime) {
        if (Date.now() >= instance.waitEndTime) {
            executeReplacement(target, instance.replaceId || interaction.replaceId);
        } else {
            const timeLeft = Math.round((instance.waitEndTime - Date.now()) / 1000);
            showNpcModal(instance, 'wait_dialog', `Aún está creciendo. Faltan ${timeLeft}s...`);
        }
    } else {
        const newReplaceId = interaction.replaceId || 'none';
        const duration = interaction.duration || 30000; 
        
        const waitingInstance = {
            id: target.entityDef.id, 
            state: 'waiting',
            waitEndTime: Date.now() + duration,
            replaceId: newReplaceId, 
            // Preservar datos de la instancia anterior
            movement: (instance ? instance.movement : null) || null, 
            route: (instance ? instance.route : []) || [],
            destMap: (instance ? instance.destMap : null) || null,
            destX: (instance ? instance.destX : null) || null,
            destZ: (instance ? instance.destZ : null) || null,
        };
        
        update(target.tileRef, {
            e: waitingInstance
        }).catch((err) => {
            console.error("Error al iniciar 'wait_replace':", err);
        });
    }
}

function onCanvasMove(event) {
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    
    if (isInteractionMenuOpen) return; 
    
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(interactableObjects);

    if (intersects.length > 0) {
        let targetObject = intersects[0].object;
        // Subir al padre si no encontramos userData
        while (targetObject.parent && !targetObject.userData.key) {
            targetObject = targetObject.parent;
        }
        const userData = targetObject.userData;
        const def = userData.definition;
        
        let isInteractable = (def && def.interactions && def.interactions.length > 0);
        
        // Comprobar portales sin interacción
        if (!isInteractable && userData.type === 'portal') {
            isInteractable = true;
        }
        
        canvas.style.cursor = isInteractable ? 'pointer' : 'default';
        
    } else {
        canvas.style.cursor = 'default';
    }
}

// 11. Funciones de Control de Cámara

function rotateCameraLeft() {
    targetCameraAngle -= CAMERA_ROTATE_STEP; 
}
function rotateCameraRight() {
    targetCameraAngle += CAMERA_ROTATE_STEP; 
}
function zoomIn() {
    setCameraZoom(cameraZoom - CAMERA_ZOOM_STEP);
}
function zoomOut() {
    setCameraZoom(cameraZoom + CAMERA_ZOOM_STEP);
}
function onMouseWheel(event) {
    event.preventDefault();
    const delta = event.deltaY > 0 ? 1 : -1;
    setCameraZoom(cameraZoom + delta * (CAMERA_ZOOM_STEP / 2)); 
}
function setCameraZoom(newZoom) {
    cameraZoom = THREE.MathUtils.clamp(newZoom, CAMERA_MIN_ZOOM, CAMERA_MAX_ZOOM);
    const aspect = window.innerWidth / window.innerHeight;
    camera.left = -cameraZoom * aspect;
    camera.right = cameraZoom * aspect;
    camera.top = cameraZoom;
    camera.bottom = -cameraZoom;
    camera.updateProjectionMatrix();
}
function lerpAngle(start, end, amt) {
    let difference = end - start;
    if (difference > Math.PI) {
        difference -= (2 * Math.PI); 
    } else if (difference < -Math.PI) {
        difference += (2 * Math.PI); 
    }
    return start + difference * amt;
}


// 12. Inicialización de Firebase

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
                Menu.initMenu(db, myPlayerRef, myPlayerId);

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
    // Limpiar todos los meshes cacheados
    for (const key in worldMeshes) {
        scene.remove(worldMeshes[key]);
        worldMeshes[key].geometry.dispose();
        // Los materiales se cachean, no es necesario limpiarlos aquí
    }
    worldMeshes = {};
    
    // --- ¡CORRECCIÓN! Limpieza robusta de sprites y modelos ---
    for (const key in spriteMeshes) {
        const mesh = spriteMeshes[key];
        scene.remove(mesh);
        // traverse se encarga de grupos y meshes individuales
        mesh.traverse((child) => {
            if (child.isMesh) {
                child.geometry.dispose();
                // Si el material es clonado (ej. cross), limpiarlo
                if (child.material) {
                     child.material.map?.dispose();
                     child.material.dispose();
                }
            }
        });
    }
    spriteMeshes = {};

    for (const key in npcMeshes) {
        const mesh = npcMeshes[key];
        scene.remove(mesh);
        mesh.traverse((child) => {
            if (child.isMesh) {
                child.geometry.dispose();
                if (child.material) {
                     child.material.map?.dispose();
                     child.material.dispose();
                }
            }
        });
    }
    npcMeshes = {};
    
    // Limpiar objetos clicables
    interactableObjects = [];
}

// ¡MODIFICADO!
function buildWorld(tileGrid) {
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
                        new THREE.MeshStandardMaterial({ map: loadTexture(groundDef, 'imgSrcRight'), color: groundDef.color }), 
                        new THREE.MeshStandardMaterial({ map: loadTexture(groundDef, 'imgSrcLeft'), color: groundDef.color }), 
                        new THREE.MeshStandardMaterial({ map: loadTexture(groundDef, 'imgSrcTop'), color: groundDef.color }), 
                        new THREE.MeshStandardMaterial({ color: 0x332211 }), 
                        new THREE.MeshStandardMaterial({ map: loadTexture(groundDef, 'imgSrcRight'), color: groundDef.color }), 
                        new THREE.MeshStandardMaterial({ map: loadTexture(groundDef, 'imgSrcLeft'), color: groundDef.color })
                    ];
                }
                const materials = groundMaterialCache[tile.g];
                const mesh = new THREE.Mesh(geometry, materials);
                mesh.position.set(x + 0.5, height / 2, z + 0.5); 
                mesh.receiveShadow = true;
                mesh.userData = { type: 'ground', x, z, definition: null, instance: null, key: `ground_${x}_${z}` }; 
                
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
            const instance = (typeof tile.e === 'object') ? tile.e : null;
            
            if (instance && instance.movement && instance.movement !== 'still') {
                // --- ES UN NPC (ENTIDAD MÓVIL) ---
                const npcKey = `npc_${z}_${x}`;
                const groundHeight = logica.getGroundHeightAt(x + 0.5, z + 0.5);
                npcStates[npcKey] = {
                    ...instance, 
                    x: x + 0.5,
                    z: z + 0.5,
                    y: groundHeight + playerSize, 
                    targetX: x + 0.5,
                    targetZ: z + 0.5,
                    isMoving: false,
                    lastMoveTime: Date.now(),
                };
                spawnNpcMesh(npcStates[npcKey], npcKey, elementDef); 

            } else if (elementDef.drawType === 'block') {
                // --- ES UN BLOQUE ---
                const blockHeight = elementDef.height || 1.0;
                const blockGeo = new THREE.BoxGeometry(1, blockHeight, 1);
                
                if (!blockMaterialCache[elementId]) {
                     blockMaterialCache[elementId] = [
                        new THREE.MeshStandardMaterial({ map: loadTexture(elementDef, 'imgSrcRight') }),
                        new THREE.MeshStandardMaterial({ map: loadTexture(elementDef, 'imgSrcLeft') }),
                        new THREE.MeshStandardMaterial({ map: loadTexture(elementDef, 'imgSrcTop') }),
                        new THREE.MeshStandardMaterial({ color: 0x333333 }),
                        new THREE.MeshStandardMaterial({ map: loadTexture(elementDef, 'imgSrcRight') }),
                        new THREE.MeshStandardMaterial({ map: loadTexture(elementDef, 'imgSrcLeft') })
                    ];
                }
                const blockMesh = new THREE.Mesh(blockGeo, blockMaterialCache[elementId]);
                blockMesh.position.set(x + 0.5, height + blockHeight / 2, z + 0.5);
                blockMesh.castShadow = true;
                blockMesh.userData = { type: 'block', x, z, key: elementKey, definition: elementDef, instance: tile.e };
                
                scene.add(blockMesh);
                worldMeshes[elementKey] = blockMesh;
                
                if (elementDef.interactions && elementDef.interactions.length > 0) {
                    interactableObjects.push(blockMesh);
                }

            // --- ¡BLOQUE MODIFICADO (GLTF) ---
            // Si es un sprite, o un portal que *tiene* un asset (img o modelo)
            } else if (elementDef.drawType === 'sprite' || (elementDef.drawType === 'portal' && (elementDef.imgSrc || elementDef.modelSrc))) {
                
                const renderStyle = elementDef.renderStyle || 'cross'; 

                // --- ¡NUEVO (GLTF)! ---
                if (renderStyle === 'gltf' && elementDef.modelSrc) {
                    // Es un modelo GLTF estático
                    const groundHeight = height; // Altura del suelo donde se pone
                    const mesh = spawnGltfMesh(instance, elementKey, elementDef, groundHeight, (x + 0.5), (z + 0.5));
                    
                    scene.add(mesh);
                    spriteMeshes[elementKey] = mesh; // Guardar en meshes estáticos
                    
                    if (elementDef.interactions && elementDef.interactions.length > 0) {
                        interactableObjects.push(mesh); // El grupo principal es clicable
                    }
                
                // --- ¡LÓGICA DE SPRITE 2D (MODIFICADA)! ---
                } else if (renderStyle !== 'gltf') { // Solo ejecutar si NO es GLTF
                    
                    const map = loadTexture(elementDef, 'imgSrc');
                    if (!map && !elementDef.symbol) { // Si no hay ni textura ni símbolo, no dibujar
                        console.warn(`No hay asset 2D (imgSrc) para ${elementDef.id}.`);
                    }

                    const aspect = (elementDef.baseWidth || 1) / (elementDef.baseHeight || 1);
                    const planeHeight = (elementDef.baseHeight || 128) / 100; 
                    const planeWidth = planeHeight * aspect;

                    const material = new THREE.MeshStandardMaterial({ 
                        map: map,
                        transparent: true, 
                        side: THREE.DoubleSide, 
                        alphaTest: 0.1 
                    });
                    
                    let mesh; // El objeto 3D final
                    let userData = { 
                        type: elementDef.drawType, 
                        x, z, 
                        key: elementKey, 
                        definition: elementDef, 
                        instance: tile.e,
                        planeHeight: planeHeight
                    };

                    switch(renderStyle) {
                        case 'cubic':
                            const cubeGeo = new THREE.BoxGeometry(planeWidth, planeHeight, planeWidth);
                            const topMaterial = new THREE.MeshStandardMaterial({ color: 0x000000 });
                            const sideMaterial = material;
                            const cubeMaterials = [
                                sideMaterial, sideMaterial, topMaterial, topMaterial, sideMaterial, sideMaterial
                            ];
                            mesh = new THREE.Mesh(cubeGeo, cubeMaterials);
                            mesh.position.set(x + 0.5, height + (planeHeight / 2), z + 0.5);
                            mesh.castShadow = true;
                            mesh.userData = userData;
                            break;

                        case 'billboard':
                            const planeGeo = new THREE.PlaneGeometry(planeWidth, planeHeight);
                            mesh = new THREE.Mesh(planeGeo, material);
                            mesh.position.set(x + 0.5, height + (planeHeight / 2), z + 0.5);
                            mesh.castShadow = true;
                            mesh.userData = userData;
                            break;

                        case 'cross':
                        default:
                            mesh = new THREE.Group();
                            mesh.position.set(x + 0.5, height + (planeHeight / 2), z + 0.5);
                            
                            const geometry1 = new THREE.PlaneGeometry(planeWidth, planeHeight);
                            const planeMesh1 = new THREE.Mesh(geometry1, material);
                            planeMesh1.castShadow = true;
                            planeMesh1.userData = userData; 
                            mesh.add(planeMesh1);
                            
                            const geometry2 = new THREE.PlaneGeometry(planeWidth, planeHeight);
                            const planeMesh2 = new THREE.Mesh(geometry2, material.clone());
                            planeMesh2.rotation.y = Math.PI / 2; 
                            planeMesh2.castShadow = true;
                            planeMesh2.userData = userData; 
                            mesh.add(planeMesh2);

                            mesh.userData = userData; // Añadir al grupo
                            break;
                    }
                    
                    scene.add(mesh);
                    spriteMeshes[elementKey] = mesh;

                    if (elementDef.interactions && elementDef.interactions.length > 0) {
                        if (mesh.isGroup) {
                            interactableObjects.push(mesh); // Clicar en el grupo (para 'cross')
                        } else {
                            interactableObjects.push(mesh); // Clicar en el mesh ('billboard', 'cubic')
                        }
                    }
                }
            
            // --- ¡MODIFICADO! Solo si no hay NINGÚN asset
            } else if (elementDef.drawType === 'portal' && !elementDef.imgSrc && !elementDef.modelSrc) {
                // --- ES UN PORTAL-CILINDRO (Fallback) ---
                const portalGeo = new THREE.CylinderGeometry(0.5, 0.5, 0.2, 16);
                const portalMat = new THREE.MeshBasicMaterial({ color: 0x00FFFF, transparent: true, opacity: 0.5 });
                const portalMesh = new THREE.Mesh(portalGeo, portalMat);
                portalMesh.position.set(x + 0.5, height + 0.1, z + 0.5);
                
                portalMesh.userData = { type: 'portal', x, z, key: elementKey, definition: elementDef, instance: tile.e };
                
                scene.add(portalMesh);
                worldMeshes[elementKey] = portalMesh; // Guardar en worldMeshes
                interactableObjects.push(portalMesh);
            }
        }
    }
}

// 14. Carga de Mapas
function loadMap(mapId) {
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
        canvas,
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
                if (id === myPlayerId) {
                    if (interpolatedPlayersState[id]) {
                         playersState[id] = interpolatedPlayersState[id];
                    }
                    continue; 
                }
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

// --- ¡FUNCIÓN COMPLETAMENTE REESCRITA (GLTF)! ---
function spawnNpcMesh(state, key, elementDef) {
    if (!elementDef) {
        console.warn(`No se encontró definición para NPC con id ${state.id}`);
        return;
    }

    const groundY = state.y - playerSize;
    let mesh; // El objeto 3D final (Mesh o Group)
    
    // Datos comunes para el userData
    let userData = { 
        type: 'sprite', // Default
        key: key,
        planeHeight: playerSize, // Default
        x: Math.floor(state.x), 
        z: Math.floor(state.z),
        definition: elementDef,
        instance: state
    };
    
    const renderStyle = elementDef.renderStyle || 'billboard'; 

    // --- ¡NUEVA LÓGICA DE RENDER STYLE (GLTF)! ---
    if (renderStyle === 'gltf' && elementDef.modelSrc) {
        // Es un modelo GLTF, usar el nuevo spawner
        mesh = spawnGltfMesh(state, key, elementDef, groundY);

    // --- ¡MODIFICADO! Solo ejecutar si NO es GLTF ---
    } else if (renderStyle !== 'gltf') {
        // --- LÓGICA DE SPRITE 2D (Existente) ---
        const map = loadTexture(elementDef, 'imgSrc');
        const aspect = (elementDef.baseWidth || 1) / (elementDef.baseHeight || 1);
        const planeHeight = (elementDef.baseHeight || 128) / 100; 
        const planeWidth = planeHeight * aspect;
        
        userData.planeHeight = planeHeight; // Actualizar userData

        const material = new THREE.MeshStandardMaterial({ 
            map: map,
            transparent: true, 
            side: THREE.DoubleSide, 
            alphaTest: 0.1
        });

        switch(renderStyle) {
            case 'cubic':
                const cubeGeo = new THREE.BoxGeometry(planeWidth, planeHeight, planeWidth);
                const topMaterial = new THREE.MeshStandardMaterial({ color: 0x000000 });
                const sideMaterial = material;
                const cubeMaterials = [
                    sideMaterial, sideMaterial, topMaterial, topMaterial, sideMaterial, sideMaterial
                ];
                mesh = new THREE.Mesh(cubeGeo, cubeMaterials);
                mesh.position.set(state.x, groundY + (planeHeight / 2), state.z);
                mesh.castShadow = true;
                mesh.userData = userData;
                break;
                
            case 'cross':
                mesh = new THREE.Group();
                mesh.position.set(state.x, groundY + (planeHeight / 2), state.z);
                
                const geo1 = new THREE.PlaneGeometry(planeWidth, planeHeight);
                const mesh1 = new THREE.Mesh(geo1, material);
                mesh1.castShadow = true;
                mesh1.userData = userData; 
                mesh.add(mesh1);

                const geo2 = new THREE.PlaneGeometry(planeWidth, planeHeight);
                const mesh2 = new THREE.Mesh(geo2, material.clone());
                mesh2.rotation.y = Math.PI / 2;
                mesh2.castShadow = true;
                mesh2.userData = userData; 
                mesh.add(mesh2);
                
                mesh.userData = userData; // Añadir userData al grupo
                break;

            case 'billboard':
            default:
                const planeGeo = new THREE.PlaneGeometry(planeWidth, planeHeight);
                mesh = new THREE.Mesh(planeGeo, material);
                mesh.position.set(state.x, groundY + (planeHeight / 2), state.z);
                mesh.castShadow = true;
                mesh.userData = userData;
                mesh.lastPos = new THREE.Vector3(state.x, groundY + (planeHeight / 2), state.z); 
                break;
        }
    }
    // --- FIN LÓGICA RENDER STYLE ---

    // --- ¡NUEVO! Fallback de seguridad ---
    if (!mesh) { // Si el mesh no se creó (ej. es GLTF pero sin modelSrc)
        console.warn(`No se pudo crear el mesh para ${key} (Estilo: ${renderStyle}, modelSrc: ${elementDef.modelSrc}). Usando placeholder.`);
        // Crear un cubo rojo de error
        const geometry = new THREE.BoxGeometry(0.5, 1, 0.5);
        const material = new THREE.MeshStandardMaterial({ color: 0xff0000 });
        mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(state.x, groundY + 0.5, state.z);
        mesh.userData = userData; // Asignar userData para que no crashee
    }
    // ---

    npcMeshes[key] = mesh;
    scene.add(mesh);
    
    // Hacer clicable si tiene interacciones
    if (elementDef.interactions && elementDef.interactions.length > 0) {
        if (mesh.isGroup) {
            // Para 'cross' y 'gltf', el 'mesh' es un Grupo.
            // Hacemos que el grupo principal sea clicable.
            interactableObjects.push(mesh);
        } else {
            interactableObjects.push(mesh);
        }
    }
}

/**
 * ¡NUEVO!
 * Carga o clona un modelo GLB/GLTF y lo devuelve como un THREE.Group.
 * @param {object} state - La instancia de la entidad (para pos X/Z si es NPC)
 * @param {string} key - La clave única del mesh (ej. 'npc_1_2' o 'el_1_2')
 * @param {object} elementDef - La definición (para modelSrc Y modelScale)
 * @param {number} groundY - La altura Y del suelo
 * @param {number} [staticX] - Posición X si es un objeto estático
 * @param {number} [staticZ] - Posición Z si es un objeto estático
 * @returns {THREE.Group} - Un grupo que contendrá el modelo
 */
function spawnGltfMesh(state, key, elementDef, groundY, staticX = null, staticZ = null) {
    const modelFile = elementDef.modelSrc;
    if (!modelFile) {
        console.error(`Intento de cargar GLTF para ${key} pero 'modelSrc' está vacío.`);
        // Devolver un placeholder de error
        const geometry = new THREE.BoxGeometry(0.5, 1, 0.5);
        const material = new THREE.MeshStandardMaterial({ color: 0xff0000 });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(staticX ?? state.x, groundY + 0.5, staticZ ?? state.z);
        return mesh;
    }
    
    const posX = staticX ?? state.x;
    const posZ = staticZ ?? state.z;

    // 1. Crear un Grupo "contenedor"
    const group = new THREE.Group();
    // ¡¡NO SE PONE LA POSICIÓN TODAVÍA!! Se pondrá cuando el modelo cargue.
    
    // Aplicar la escala guardada
    const scale = elementDef.modelScale || 1.0;
    group.scale.set(scale, scale, scale);
    
    group.userData = { 
        type: 'gltf-model', 
        key: key,
        planeHeight: 1.0, // Altura para el bocadillo/menú (se sobrescribe abajo)
        x: Math.floor(posX), 
        z: Math.floor(posZ),
        definition: elementDef,
        instance: state
    };
    group.lastPos = new THREE.Vector3(posX, groundY, posZ); // Usar para rotación

    // 2. Comprobar caché
    if (gltfCache.has(modelFile)) {
        const sourceScene = gltfCache.get(modelFile);
        if (sourceScene) { 
            const modelClone = sourceScene.clone();
            group.add(modelClone);
            
            // --- ¡¡¡LÓGICA DE POSICIÓN CORREGIDA!!! ---
            const box = new THREE.Box3().setFromObject(modelClone);
            const verticalOffset = box.min.y * scale; // Cuánto hay que subir/bajar el modelo
            group.position.set(posX, groundY - verticalOffset, posZ); //Aplica el offset
            
            group.userData.planeHeight = (box.max.y - box.min.y) * scale;
            group.lastPos.copy(group.position); // Actualizar lastPos

        } else {
            console.log(`Modelo ${modelFile} todavía se está cargando, se añadirá pronto.`);
        }
        
    } else {
        // ¡No encontrado! Cargar asíncronamente
        const modelUrl = getFirebaseModelUrl(modelFile);
        if (modelUrl) {
            gltfCache.set(modelFile, null); // null como marcador
            
            gltfLoader.load(modelUrl, (gltf) => {
                gltf.scene.traverse((child) => {
                    if (child.isMesh) {
                        child.castShadow = true;
                        child.receiveShadow = true;
                    }
                });
                
                gltfCache.set(modelFile, gltf.scene); 
                
                const modelClone = gltf.scene.clone();
                group.add(modelClone);
                
                // --- ¡¡¡LÓGICA DE POSICIÓN CORREGIDA!!! ---
                const box = new THREE.Box3().setFromObject(modelClone);
                const verticalOffset = box.min.y * scale; // Cuánto hay que subir/bajar el modelo
                group.position.set(posX, groundY - verticalOffset, posZ); //Aplica el offset
                
                group.userData.planeHeight = (box.max.y - box.min.y) * scale;
                group.lastPos.copy(group.position); // Actualizar lastPos

            }, undefined, (error) => {
                console.error(`Error al cargar el modelo: ${modelFile}`, error);
                gltfCache.delete(modelFile); // Permitir reintento
            });
        }
    }
    
    // 3. Devolver el grupo
    return group;
}


// 16. Bucle Principal del Juego
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
    
    // --- BUCLE NPC MODIFICADO (GLTF) ---
    for (const key in npcStates) {
        const state = npcStates[key]; 
        const mesh = npcMeshes[key];
        if (!mesh) continue;
        
        const groundY = state.y - playerSize;
        let targetY;

        // Comprobación de 'mesh' (si es un GRUPO: 'cross' o 'gltf')
        if (mesh.isGroup) { 
            // Para GLTF, la altura Y es el suelo. Para Sprites, es la mitad.
            targetY = groundY;
            if (mesh.userData.type !== 'gltf-model') {
                const planeHeight = mesh.userData.planeHeight || playerSize;
                targetY = groundY + (planeHeight / 2);
            }

            const targetPos = new THREE.Vector3(state.x, targetY, state.z);
            mesh.position.lerp(targetPos, PLAYER_LERP_AMOUNT);
            
            // Rotar el modelo GLB/GLTF según el movimiento
            if (mesh.userData.type === 'gltf-model') {
                if (mesh.lastPos) {
                    const dx = mesh.position.x - mesh.lastPos.x;
                    const dz = mesh.position.z - mesh.lastPos.z;
                    if (Math.abs(dx) > 0.001 || Math.abs(dz) > 0.001) {
                        const angle = Math.atan2(dx, dz);
                        mesh.rotation.y = angle; // Rotar el grupo
                    }
                }
                mesh.lastPos = mesh.position.clone();
            }
            // Los grupos ('cross') no rotan
        }
        // Comprobación de 'mesh' (si es un MESH: 'cubic' o 'billboard')
        else if (mesh.isMesh) {
            const planeHeight = mesh.userData.planeHeight || playerSize;
            targetY = groundY + (planeHeight / 2);
            const targetPos = new THREE.Vector3(state.x, targetY, state.z);
            mesh.position.lerp(targetPos, PLAYER_LERP_AMOUNT);
            
            const renderStyle = (mesh.userData.definition) ? mesh.userData.definition.renderStyle : 'billboard';
            if (renderStyle === 'billboard') {
                if (mesh.lastPos) {
                    const dx = mesh.position.x - mesh.lastPos.x;
                    const dz = mesh.position.z - mesh.lastPos.z;
                    if (Math.abs(dx) > 0.001 || Math.abs(dz) > 0.001) {
                        const angle = Math.atan2(dx, dz);
                        mesh.rotation.y = angle;
                    }
                }
                mesh.lastPos = mesh.position.clone();
            }
        } 
    }
    
    // --- BUCLE DE SPRITES ESTÁTICOS (MODIFICADO) ---
    for (const key in spriteMeshes) {
        const mesh = spriteMeshes[key];
        
        // El 'userData' puede estar en el 'mesh' (billboard/cubic) o en el grupo (cross/gltf)
        let userData = mesh.userData;
        if (!userData) continue; 
        
        // --- 1. Lógica de Reemplazo Pasivo ---
        if (userData.instance && userData.instance.state === 'waiting' && Date.now() >= userData.instance.waitEndTime) {
            
            if (!userData.instance._isReplacing) { 
                userData.instance._isReplacing = true; 
                
                console.log(`Disparador pasivo 'wait_replace' para: ${key} en (${userData.x}, ${userData.z})`);

                const tileIndex = userData.z * currentMapData.width + userData.x;
                const tileRef = ref(db, `moba-demo-maps/${currentMapId}/tiles/${tileIndex}`);
                
                const target = {
                    entityDef: userData.definition,
                    entityInstance: userData.instance,
                    tileRef: tileRef,
                    x: userData.x,
                    z: userData.z
                };
                
                const replaceId = userData.instance.replaceId || 'none'; 
                
                executeReplacement(target, replaceId);
            }
        }

        // --- 2. Rotación de Billboards ---
        if (mesh.isMesh && userData.definition && userData.definition.renderStyle === 'billboard') {
            mesh.lookAt(camera.position.x, mesh.position.y, camera.position.z);
        }
    }
    // --- FIN BUCLE ---


    // 3. Actualizar Bocadillo de Diálogo
    if (activeNpcKey) {
        let mesh = npcMeshes[activeNpcKey]; // 1. Buscar en NPCs (móviles)
        if (!mesh) {
            mesh = spriteMeshes[activeNpcKey]; // 2. Buscar en Sprites (estáticos)
        }

        if (mesh) {
            const worldPos = new THREE.Vector3();
            let planeHeight = playerSize; 

            // Obtener la altura del objeto (sea Grupo o Mesh)
            if (mesh.userData && mesh.userData.planeHeight) {
                planeHeight = mesh.userData.planeHeight;
            }

            mesh.getWorldPosition(worldPos); 
            // Para GLTF, la altura es desde el suelo (Y=0 del grupo)
            // Para Sprites, es desde el centro (Y=planeHeight/2)
            if (mesh.userData.type === 'gltf-model') {
                 worldPos.y += planeHeight + 0.2; // Encima de la altura total
            } else {
                 worldPos.y += (planeHeight / 2) + 0.2; // Encima del centro
            }
            
            const screenPos = worldPos.clone().project(camera);
            const screenX = (screenPos.x * 0.5 + 0.5) * window.innerWidth;
            const screenY = (screenPos.y * -0.5 + 0.5) * window.innerHeight;
            
            speechBubble.style.left = `${screenX}px`;
            speechBubble.style.top = `${screenY}px`;
            
            if (screenPos.x < -1.1 || screenPos.x > 1.1 || screenPos.y < -1.1 || screenPos.y > 1.1) {
                 speechBubble.className = 'speech-bubble-hidden';
            } else if (speechBubble.className !== 'speech-bubble-visible') {
                 speechBubble.className = 'speech-bubble-visible';
            }
            
        } else {
            hideNpcModal();
        }
    }

    // 4. Actualizar Menú de Interacción
    if (isInteractionMenuOpen && activeInteractionTarget) {
        const targetPos = activeInteractionTarget.position;
        const screenPos = targetPos.clone().project(camera);
        const screenX = (screenPos.x * 0.5 + 0.5) * window.innerWidth;
        const screenY = (screenPos.y * -0.5 + 0.5) * window.innerHeight;

        interactionMenu.style.left = `${screenX}px`;
        interactionMenu.style.top = `${screenY}px`;
        
        if (screenPos.x < -1.1 || screenPos.x > 1.1 || screenPos.y < -1.1 || screenPos.y > 1.1) {
             interactionMenu.className = 'interaction-menu-hidden';
        } else if (interactionMenu.className !== 'interaction-menu-visible') {
             interactionMenu.className = 'interaction-menu-visible';
        }
    }


    // 5. Actualizar Cámara Isométrica
    if (playerMeshes[myPlayerId]) {
        cameraTarget.lerp(playerMeshes[myPlayerId].position, 0.1);
    }
    
    cameraAngle = lerpAngle(cameraAngle, targetCameraAngle, CAMERA_ROTATE_SPEED);

    const newCamX = cameraTarget.x + cameraDistance * Math.cos(cameraAngle);
    const newCamZ = cameraTarget.z + cameraDistance * Math.sin(cameraAngle);
    
    camera.position.set(newCamX, cameraTarget.y + cameraHeight, newCamZ); 
    
    lookAtPoint.copy(cameraTarget);
    lookAtPoint.y += CAMERA_VERTICAL_OFFSET; 
    camera.lookAt(lookAtPoint); 

    // 6. Renderizar
    renderer.render(scene, camera);
}