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
 * Dibuja un polígono con textura.
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
 * ¡MODIFICADO! 'worldY' es ahora la altura del suelo.
 */
function drawSprite(ctx, project, definition, zoom, worldX, worldY, worldZ, isHovered = false, instanceData = null, cameraAngle = 0) {     
    const img = definition.img; 
    
    ctx.save(); 

    // Dibujar un círculo de sombra EN LA BASE (Y=worldY)
    const INTERACTION_RADIUS = 0.75; 
    const shadowRadiusX = INTERACTION_RADIUS * (BASE_ISO_TILE_W_HALF * zoom);
    const shadowRadiusY = INTERACTION_RADIUS * (BASE_ISO_TILE_H_HALF * zoom);
    
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)'; 
    ctx.beginPath();
    ctx.ellipse(
        projectedPos.x, 
        projectedPos.y, // La 'y' proyectada ya incluye la altura del suelo
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
            projectedPos.y - scaledHeight, // Dibujar hacia arriba desde los pies
            scaledWidth,
            scaledHeight
        );
    }
    
    ctx.restore(); 
}

/**
 * Dibuja un portal.
 * ¡MODIFICADO! 'worldY' es ahora la altura del suelo.
 */
function drawPortal(ctx, project, definition, zoom, worldX, worldY, worldZ, isHovered = false, instanceData = null, cameraAngle = 0) {  
      const projectedPos = project(worldX, worldY, worldZ); // Proyectar en la altura del suelo
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

function drawBlock(ctx, project, definition, zoom, worldX, worldY, worldZ, isHovered = false, instanceData = null, cameraAngle = 0) {
    // worldX/Z son el *centro* (ej: 10.5, 5.5). Restamos 0.5 para obtener la esquina.
    const x = worldX - 0.5;
    const z = worldZ - 0.5;
    
    // Obtener la altura de la definición, con fallback a 1.0
    const height = (definition && definition.height) ? parseFloat(definition.height) : 1.0;    
    
    // La base es la altura del suelo, el techo es base + altura del bloque.
    const y_base = worldY; 
    const y_top = worldY + height;

    // Obtener las texturas
    const imgTop = definition.imgTop;
    const imgSideX = definition.imgRight; // Usaremos esta para +X y -X
    const imgSideZ = definition.imgLeft;  // Usaremos esta para +Z y -Z
    const fallbackColor = definition.color || '#999999';

    ctx.save();
    if (isHovered) {
        ctx.filter = 'brightness(1.3) drop-shadow(0 0 5px #ffffff)';
    }

    // ¡Llamar a la nueva función!
    drawIsometricCube(
        ctx, project, x, z, y_base, y_top, zoom,
        imgTop, imgSideX, imgSideZ,
        cameraAngle, fallbackColor
    );
    
    ctx.restore();
}


/**
 * No dibuja nada (para 'none').
 */
function drawNone(ctx, project, definition, zoom, worldX, worldY, worldZ, isHovered = false, instanceData = null, cameraAngle = 0) {    // No hacer nada
}

// Mapeo de "tipos de dibujo" (strings) a funciones
const DRAW_FUNCTIONS = {
    'sprite': drawSprite,
    'portal': drawPortal,
    'none': drawNone,
    'block': drawBlock 
};


/**
 * Carga TODAS las definiciones de juego (terrenos y elementos) desde Firebase.
 * ¡MODIFICADO! Carga texturas 3D para 'groundTypes'.
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
    const blockTypes = data.blockTypes || {}; 

    const allElementTypes = { ...elementTypes, ...npcTypes, ...portalTypes, ...blockTypes }; 


    // --- Procesar Ground Types ---
    for (const key in groundTypes) {
        const def = groundTypes[key];
        // ¡MODIFICADO! Cargar texturas 3D para el suelo
        def.imgTop = getImage(def.imgSrcTop);
        def.imgLeft = getImage(def.imgSrcLeft);
        def.imgRight = getImage(def.imgSrcRight);
        def.img = null; // Ya no usamos la imagen plana genérica
    }
    
    if (!groundTypes['void']) {
        groundTypes['void'] = { id: 'void', color: '#111', passable: false, img: null };
    }

    // --- Procesar TODOS los Element Types ---
    for (const key in allElementTypes) {
        const def = allElementTypes[key];
        
        if (blockTypes[key]) {
            // Es un bloque, cargar sus 3 texturas
            def.imgTop = getImage(def.imgSrcTop);
            def.imgLeft = getImage(def.imgSrcLeft);
            def.imgRight = getImage(def.imgSrcRight);
            def.img = null; 
        } else {
            // Es un sprite, npc, o portal con imagen
            def.img = getImage(def.imgSrc); 
        }

        // --- 1. Asignar el TIPO LÓGICO ---
        if (key === 'none') {
            def.drawType = 'none';
        } else if (portalTypes[key]) {
            def.drawType = 'portal';
        } else if (blockTypes[key]) { 
             def.drawType = 'block';
        } else {
            def.drawType = 'sprite'; // (NPCs y Elementos)
        }

        // --- 2. Asignar la FUNCIÓN DE DIBUJO ---
        if (def.drawType === 'portal' && !def.imgSrc) {
            def.draw = DRAW_FUNCTIONS['portal']; 
        } else if (def.drawType === 'none') {
            def.draw = DRAW_FUNCTIONS['none'];
        } else if (def.drawType === 'block') { 
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
 * ¡MODIFICADO! Dibuja un polígono isométrico para una casilla de suelo.
 * Ahora usa altura y renderiza 3 caras, como un bloque.
 */
export function drawGroundTile(ctx, project, x, z, groundDef, height, zoom, cameraAngle = 0) { // <-- ¡MODIFICADO!
    
    // Si la altura es 0 o menos, no dibujar nada.
    if (height <= 0) return;

    // Obtener las texturas
    const imgTop = groundDef.imgTop;
    const imgSideX = groundDef.imgRight; // Usaremos esta para +X y -X
    const imgSideZ = groundDef.imgLeft;  // Usaremos esta para +Z y -Z
    const fallbackColor = groundDef.color || '#FF00FF';

    // Definir la base (siempre en Y=0) y el techo (en la altura del tile)
    const y_base = 0;
    const y_top = height;

    // ¡Llamar a la nueva función!
    drawIsometricCube(
        ctx, project, x, z, y_base, y_top, zoom,
        imgTop, imgSideX, imgSideZ,
        cameraAngle, fallbackColor
    );
}
function shadeColor(color, percent) {
    // Manejar colores no válidos
    if (!color || color[0] !== '#' || (color.length !== 7 && color.length !== 4)) {
        return color; 
    }
    
    let R, G, B;

    // Manejar hex corto (#F03)
    if (color.length === 4) {
        R = parseInt(color[1] + color[1], 16);
        G = parseInt(color[2] + color[2], 16);
        B = parseInt(color[3] + color[3], 16);
    } else { // Manejar hex largo (#FF0033)
        R = parseInt(color.substring(1, 3), 16);
        G = parseInt(color.substring(3, 5), 16);
        B = parseInt(color.substring(5, 7), 16);
    }

    R = Math.floor(R * (1 + percent));
    G = Math.floor(G * (1 + percent));
    B = Math.floor(B * (1 + percent));

    R = Math.min(255, Math.max(0, R));
    G = Math.min(255, Math.max(0, G));
    B = Math.min(255, Math.max(0, B));

    const RR = R.toString(16).padStart(2, '0');
    const GG = G.toString(16).padStart(2, '0');
    const BB = B.toString(16).padStart(2, '0');

    return `#${RR}${GG}${BB}`;
}


/**
 * ¡NUEVO!
 * Dibuja un cubo isométrico con culling de caras traseras.
 * Esta función dibujará las 3 caras visibles correctas (2 laterales, 1 superior)
 * para cualquier ángulo de rotación.
 */
function drawIsometricCube(ctx, project, x, z, y_base, y_top, zoom, 
                           imgTop, imgSideX, imgSideZ, 
                           cameraAngle, fallbackColor) {

    // Calcular cos y sin del ángulo
    const cosA = Math.cos(cameraAngle);
    const sinA = Math.sin(cameraAngle);

    // 1. Determinar visibilidad de las caras
    // (Basado en la dirección del vector de profundidad que calculamos en main.js)
    const seeFacePlusX = (cosA + sinA) > 0;
    const seeFacePlusZ = (cosA - sinA) > 0;

    // 2. Calcular los 8 vértices
    // Base
    const p_base_00 = project(x,     y_base, z);     // Vértice (x, z)
    const p_base_10 = project(x + 1, y_base, z);     // Vértice (x+1, z)
    const p_base_11 = project(x + 1, y_base, z + 1); // Vértice (x+1, z+1)
    const p_base_01 = project(x,     y_base, z + 1); // Vértice (x, z+1)
    // Techo
    const p_top_00 = project(x,     y_top, z);
    const p_top_10 = project(x + 1, y_top, z);
    const p_top_11 = project(x + 1, y_top, z + 1);
    const p_top_01 = project(x,     y_top, z + 1);
    
    // 3. Definir colores de fallback (para dar sombra)
    const fallbackColorX = fallbackColor;
    const fallbackColorZ = shadeColor(fallbackColor, -0.2); // Cara Z 20% más oscura

    // 4. Dibujar caras de atrás para adelante
    
    // Caras TRASERAS (las que NO se ven)
    if (!seeFacePlusX) { 
        // Cara -X (usa la misma textura que +X)
        drawTexturePolygon(ctx, imgSideX, p_base_00, p_top_00, p_top_01, p_base_01, fallbackColorX);
    }
    if (!seeFacePlusZ) {
        // Cara -Z (usa la misma textura que +Z)
        drawTexturePolygon(ctx, imgSideZ, p_base_00, p_top_00, p_top_10, p_base_10, fallbackColorZ);
    }

    // Caras DELANTERAS (las que SÍ se ven)
    if (seeFacePlusX) { 
        // Cara +X
        drawTexturePolygon(ctx, imgSideX, p_base_10, p_top_10, p_top_11, p_base_11, fallbackColorX);
    }
    if (seeFacePlusZ) {
        // Cara +Z
        drawTexturePolygon(ctx, imgSideZ, p_base_01, p_top_01, p_top_11, p_base_11, fallbackColorZ);
    }

    // Cara SUPERIOR (siempre se ve)
    drawTexturePolygon(ctx, imgTop, p_top_00, p_top_10, p_top_11, p_top_01, fallbackColor);
}