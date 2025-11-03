// ==================================================
// ### CONSTANTES (constantes.js) ###
// ==================================================
// Contiene todos los valores fijos y de configuración.

// 3. Configuración de Firebase
export const firebaseConfig = {
    apiKey: "AIzaSyAfK_AOq-Pc2bzgXEzIEZ1ESWvnhMJUvwI",
    authDomain: "enraya-51670.firebaseapp.com",
    databaseURL: "https://enraya-51670-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "enraya-51670",
    storageBucket: "enraya-51670.firebasestorage.app",
    messagingSenderId: "103343380727",
    appId: "1:103343380727:web:b2fa02aee03c9506915bf2",
    measurementId: "G-2G31LLJY1T"
};

// --- Constantes del Jugador ---
export const MOVEMENT_SPEED = 0.05; // Velocidad del jugador
export const playerSize = 1.0;
export const playerImgWidth = 250;
export const playerImgHeight = 250;
export const playerTextureURL = 'samurai.png';
export const PLAYER_LERP_AMOUNT = 0.1; // Más alto = más rápido

// --- Constantes de Interacción ---
export const MELEE_RANGE = 2.0;
export const INTERACTION_RADIUS = 0.75;

// --- Constantes de NPC ---
export const NPC_MOVE_SPEED = 0.02;
export const NPC_RANDOM_MOVE_CHANCE = 0.005;
export const NPC_RANDOM_WAIT_TIME = 2000;
