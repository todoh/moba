// ==================================================
// ### LÓGICA DE RENDERIZADO (renderizado.js) ###
// ==================================================
// Se encarga de dibujar todo en el canvas y gestionar el caché.

import {
    project, currentZoom, currentCameraAngle, isCameraRotating
} from './camera.js';
import { drawGroundTile } from './elements.js';
import { playerTextureURL, playerImgWidth, playerImgHeight, playerSize } from './constantes.js';

// --- Dependencias de estado (se rellenan desde main.js) ---
let deps = {};

// --- Variables del Caché Estático (internas de este módulo) ---
let staticWorldCache;
let cacheCtx;
let isCacheInvalid = true;
let lastCacheAngle = -999;
let lastCacheZoom = -999;
let lastDrawnWorldBounds = null;

// --- Variables de Textura del Jugador (internas) ---
const playerImg = new Image();
let playerImgLoaded = false;

/**
 * Inyecta las dependencias (variables de estado) desde main.js.
 */
export function setRenderizadoDependencies(dependencies) {
    deps = dependencies;
}

/**
 * Inicializa el sistema de renderizado:
 * 1. Crea el canvas de caché.
 * 2. Carga la textura del jugador.
 */
export function initRenderSystem() {
    staticWorldCache = document.createElement('canvas');
    cacheCtx = staticWorldCache.getContext('2d');

    playerImg.onload = () => { playerImgLoaded = true; };
    playerImg.onerror = () => {
        console.error("No se pudo cargar la textura del jugador. Se usará un bloque de color.");
        playerImgLoaded = false;
    }
    playerImg.crossOrigin = "anonymous";
    playerImg.src = playerTextureURL;
}

/**
 * Invalida el caché, forzando un redibujo en el próximo frame.
 */
export function invalidateCache() {
    isCacheInvalid = true;
}

/**
 * Redimensiona el canvas de caché cuando la ventana cambia de tamaño.
 */
export function resizeRenderCache(width, height) {
    if (staticWorldCache) {
        staticWorldCache.width = width;
        staticWorldCache.height = height;
        isCacheInvalid = true;
    }
}

// Función de ayuda para comprobar si los límites han cambiado
function haveBoundsChanged(boundsA, boundsB) {
    if (!boundsA || !boundsB) return true;
    return boundsA.minX !== boundsB.minX || boundsA.maxX !== boundsB.maxX ||
        boundsA.minZ !== boundsB.minZ || boundsA.maxZ !== boundsB.maxZ;
}

/**
 * Dibuja SOLO el suelo PLANO (h <= 1.0) al canvas caché.
 */
function redrawStaticCache(worldBounds) {
    console.log("--- REDIBUJANDO CACHÉ ESTÁTICO (SOLO SUELO PLANO) ---");

    cacheCtx.fillStyle = '#333333';
    cacheCtx.fillRect(0, 0, staticWorldCache.width, staticWorldCache.height);

    if (deps.currentMapData && deps.currentMapData.tileGrid) {
        // Dibuja SÓLO el suelo con altura <= 1.0!
        drawGround(
            cacheCtx,
            deps.GAME_DEFINITIONS.groundTypes,
            currentCameraAngle,
            worldBounds,
            project, // Usamos 'project' de camera.js
            1.0
        );
    }

    isCacheInvalid = false;
    lastCacheAngle = currentCameraAngle;
    lastCacheZoom = currentZoom;
    lastDrawnWorldBounds = worldBounds;
}

/**
 * Dibuja el suelo 3D (para el caché).
 */
function drawGround(ctx, groundTypes, cameraAngle = 0, worldBounds, projectFunc, maxHeightToDraw = 999) {
    if (!deps.currentMapData || !deps.currentMapData.tileGrid) {
        drawGroundGrid(ctx, projectFunc);
        return;
    }

    if (!worldBounds) {
        worldBounds = {
            minX: 0, maxX: deps.currentMapData.width,
            minZ: 0, maxZ: deps.currentMapData.height
        };
    }

    const voidDef = groundTypes['void'] || { color: '#111' };

    const cosA = Math.cos(cameraAngle);
    const sinA = Math.sin(cameraAngle);
    const xDepth = cosA + sinA;
    const zDepth = cosA - sinA;

    const mapMinZ = 0;
    const mapMaxZ = deps.currentMapData.height - 1;
    const mapMinX = 0;
    const mapMaxX = deps.currentMapData.width - 1;

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

            if (z < 0 || z >= deps.currentMapData.height || x < 0 || x >= deps.currentMapData.width) {
                continue;
            }

            const tile = deps.currentMapData.tileGrid[z][x];
            const height = (tile && tile.h !== undefined) ? tile.h : 1.0;
            if (height > maxHeightToDraw) {
                continue; // Saltar este tile, se dibujará en el gameLoop
            }

            const groundDef = (tile && groundTypes[tile.g])
                ? groundTypes[tile.g]
                : voidDef;

            drawGroundTile(ctx, projectFunc, x, z, groundDef, height, currentZoom, cameraAngle);
        }
    }
}

