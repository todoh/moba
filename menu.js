// ==================================================
// ### MÓDULO DE MENÚ (menu.js) ###
// ==================================================

import { update } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

// --- Dependencias (se inyectarán) ---
let db;
let myPlayerRef;
let myPlayerId;

// --- Variables de Estado y DOM ---
let menuModal;
let playerNameInput;
let healthStat;
let energyStat;
let moneyStat;
let avatarImg;
let saveNameBtn;
let isMenuOpen = false;

/**
 * Inyecta las dependencias de Firebase
 * @param {object} database - Instancia de la BD de Firebase
 * @param {object} playerRef - Referencia al nodo del jugador (ej. /moba-demo-players-3d/PLAYER_ID)
 * @param {string} playerId - El UID del jugador actual
 */
export function initMenu(database, playerRef, playerId) {
    db = database;
    myPlayerRef = playerRef;
    myPlayerId = playerId; // Guardar el ID
    createMenuHTML();
    
    // Asignar listeners
    menuModal = document.getElementById('player-menu-modal');
    playerNameInput = document.getElementById('menu-player-name-input');
    healthStat = document.getElementById('menu-stat-health');
    energyStat = document.getElementById('menu-stat-energy');
    moneyStat = document.getElementById('menu-stat-money');
    avatarImg = document.getElementById('menu-avatar-img');
    saveNameBtn = document.getElementById('menu-save-name-btn');

    // Listener para cerrar al clicar fuera
    menuModal.addEventListener('click', (event) => {
        if (event.target === menuModal) {
            closeMenu();
        }
    });
    
    // Listener para guardar nombre
    saveNameBtn.addEventListener('click', savePlayerName);
}

/**
 * Crea e inyecta el HTML y CSS del menú en el body
 */
