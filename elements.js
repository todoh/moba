// ==================================================
// ### DEFINICIONES de ELEMENTOS (ELEMENTS.JS) ###
// ==================================================
// ¡Refactorizado! Este archivo ahora SÓLO carga datos, no dibuja.
// ¡MODIFICADO! para cargar la nueva estructura de (ground, block, portal, entity)

import { ref, get } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

/**
 * Carga TODAS las definiciones de juego (terrenos y elementos) desde Firebase.
 * ¡MODIFICADO! Carga la nueva estructura de 4 tipos.
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
    
    // --- ¡CORRECCIÓN! LÓGICA DE FUSIÓN COMPLETA ---
    // Cargamos los 3 tipos de "elementos"
    const blockTypes = data.blockTypes || {}; 
    const portalTypes = data.portalTypes || {};
    
    // --- ¡AQUÍ ESTÁ LA CORRECCIÓN! ---
    // Cargar las definiciones del editor NUEVO
    const entityTypes = data.entityTypes || {}; 
    // Cargar las definiciones del editor ANTIGUO
    const oldElementTypes = data.elementTypes || {};
    const oldNpcTypes = data.npcTypes || {};

    // Fusionar todos en un solo objeto 'elementTypes'
    // El orden importa: las nuevas 'entityTypes' deben ir al final
    // para sobrescribir las antiguas si tienen el mismo ID.
    const allElementTypes = { 
        ...blockTypes, 
        ...portalTypes, 
        ...oldElementTypes, // Cargar antiguas
        ...oldNpcTypes,      // Cargar antiguas
        ...entityTypes       // Cargar nuevas (sobrescribe antiguas)
    }; 
    // ----------------------------------

    // --- Procesar Ground Types ---
    if (!groundTypes['void']) {
        groundTypes['void'] = { id: 'void', color: '#111', passable: false, imgSrcTop: null };
    }
    // (No es necesario cargar texturas aquí, main.js lo hará)

    // --- Procesar TODOS los Element Types ---
    for (const key in allElementTypes) {
        const def = allElementTypes[key];

        // --- Asignar el TIPO LÓGICO ---
        // (Esto ya viene en la definición desde e-entidades.js, 
        // pero lo re-aseguramos por si faltan datos antiguos)
        if (!def.drawType) {
            if (blockTypes[key]) { 
                 def.drawType = 'block';
            } else if (portalTypes[key]) {
                def.drawType = 'portal';
            } else if (entityTypes[key] || oldElementTypes[key] || oldNpcTypes[key]) {
                 // Si es cualquier tipo de entidad/elemento/npc y tiene imagen, es un sprite
                 def.drawType = (def.imgSrc) ? 'sprite' : 'none'; 
            }
        if (!def.renderStyle) {
            if (def.drawType === 'sprite') {
                // Por defecto, los sprites antiguos (árboles, etc.) serán 'cross'
                def.renderStyle = 'cross';
            }
        }}
    }
    
    // Asegurar que 'none' (que ahora es una 'entity') exista
    if (!allElementTypes['none']) {
        allElementTypes['none'] = { 
            id: 'none', 
            passable: true, 
            drawType: 'none', 
            interactions: [] 
        };
    }

    console.log("Definiciones de datos cargadas:", { groundTypes, elementTypes: allElementTypes });
    
    // Devuelve los datos puros. main.js decidirá cómo renderizarlos.
    return { groundTypes, elementTypes: allElementTypes };
}