// Dibuja una rejilla si no hay mapa
function drawGroundGrid(ctx, project) {
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
 * Dibuja al jugador.
 */
function drawPlayer(player, screenPos) {
    const scaledImgWidth = playerImgWidth * currentZoom;
    const scaledImgHeight = playerImgHeight * currentZoom;
    const fallbackWidth = 16 * currentZoom;
    const fallbackHeight = 32 * currentZoom;

    if (playerImgLoaded) {
        deps.ctx.drawImage(
            playerImg,
            screenPos.x - scaledImgWidth / 2,
            screenPos.y - scaledImgHeight, // Dibujar hacia arriba desde los pies
            scaledImgWidth,
            scaledImgHeight
        );
    } else {
        deps.ctx.fillStyle = (player.id === deps.myPlayerId) ? '#00FFFF' : '#FF0000';
        deps.ctx.fillRect(
            screenPos.x - fallbackWidth / 2,
            screenPos.y - fallbackHeight,
            fallbackWidth,
            fallbackHeight
        );
    }
    deps.ctx.fillStyle = 'white';
    deps.ctx.textAlign = 'center';
    deps.ctx.font = `${12 * currentZoom}px Inter`;
    deps.ctx.fillText(
        player.id.substring(0, 6),
        screenPos.x,
        screenPos.y - scaledImgHeight - (5 * currentZoom)
    );
}


/**
 * La función principal de renderizado, llamada 60 veces por segundo desde main.js.
 */
export function renderGameLoop(worldBounds, cameraOffset, lastCameraOffsetX, lastCameraOffsetY, getLogicHeightAt) {
    // --- LÓGICA DE CACHÉ ---
    const isRotating = isCameraRotating();
    if (isRotating || isCacheInvalid || haveBoundsChanged(worldBounds, lastDrawnWorldBounds)) {
        redrawStaticCache(worldBounds);
    }
    // --------------------------------

    // 1. Limpiar pantalla principal
    deps.ctx.fillStyle = '#333333';
    deps.ctx.fillRect(0, 0, deps.canvas.width, deps.canvas.height);

    // 2. ¡DIBUJAR EL CACHÉ!
    deps.ctx.drawImage(staticWorldCache, 0, 0);

    // 3. Crear lista de "cosas" a dibujar
    let renderables = [];

    // --- AÑADIR JUGADORES ---
    for (const id in deps.interpolatedPlayersState) {
        const p = deps.interpolatedPlayersState[id];
        if (p.x >= worldBounds.minX && p.x <= worldBounds.maxX &&
            p.z >= worldBounds.minZ && p.z <= worldBounds.maxZ) {
            renderables.push({
                id: p.id,
                type: 'player',
                x: p.x,
                y: p.y - playerSize, // Y del SUELO
                z: p.z
            });
        }
    }

    // --- AÑADIR NPCs ---
    for (const [key, npc] of Object.entries(deps.npcStates)) {
        if (npc.x >= worldBounds.minX && npc.x <= worldBounds.maxX &&
            npc.z >= worldBounds.minZ && npc.z <= worldBounds.maxZ) {
            const elementDef = deps.GAME_DEFINITIONS.elementTypes[npc.id];
            if (elementDef) {
                renderables.push({
                    id: key,
                    type: 'element',
                    definition: elementDef,
                    x: npc.x,
                    y: npc.y - playerSize, // Y del SUELO
                    z: npc.z,
                    isHovered: (deps.hoveredItemKey === key),
                    instance: npc
                });
            }
        }
    }

    // --- AÑADIR SUELO ALTO, BLOQUES Y PORTALES ---
    if (deps.currentMapData && deps.currentMapData.tileGrid) {
        // --- ¡CORRECCIÓN DE BUG VISUAL! ---
        // Los límites del bucle deben usar worldBounds, no el tamaño total del mapa,
        // pero también asegurarse de no salirse del mapa.
        const zStart = Math.max(0, Math.floor(worldBounds.minZ));
        const zEnd = Math.min(deps.currentMapData.height, Math.ceil(worldBounds.maxZ));
        const xStart = Math.max(0, Math.floor(worldBounds.minX));
        
        // --- ¡¡¡ESTA LÍNEA TENÍA EL BUG!!! ---
        // Estaba usando worldBounds.maxZ en lugar de worldBounds.maxX
        const xEnd = Math.min(deps.currentMapData.width, Math.ceil(worldBounds.maxX));
        // --- FIN DE LA CORRECCIÓN ---

        for (let z = zStart; z < zEnd; z++) {
            for (let x = xStart; x < xEnd; x++) {
                if (z < 0 || z >= deps.currentMapData.height || x < 0 || x >= deps.currentMapData.width) continue;

                const tile = deps.currentMapData.tileGrid[z][x];
                if (!tile) continue;

                const height = (tile.h !== undefined) ? tile.h : 1.0;
                const elementId = (typeof tile.e === 'object' && tile.e) ? tile.e.id : tile.e;
                const elementDef = deps.GAME_DEFINITIONS.elementTypes[elementId];

                // 1. Añadir SUELO ALTO
                if (height > 1.0) {
                    const groundDef = deps.GAME_DEFINITIONS.groundTypes[tile.g] || deps.GAME_DEFINITIONS.groundTypes['void'];
                    if (groundDef) {
                        renderables.push({
                            id: `ground_${z}_${x}`,
                            type: 'ground',
                            definition: groundDef,
                            x: x,
                            y: height, // 'y' almacena la altura del acantilado
                            z: z,
                            isHovered: false,
                            instance: null
                        });
                    }
                }

                // 2. Añadir BLOQUES y PORTALES
                if (elementDef && (elementDef.drawType === 'block' || elementDef.drawType === 'portal')) {
                    const baseHeight = getLogicHeightAt(x + 0.5, z + 0.5); // Llama a la función pasada
                    const itemKey = `${elementDef.drawType}_${z}_${x}`;

                    renderables.push({
                        id: itemKey,
                        type: 'element',
                        definition: elementDef,
                        x: x + 0.5,
                        y: baseHeight, // 'y' es la altura del suelo de abajo
                        z: z + 0.5,
                        isHovered: (deps.hoveredItemKey === itemKey),
                        instance: null
                    });
                }
            }
        }
    }


    // 4. Ordenar
    if (deps.currentMapData) {
        const cosA = Math.cos(currentCameraAngle);
        const sinA = Math.sin(currentCameraAngle);

        renderables.sort((a, b) => {
            let a_x = (a.type === 'ground') ? a.x + 0.5 : a.x;
            let a_z = (a.type === 'ground') ? a.z + 0.5 : a.z;
            let b_x = (b.type === 'ground') ? b.x + 0.5 : b.x;
            let b_z = (b.type === 'ground') ? b.z + 0.5 : b.z;

            const depthA = (a_x * cosA - a_z * sinA) + (a_x * sinA + a_z * cosA);
            const depthB = (b_x * cosA - b_z * sinA) + (b_x * sinA + b_z * cosA);

            if (Math.abs(depthA - depthB) < 0.001) {
                let a_y_base = a.y;
                let b_y_base = b.y;

                if (Math.abs(a_y_base - b_y_base) > 0.001) {
                    return a_y_base - b_y_base;
                }

                if (a.type === 'ground' && b.type !== 'ground') {
                    return -1;
                }
                if (a.type !== 'ground' && b.type === 'ground') {
                    return 1;
                }

                return 0;
            }
            return depthA - depthB;
        });
    }

    // 5. Dibujar TODO
    for (const item of renderables) {
        if (item.type === 'player') {
            const screenPos = project(item.x, item.y, item.z);
            drawPlayer(item, screenPos);

        } else if (item.type === 'element') {
            // Dibuja NPCs, Bloques y Portales
            if (item.definition.draw) {
                item.definition.draw(
                    deps.ctx, project, item.definition, currentZoom,
                    item.x,
                    item.y, // 'y' es la Y del suelo
                    item.z,
                    item.isHovered,
                    item.instance,
                    currentCameraAngle
                );
            }
        } else if (item.type === 'ground') {
            // Dibuja el tile de suelo alto
            drawGroundTile(
                deps.ctx,
                project,
                item.x,
                item.z,
                item.definition,
                item.y, // 'y' almacena la altura del acantilado
                currentZoom,
                currentCameraAngle
            );
        }
    }
}


