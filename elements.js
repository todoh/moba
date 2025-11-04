// ==================================================
// ### DEFINICIONES de ELEMENTOS (ELEMENTS.JS) ###
// ==================================================
// ¡Refactorizado! Este archivo ahora SÓLO carga datos, no dibuja.

import { ref, get } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

// ¡ELIMINADO! El caché de texturas 2D y las funciones de dibujo.
// main.js se encargará de cargar texturas de Three.js.


/**
 * Carga TODAS las definiciones de juego (terrenos y elementos) desde Firebase.
 * ¡MODIFICADO! Ya no asigna funciones de dibujo.
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
    
    // Fusionar todos los tipos de "elementos" en uno solo
    const elementTypes = data.elementTypes || {};
    const npcTypes = data.npcTypes || {};
    const portalTypes = data.portalTypes || {};
    const blockTypes = data.blockTypes || {}; 

    const allElementTypes = { ...elementTypes, ...npcTypes, ...portalTypes, ...blockTypes }; 


    // --- Procesar Ground Types ---
    if (!groundTypes['void']) {
        groundTypes['void'] = { id: 'void', color: '#111', passable: false, imgSrcTop: null };
    }
    // (No es necesario cargar texturas aquí, main.js lo hará)

    // --- Procesar TODOS los Element Types ---
    for (const key in allElementTypes) {
        const def = allElementTypes[key];

        // --- Asignar el TIPO LÓGICO ---
        // Esto sigue siendo útil para que la lógica sepa qué es qué
        if (key === 'none') {
            def.drawType = 'none';
        } else if (portalTypes[key]) {
            def.drawType = 'portal';
        } else if (blockTypes[key]) { 
             def.drawType = 'block';
        } else if (npcTypes[key]) { // Diferenciar NPCs
            def.drawType = 'npc';
        } else {
            def.drawType = 'sprite'; // (Elementos estáticos como árboles, rocas)
        }
        
        // --- ¡ELIMINADO! ---
        // Toda la lógica de def.img = getImage(...)
        // Toda la lógica de def.draw = DRAW_FUNCTIONS[...]
    }
    
    if (!allElementTypes['none']) {
        allElementTypes['none'] = { id: 'none', passable: true, drawType: 'none' };
    }

    console.log("Definiciones de datos cargadas:", { groundTypes, elementTypes: allElementTypes });
    
    // Devuelve los datos puros. main.js decidirá cómo renderizarlos.
    return { groundTypes, elementTypes: allElementTypes };
}

// ¡ELIMINADO!
// drawGroundTile
// shadeColor
// drawIsometricCube
// drawTexturePolygon
// drawSprite
// drawPortal
// drawBlock
// drawNone
// const DRAW_FUNCTIONS
