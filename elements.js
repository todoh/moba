// ==================================================
// ### DEFINICIONES de ELEMENTOS (ELEMENTS.JS) ###
// ==================================================
// ¡MODIFICADO! Carga TODOS los tipos (element, npc, portal)
// y los junta en 'elementTypes' para que el juego los use.

import { ref, get } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { BASE_ISO_TILE_W_HALF, BASE_ISO_TILE_H_HALF } from './camera.js';

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
 * Dibuja un sprite genérico (como un árbol, roca, o NPC).
 * ¡MODIFICADO! Acepta isHovered.
 */
function drawSprite(ctx, definition, zoom, projectedPos, isHovered = false) {
    const img = definition.img; // La imagen ya debería estar asignada
    
    ctx.save(); // --- AÑADIDO

    // --- ¡MODIFICADO! Dibujar un círculo de sombra SIEMPRE ---
    // El radio de interacción se define en main.js (normalmente 0.75)
    const INTERACTION_RADIUS = 0.75; 
    const shadowRadiusX = INTERACTION_RADIUS * (BASE_ISO_TILE_W_HALF * zoom);
    const shadowRadiusY = INTERACTION_RADIUS * (BASE_ISO_TILE_H_HALF * zoom);
    
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)'; // Sombra semitransparente
    ctx.beginPath();
    ctx.ellipse(
        projectedPos.x, // Centro X
        projectedPos.y, // Centro Y (base del sprite)
        shadowRadiusX,  // Radio X (ancho)
        shadowRadiusY,  // Radio Y (alto)
        0, 0, 2 * Math.PI
    );
    ctx.fill();
    // --- Fin de modificación ---
    
    if (isHovered) {
        // --- ¡AÑADIDO! Filtro de iluminación al pasar el cursor ---
        ctx.filter = 'brightness(1.5) drop-shadow(0 0 5px #ffffff)';
    }


    if (!img || !img.complete || img.naturalWidth === 0) {
        // Fallback si la imagen no se ha cargado
        const size = 16 * zoom;
        ctx.fillStyle = definition.color || '#FF00FF'; // Usar color de la def o fucsia
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
    
    ctx.restore(); // --- AÑADIDO
}

/**
 * Dibuja un portal.
 * ¡MODIFICADO! Acepta isHovered.
 */
