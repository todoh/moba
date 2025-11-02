// ==================================================
// ### DEFINICIONES de ELEMENTOS (ELEMENTS.JS) ###
// ==================================================

import { ref, get } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
// ¡MODIFICADO! Importar 'project'
import { BASE_ISO_TILE_W_HALF, BASE_ISO_TILE_H_HALF, project } from './camera.js';

// Un caché para las texturas cargadas
const textureCache = new Map();

/**
 * Carga una imagen y la guarda en caché.
 * @param {string} src - La URL de la imagen (ej: 'tree_01.png')
 * @returns {Image} - El objeto de imagen (puede estar cargando)
 */
function getImage(src) {
    if (!src) return null;
    if (textureCache.has(src)) {
        return textureCache.get(src);
    }
    const img = new Image();
    img.onload = () => {
        console.log(`Textura cargada: ${src}`);
        textureCache.set(src, img); // Guardar en caché al cargar
    };
    img.onerror = () => {
        console.error(`No se pudo cargar la textura: ${src}`);
        textureCache.set(src, null); // Marcar como fallida
    };
    img.src = src;
    return img;
}


// --- LÓGICA DE DIBUJO ---
// Estas son las funciones de dibujo que asignaremos
// a las definiciones cargadas de Firebase.

/**
 * ¡NUEVO! Dibuja un polígono con textura.
 * (p1 = origen, p2 = eje u, p4 = eje v)
 */
function drawTexturePolygon(ctx, img, p1, p2, p3, p4, fallbackColor = '#FF00FF') {
    if (img && img.complete && img.naturalWidth > 0) {
        // p1 = Origen (0,0)
        // p2 = Punto final del eje U (1,0)
        // p4 = Punto final del eje V (0,1)
        const a = p2.x - p1.x; // u-vector x
        const b = p2.y - p1.y; // u-vector y
        const c = p4.x - p1.x; // v-vector x
        const d = p4.y - p1.y; // v-vector y
        const e = p1.x;       // origen x
        const f = p1.y;       // origen y

        ctx.save();
        ctx.setTransform(a, b, c, d, e, f);
        ctx.drawImage(img, 0, 0, 1, 1);
        ctx.restore();
    } else {
        // Fallback: Dibujar el color sólido
        ctx.fillStyle = fallbackColor;
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.lineTo(p3.x, p3.y);
        ctx.lineTo(p4.x, p4.y);
        ctx.closePath();
        ctx.fill();
    }
}


/**
 * Dibuja un sprite genérico (como un árbol, roca, o NPC).
 * ¡MODIFICADO! Nueva firma de función.
 */
function drawSprite(ctx, project, definition, zoom, worldX, worldY, worldZ, isHovered = false, instanceData = null) {
    const projectedPos = project(worldX, worldY, worldZ); // Proyectar aquí
    const img = definition.img; 
    
    ctx.save(); 

    // Dibujar un círculo de sombra
    const INTERACTION_RADIUS = 0.75; 
    const shadowRadiusX = INTERACTION_RADIUS * (BASE_ISO_TILE_W_HALF * zoom);
    const shadowRadiusY = INTERACTION_RADIUS * (BASE_ISO_TILE_H_HALF * zoom);
    
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)'; 
    ctx.beginPath();
    ctx.ellipse(
        projectedPos.x, 
        projectedPos.y, 
        shadowRadiusX,  
        shadowRadiusY,  
        0, 0, 2 * Math.PI
    );
    ctx.fill();
    
    if (isHovered) {
        ctx.filter = 'brightness(1.5) drop-shadow(0 0 5px #ffffff)';
    }

    if (!img || !img.complete || img.naturalWidth === 0) {
        // Fallback
        const size = 16 * zoom;
        ctx.fillStyle = definition.color || '#FF00FF';
        ctx.fillRect(projectedPos.x - size / 2, projectedPos.y - size, size, size);
    } else {
        const baseWidth = definition.baseWidth || img.naturalWidth;
        const baseHeight = definition.baseHeight || img.naturalHeight;
        
        const scaledWidth = baseWidth * zoom;
        const scaledHeight = baseHeight * zoom;

        ctx.drawImage(
            img,
            projectedPos.x - scaledWidth / 2, 
            projectedPos.y - scaledHeight,
            scaledWidth,
            scaledHeight
        );
    }
    
    ctx.restore(); 
}