function createMenuHTML() {
    // --- 1. Inyectar CSS ---
    const style = document.createElement('style');
    style.textContent = `
        #player-menu-modal {
            display: none; /* Oculto por defecto */
            position: fixed;
            inset: 0;
            background-color: rgba(0, 0, 0, 0.7); /* Semiopaco negro */
            backdrop-filter: blur(5px);
            -webkit-backdrop-filter: blur(5px);
            z-index: 100;
            align-items: center;
            justify-content: center;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Inter", sans-serif;
            color: white;
        }
        .menu-modal-content {
            display: flex;
            flex-wrap: wrap; /* Responsivo en móviles */
            background-color: #1f2937; /* gray-800 - Sobrio, oscuro */
            padding: 1.5rem; /* p-6 */
            border-radius: 12px; /* rounded-xl */
            border: 1px solid rgba(255, 255, 255, 0.2);
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
            width: 90%;
            max-width: 600px; /* Ancho máximo */
            gap: 1.5rem; /* gap-6 */
        }
        .menu-col-left {
            flex: 1; /* Crece */
            min-width: 150px; /* Evitar que se encoja mucho */
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 1rem; /* gap-4 */
        }
        .menu-col-left img {
            width: 120px;
            height: 120px;
            border-radius: 50%; /* Avatar redondo */
            background-color: #374151; /* gray-700 */
            border: 2px solid rgba(255, 255, 255, 0.3);
            object-fit: cover;
        }
        .menu-col-left input {
            width: 100%;
            padding: 0.5rem; /* p-2 */
            border-radius: 6px; /* rounded-md */
            background-color: #374151; /* gray-700 */
            border: 1px solid #4b5563; /* gray-600 */
            color: white;
            text-align: center;
            font-size: 1.125rem; /* text-lg */
            font-weight: 500; /* font-medium */
        }
        .menu-col-left button {
            width: 100%;
            padding: 0.5rem; /* p-2 */
            border-radius: 6px; /* rounded-md */
            background-color: #2563eb; /* blue-600 */
            color: white;
            border: none;
            cursor: pointer;
            font-weight: 600; /* font-semibold */
            transition: background-color 0.2s;
        }
        .menu-col-left button:hover { background-color: #1d4ed8; } /* blue-700 */
        
        .menu-col-right {
            flex: 2; /* Más espacio para stats */
            min-width: 250px;
        }
        .menu-col-right h2 {
            font-size: 1.5rem; /* text-2xl */
            font-weight: 600; /* font-semibold */
            color: #38bdf8; /* sky-400 - Color acento */
            border-bottom: 1px solid #4b5563; /* gray-600 */
            padding-bottom: 0.5rem; /* pb-2 */
            margin: 0 0 1rem 0; /* mb-4 */
        }
        .menu-stats p {
            font-size: 1rem; /* text-base */
            margin: 0.5rem 0; /* my-2 */
            display: flex;
            justify-content: space-between;
            color: #d1d5db; /* gray-300 */
        }
        .menu-stats span {
            font-weight: 700; /* font-bold */
            color: #34d399; /* emerald-400 - Verde para stats */
        }
        .menu-options {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); /* Responsivo */
            gap: 0.75rem; /* gap-3 */
            margin-top: 1.5rem; /* mt-6 */
        }
        .menu-options button {
            padding: 0.75rem; /* p-3 */
            background-color: #374151; /* gray-700 */
            color: #d1d5db; /* gray-300 */
            border: 1px solid #4b5563; /* gray-600 */
            border-radius: 6px; /* rounded-md */
            cursor: pointer;
            text-align: left;
            font-size: 1rem; /* text-base */
            transition: background-color 0.2s, border-color 0.2s;
        }
        .menu-options button:hover {
            background-color: #4b5563; /* gray-600 */
            border-color: #6b7280; /* gray-500 */
        }
    `;
    document.head.appendChild(style);

    // --- 2. Inyectar HTML ---
    const modalHTML = `
        <div id="player-menu-modal" class="menu-modal-overlay">
            <div class="menu-modal-content">
                <!-- Columna Izquierda (Avatar y Nombre) -->
                <div class="menu-col-left">
                    <img id="menu-avatar-img" src="https://placehold.co/120x120/374151/FFFFFF?text=Avatar" alt="Avatar">
                    <input type="text" id="menu-player-name-input" value="Cargando...">
                    <button id="menu-save-name-btn">Guardar Nombre</button>
                </div>
                
                <!-- Columna Derecha (Stats y Opciones) -->
                <div class="menu-col-right">
                    <h2>Estadísticas</h2>
                    <div class="menu-stats">
                        <p>Salud: <span id="menu-stat-health">--</span></p>
                        <p>Energía: <span id="menu-stat-energy">--</span></p>
                        <p>Dinero: <span id="menu-stat-money">--</span></p>
                    </div>
                    <h2>Opciones</h2>
                    <nav class="menu-options">
                        <button>Estadísticas</button>
                        <button>Equipamiento</button>
                        <button>Inventario</button>
                        <button>Ajustes</button>
                    </nav>
                </div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHTML);
}

/**
 * Abre el modal del menú y lo rellena con datos
 * @param {object} playerData - El objeto del jugador desde Firebase (ej. playersState[myPlayerId])
 */
export function openMenu(playerData) {
    if (!menuModal || !playerData) {
        console.warn("No se puede abrir el menú. Faltan datos del modal o del jugador.");
        return;
    }
    
    // Rellenar datos
    playerNameInput.value = playerData.name || `Jugador-${myPlayerId.substring(0, 4)}`;
    healthStat.textContent = playerData.health || 100;
    energyStat.textContent = playerData.energy || 100;
    moneyStat.textContent = playerData.money || 0;
    
    // (Usamos un placeholder para el avatar por ahora)
    avatarImg.src = playerData.avatarUrl || "https://placehold.co/120x120/374151/FFFFFF?text=Avatar";
    
    menuModal.style.display = 'flex';
    isMenuOpen = true;
}

/**
 * Cierra el modal del menú
 */
export function closeMenu() {
    if (!menuModal) return;
    
    // Antes de cerrar, guardar el nombre (la función savePlayerName comprobará si es necesario)
    savePlayerName(); 
    
    menuModal.style.display = 'none';
    isMenuOpen = false;
}

/**
 * Alterna la visibilidad del menú
 * @param {object} playerData - El objeto del jugador desde Firebase
 */
export function toggleMenu(playerData) {
    if (isMenuOpen) {
        closeMenu();
    } else {
        openMenu(playerData);
    }
}

/**
 * Guarda el nuevo nombre del jugador en Firebase
 */
function savePlayerName() {
    if (!myPlayerRef || !playerNameInput) return;
    
    const newName = playerNameInput.value.trim() || `Jugador-${myPlayerId.substring(0, 4)}`;
    
    // Opcional: Solo actualizar si el nombre ha cambiado
    // (Necesitaríamos guardar el nombre "antiguo" al abrir el menú)
    // Por ahora, simplemente lo actualiza.
    
    // Actualizar el nombre en Firebase
    update(myPlayerRef, {
        name: newName
    }).catch((err) => {
        console.error("Error al guardar el nombre:", err);
        // (Opcional: mostrar una notificación de error)
    });
}