function drawPortal(ctx, definition, zoom, projectedPos, isHovered = false) {
    const fontSize = (definition.baseWidth || 20) * zoom;
    const symbol = definition.symbol || '🌀'; // Usa el símbolo de la definición

    ctx.save(); // --- AÑADIDO
    
    // --- ¡MODIFICADO! Dibujar un círculo de sombra SIEMPRE ---
    // El radio de interacción se define en main.js (normalmente 0.75)
    const INTERACTION_RADIUS = 0.75; 
    const shadowRadiusX = INTERACTION_RADIUS * (BASE_ISO_TILE_W_HALF * zoom);
    const shadowRadiusY = INTERACTION_RADIUS * (BASE_ISO_TILE_H_HALF * zoom);
    
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)'; // Sombra semitransparente
    ctx.beginPath();
    ctx.ellipse(
        projectedPos.x, // Centro X
        projectedPos.y, // Centro Y (base del sprite)
        shadowRadiusX,  // Radio X (ancho)
        shadowRadiusY,  // Radio Y (alto)
        0, 0, 2 * Math.PI
    );
    ctx.fill();
    // --- Fin de modificación ---

    if (isHovered) {
        // --- ¡AÑADIDO! Filtro de iluminación al pasar el cursor ---
        ctx.filter = 'brightness(1.5) drop-shadow(0 0 5px #ffffff)';
    }

    ctx.font = `${fontSize}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(symbol, projectedPos.x, projectedPos.y - fontSize * 0.5);
    
    ctx.restore(); // --- AÑADIDO
}

/**
 * No dibuja nada (para 'none').
 * ¡MODIFICADO! Acepta isHovered.
 */
function drawNone(ctx, definition, zoom, projectedPos, isHovered = false) {
    // No hacer nada
}

// Mapeo de "tipos de dibujo" (strings) a funciones
const DRAW_FUNCTIONS = {
    'sprite': drawSprite,
    'portal': drawPortal,
    'none': drawNone
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

    const allElementTypes = { ...elementTypes, ...npcTypes, ...portalTypes };


    // --- Procesar Ground Types ---
    // Cargar sus imágenes (texturas de suelo)
    for (const key in groundTypes) {
        const def = groundTypes[key];
        def.img = getImage(def.imgSrc); // Asignar la imagen (cargando)
    }
    
    // Añadir 'void' si no existe (esencial)
    if (!groundTypes['void']) {
        groundTypes['void'] = { id: 'void', color: '#111', passable: false, img: null };
    }

    // --- Procesar TODOS los Element Types ---
    // Cargar sus imágenes y asignarles su función de DIBUJO
    for (const key in allElementTypes) {
        const def = allElementTypes[key];
        def.img = getImage(def.imgSrc); // Asignar la imagen (cargando)
        
        // Asignar la función de dibujo correcta
   // ==================================================
// ### CÓDIGO CORREGIDO v2 (para elements.js) ###
// ==================================================

        // --- 1. Asignar el TIPO LÓGICO ---
        if (key === 'none') {
            def.drawType = 'none';
        } else if (portalTypes[key]) {
            def.drawType = 'portal'; // <-- TODOS los portales son 'portal'
        } else {
            def.drawType = 'sprite'; // (NPCs y Elementos)
        }

        // --- 2. Asignar la FUNCIÓN DE DIBUJO ---
        if (def.drawType === 'portal' && !def.imgSrc) {
            // Portal SIN imagen (usa símbolo de texto)
            def.draw = DRAW_FUNCTIONS['portal']; 
        } else if (def.drawType === 'none') {
            // 'none'
            def.draw = DRAW_FUNCTIONS['none'];
        } else {
            // Un Sprite (NPC, Elemento, o un Portal CON imagen)
            def.draw = DRAW_FUNCTIONS['sprite'];
        }
    }
    
    // Añadir 'none' si no existe (esencial)
    if (!allElementTypes['none']) {
        allElementTypes['none'] = { id: 'none', passable: true, draw: drawNone, drawType: 'none' };
    }

    console.log("Definiciones cargadas y procesadas:", { groundTypes, elementTypes: allElementTypes });
    
    // Devuelve los tipos de suelo y el objeto fusionado de elementos
    return { groundTypes, elementTypes: allElementTypes };
}


/**
 * Dibuja un polígono isométrico para una casilla de suelo.
 * (Esta función no cambia, pero se exporta para que main.js la use)
 * @param {CanvasRenderingContext2D} ctx
 * @param {function} project - La función de proyección
 * @param {number} x - Coordenada X del mundo
 * @param {number} z - Coordenada Z del mundo
 * @param {object} groundDef - La definición del suelo (¡AHORA VIENE DE FIREBASE!)
 * @param {number} zoom - El nivel de zoom actual
 */
export function drawGroundTile(ctx, project, x, z, groundDef, zoom) {
    
    const tileW = BASE_ISO_TILE_W_HALF * zoom;
    const tileH = BASE_ISO_TILE_H_HALF * zoom;
    const p1 = project(x, 0, z); // Esquina superior

    const img = groundDef.img;
    
    // Usar textura si está cargada
    if (img && img.complete && img.naturalWidth > 0) {
        const a = tileW;  
        const b = tileH;
        const c = -tileW; 
        const d = tileH;
        const e = p1.x;   
        const f = p1.y;

        ctx.save();
        ctx.setTransform(a, b, c, d, e, f);
        ctx.drawImage(img, 0, 0, 1, 1);
        ctx.restore();
    } else {
        // Fallback: Dibujar el color sólido
        const p2 = project(x + 1, 0, z);
        const p3 = project(x + 1, 0, z + 1);
        const p4 = project(x, 0, z + 1);

        ctx.fillStyle = groundDef.color || '#FF00FF'; // Color de def o fucsia
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.lineTo(p3.x, p3.y);
        ctx.lineTo(p4.x, p4.y);
        ctx.closePath();
        ctx.fill();
    }
}