/**
 * Dibuja un portal.
 * ¡MODIFICADO! Nueva firma de función.
 */
function drawPortal(ctx, project, definition, zoom, worldX, worldY, worldZ, isHovered = false, instanceData = null) {
    const projectedPos = project(worldX, worldY, worldZ); // Proyectar aquí
    const fontSize = (definition.baseWidth || 20) * zoom;
    const symbol = definition.symbol || '🌀'; 

    ctx.save(); 
    
    // Dibujar un círculo de sombra
    const INTERACTION_RADIUS = 0.75; 
    const shadowRadiusX = INTERACTION_RADIUS * (BASE_ISO_TILE_W_HALF * zoom);
    const shadowRadiusY = INTERACTION_RADIUS * (BASE_ISO_TILE_H_HALF * zoom);
    
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)'; 
    ctx.beginPath();
    ctx.ellipse(
        projectedPos.x, 
        projectedPos.y, 
        shadowRadiusX,  
        shadowRadiusY,  
        0, 0, 2 * Math.PI
    );
    ctx.fill();

    if (isHovered) {
        ctx.filter = 'brightness(1.5) drop-shadow(0 0 5px #ffffff)';
    }

    ctx.font = `${fontSize}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(symbol, projectedPos.x, projectedPos.y - fontSize * 0.5);
    
    ctx.restore(); 
}

/**
 * ¡NUEVO! Dibuja un bloque 3D.
 */
function drawBlock(ctx, project, definition, zoom, worldX, worldY, worldZ, isHovered = false, instanceData = null) {
    // worldX/Z son el *centro* (ej: 10.5, 5.5). Restamos 0.5 para obtener la esquina.
    const x = worldX - 0.5;
    const z = worldZ - 0.5;
    
    // Obtener la altura de la instancia (del editor), con fallback a 1.0
const height = (definition && definition.height) ? parseFloat(definition.height) : 1.0;    
    const y_base = 0;
    const y_top = height;

    // Obtener las texturas
    const imgTop = definition.imgTop;
    const imgLeft = definition.imgLeft;
    const imgRight = definition.imgRight;

    // Calcular los 8 vértices del cubo
    // Base
    const p_base_front = project(x, y_base, z);
    const p_base_right = project(x + 1, y_base, z);
    const p_base_back = project(x + 1, y_base, z + 1);
    const p_base_left = project(x, y_base, z + 1);
    // Techo
    const p_top_front = project(x, y_top, z);
    const p_top_right = project(x + 1, y_top, z);
    const p_top_back = project(x + 1, y_top, z + 1);
    const p_top_left = project(x, y_top, z + 1);

    ctx.save();
    if (isHovered) {
        ctx.filter = 'brightness(1.3) drop-shadow(0 0 5px #ffffff)';
    }

    // Dibujar las caras (de atrás para adelante)
    
    // Cara Derecha (+X)
    // Vértices: (x+1, 0, z), (x+1, Y, z), (x+1, Y, z+1), (x+1, 0, z+1)
    // p1=p_base_right, p2=p_top_right, p3=p_top_back, p4=p_base_back
    drawTexturePolygon(ctx, imgRight, p_base_right, p_top_right, p_top_back, p_base_back, '#999999');

    // Cara Izquierda (+Z)
    // Vértices: (x, 0, z+1), (x, Y, z+1), (x+1, Y, z+1), (x+1, 0, z+1)
    // p1=p_base_left, p2=p_top_left, p3=p_top_back, p4=p_base_back
    drawTexturePolygon(ctx, imgLeft, p_base_left, p_top_left, p_top_back, p_base_back, '#777777');
    
    // Cara Superior (Techo)
    // Vértices: (x, Y, z), (x+1, Y, z), (x+1, Y, z+1), (x, Y, z+1)
    // p1=p_top_front, p2=p_top_right, p3=p_top_back, p4=p_top_left
    drawTexturePolygon(ctx, imgTop, p_top_front, p_top_right, p_top_back, p_top_left, '#BBBBBB');
    
    ctx.restore();
}


/**
 * No dibuja nada (para 'none').
 * ¡MODIFICADO! Nueva firma de función.
 */
function drawNone(ctx, project, definition, zoom, worldX, worldY, worldZ, isHovered = false, instanceData = null) {
    // No hacer nada
}

// Mapeo de "tipos de dibujo" (strings) a funciones
const DRAW_FUNCTIONS = {
    'sprite': drawSprite,
    'portal': drawPortal,
    'none': drawNone,
    'block': drawBlock // ¡NUEVO!
};


/**
 * Carga TODAS las definiciones de juego (terrenos y elementos) desde Firebase.
 * @param {Database} db - La instancia de Firebase Database.
 * @returns {Promise<object>} - Una promesa que resuelve a { groundTypes, elementTypes }
 */
export async function loadGameDefinitions(db) {
    console.log("Cargando definiciones del juego desde Firebase...");
    const definitionsRef = ref(db, 'moba-demo-definitions');
    const snapshot = await get(definitionsRef);
    
    if (!snapshot.exists()) {
        console.error("¡ERROR! No se encontraron definiciones en 'moba-demo-definitions'.");
        alert("Error crítico: No se pudieron cargar las definiciones del juego. ¿Están guardadas en el editor?");
        return { groundTypes: {}, elementTypes: {} };
    }

    const data = snapshot.val();
    const groundTypes = data.groundTypes || {};
    
    // ¡NUEVO! Fusionar todos los tipos de "elementos" en uno solo para el juego.
    const elementTypes = data.elementTypes || {};
    const npcTypes = data.npcTypes || {};
    const portalTypes = data.portalTypes || {};
    const blockTypes = data.blockTypes || {}; // ¡NUEVO!

    const allElementTypes = { ...elementTypes, ...npcTypes, ...portalTypes, ...blockTypes }; // ¡NUEVO!


    // --- Procesar Ground Types ---
    for (const key in groundTypes) {
        const def = groundTypes[key];
        def.img = getImage(def.imgSrc); // Asignar la imagen (cargando)
    }
    
    if (!groundTypes['void']) {
        groundTypes['void'] = { id: 'void', color: '#111', passable: false, img: null };
    }

    // --- Procesar TODOS los Element Types ---
    for (const key in allElementTypes) {
        const def = allElementTypes[key];
        
        // ¡MODIFICADO! Cargar imágenes según el tipo
        if (blockTypes[key]) {
            // Es un bloque, cargar sus 3 texturas
            def.imgTop = getImage(def.imgSrcTop);
            def.imgLeft = getImage(def.imgSrcLeft);
            def.imgRight = getImage(def.imgSrcRight);
            def.img = null; // Los bloques no usan la 'img' genérica
        } else {
            // Es un sprite, npc, o portal con imagen
            def.img = getImage(def.imgSrc); 
        }

        // --- 1. Asignar el TIPO LÓGICO ---
        if (key === 'none') {
            def.drawType = 'none';
        } else if (portalTypes[key]) {
            def.drawType = 'portal';
        } else if (blockTypes[key]) { // ¡NUEVO!
             def.drawType = 'block';
        } else {
            def.drawType = 'sprite'; // (NPCs y Elementos)
        }

        // --- 2. Asignar la FUNCIÓN DE DIBUJO ---
        if (def.drawType === 'portal' && !def.imgSrc) {
            def.draw = DRAW_FUNCTIONS['portal']; 
        } else if (def.drawType === 'none') {
            def.draw = DRAW_FUNCTIONS['none'];
        } else if (def.drawType === 'block') { // ¡NUEVO!
            def.draw = DRAW_FUNCTIONS['block'];
        } else {
            // Un Sprite (NPC, Elemento, o un Portal CON imagen)
            def.draw = DRAW_FUNCTIONS['sprite'];
        }
    }
    
    if (!allElementTypes['none']) {
        allElementTypes['none'] = { id: 'none', passable: true, draw: drawNone, drawType: 'none' };
    }

    console.log("Definiciones cargadas y procesadas:", { groundTypes, elementTypes: allElementTypes });
    
    return { groundTypes, elementTypes: allElementTypes };
}


/**
 * Dibuja un polígono isométrico para una casilla de suelo.
 */
export function drawGroundTile(ctx, project, x, z, groundDef, zoom) {
    
    const p1 = project(x, 0, z); // Esquina superior
    const p2 = project(x + 1, 0, z);
    const p3 = project(x + 1, 0, z + 1);
    const p4 = project(x, 0, z + 1);
    
    const img = groundDef.img;
    
    // Usar la función helper de textura
    drawTexturePolygon(ctx, img, p1, p2, p3, p4, groundDef.color || '#FF00FF');
}