// ==================================================
// ### CONSTANTES (constantes.js) ###
// ==================================================
// ¡Refactorizado para 3D!

// 3. Configuración de Firebase (sin cambios)
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
export const MOVEMENT_SPEED = 0.05; // (Se mantiene, usado por logica.js)
export const playerSize = 1.0; // Altura del jugador (para la lógica de 'y')
export const PLAYER_LERP_AMOUNT = 0.1; // Suavidad de movimiento

// --- Constantes de Interacción ---
export const MELEE_RANGE = 2.0;
export const INTERACTION_RADIUS = 0.75;

// --- Constantes de NPC ---
export const NPC_MOVE_SPEED = 0.02;
export const NPC_RANDOM_MOVE_CHANCE = 0.005;
export const NPC_RANDOM_WAIT_TIME = 2000;

// --- ¡NUEVO! Constantes de Cámara ---
export const CAMERA_ROTATE_SPEED = 0.1; // Velocidad de la rotación (0.0 a 1.0)
export const CAMERA_ROTATE_STEP = Math.PI / 4; // ¡NUEVO! 45 grados (8 pasos por círculo)

// ¡MODIFICADO! Estos valores ahora controlan el frustum ortográfico
// Un número PEQUEÑO es MÁS ZOOM. Un número GRANDE es MENOS ZOOM.
export const CAMERA_MIN_ZOOM = 3;  // Zoom máximo (vista más cercana)
export const CAMERA_MAX_ZOOM = 10; // Zoom mínimo (vista más lejana)
export const CAMERA_ZOOM_STEP = 2; // Cantidad a cambiar en cada clic

// ¡NUEVO! Valores por defecto para el ángulo
export const CAMERA_DEFAULT_ZOOM = 8;     // Zoom inicial
export const CAMERA_DEFAULT_HEIGHT = 20;   // Altura Y fija sobre el jugador
export const CAMERA_DEFAULT_DISTANCE = 30; // Distancia X/Z fija del jugador (MÁS GRANDE que la altura)


