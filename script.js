/**
 * script.js - Cœur du système de détection (PATATE LE DUEL)
 */

// ======= CONFIGURATION PARAMÈTRES =======
const BLINK_THRESHOLD = 0.22; // Ratio d'ouverture d'œil en dessous duquel on considère un clignement
const BLINK_FRAMES = 2;       // Nombre de frames consécutives requises pour valider un clignement
const LOOKAWAY_FRAMES = 5;    // Nombre de frames consécutives où le visage est perdu avant de déclencher la défaite

// ======= ÉLÉMENTS DOM =======
const videoElement = document.getElementById('webcam-video');
const canvasElement = document.getElementById('debug-canvas');
const canvasCtx = canvasElement.getContext('2d');

const screens = {
    start: document.getElementById('start-screen'),
    loading: document.getElementById('loading-screen'),
    play: document.getElementById('play-screen')
};

const startBtn = document.getElementById('start-btn');
const timerElement = document.getElementById('timer');
const jumpscareScreen = document.getElementById('jumpscare-screen');
const jumpscareText = document.getElementById('jumpscare-text');

// ======= SON =======
// IMPORTANT : Assure-toi d'avoir un fichier 'scream.mp3' dans le même dossier
const screamAudio = new Audio('scream.mp3');

// VARIABLES DE JEU
let gameState = 'START'; // START, LOADING, PLAYING, GAMEOVER
let startTime = 0;
let timerInterval = null;
let camera = null;

// Compteurs de frames
let consecutiveBlinkFrames = 0;
let consecutiveNoFaceFrames = 0;

/**
 * Calcul de la distance euclidienne entre 2 points 2D
 */
function getDistance(p1, p2) {
    return Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));
}

/**
 * Calcul du ratio d'ouverture de l'œil (Eye Aspect Ratio - EAR)
 * En utilisant les index des points de repère de MediaPipe FaceMesh
 */
function calculateEAR(landmarks, leftRef, topRef, rightRef, bottomRef) {
    const horizontalDist = getDistance(landmarks[leftRef], landmarks[rightRef]);
    const verticalDist = getDistance(landmarks[topRef], landmarks[bottomRef]);
    if (horizontalDist === 0) return 0;
    return verticalDist / horizontalDist;
}

/**
 * Fonction appelée à chaque image de la webcam traitée par MediaPipe
 */
function onResults(results) {
    if (gameState !== 'PLAYING' && gameState !== 'LOADING') return;

    // --- MISE À JOUR DU DEBUG CANVAS ---
    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    canvasCtx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height);

    // --- DÉTECTION DU VISAGE ---
    if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {

        // Si on était en chargement, on passe en jeu dès qu'on voit un visage
        if (gameState === 'LOADING') {
            startGameLoop();
        }

        consecutiveNoFaceFrames = 0; // Réinitialise le compteur d'absence de visage

        const landmarks = results.multiFaceLandmarks[0];

        // Dessin du mesh pour le débug (optionnel, affiché dans le petit canvas)
        if (gameState === 'PLAYING') {
            drawConnectors(canvasCtx, landmarks, FACEMESH_TESSELATION, { color: '#C0C0C070', lineWidth: 1 });
            drawConnectors(canvasCtx, landmarks, FACEMESH_RIGHT_EYE, { color: '#FF3030' });
            drawConnectors(canvasCtx, landmarks, FACEMESH_LEFT_EYE, { color: '#30FF30' });
        }

        // --- DÉTECTION DES CLIGNEMENTS ---
        // Indices approx de l'œil droit (du point de vue de l'image, donc l'œil gauche de l'utilisateur)
        // 33: coin ext, 159: haut centre, 133: coin int, 145: bas centre
        const rightEyeEAR = calculateEAR(landmarks, 33, 159, 133, 145);

        // Indices approx de l'œil gauche
        // 362: coin int (depuis l'image), 386: haut centre, 263: coin ext, 374: bas centre
        const leftEyeEAR = calculateEAR(landmarks, 362, 386, 263, 374);

        const averageEAR = (rightEyeEAR + leftEyeEAR) / 2;

        if (averageEAR < BLINK_THRESHOLD) {
            consecutiveBlinkFrames++;
            if (consecutiveBlinkFrames >= BLINK_FRAMES) {
                triggerDefeat("PERDU ! TU AS CLIGNÉ !");
            }
        } else {
            consecutiveBlinkFrames = 0;
        }

    } else {
        // --- DÉTECTION DU REGARD DÉTOURNÉ / TÊTE TOURNÉE ---
        // MediaPipe perd le faceMesh quand la tête est trop tournée ou cachée
        if (gameState === 'PLAYING') {
            consecutiveNoFaceFrames++;
            if (consecutiveNoFaceFrames >= LOOKAWAY_FRAMES) {
                triggerDefeat("PERDU ! TU AS FUI DU REGARD !");
            }
        }
    }
    canvasCtx.restore();
}

/**
 * Changement d'écran actif
 */
function showScreen(screenName) {
    Object.values(screens).forEach(s => s.classList.remove('active'));
    screens[screenName].classList.add('active');
}

/**
 * Formatage du timer (00:00:00)
 */
function formatTime(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const msStr = Math.floor((ms % 1000) / 10).toString().padStart(2, '0');
    const seconds = totalSeconds % 60;
    const minutes = Math.floor(totalSeconds / 60);

    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}:${msStr}`;
}

/**
 * Lancement du Timer et passage au jeu actif
 */
function startGameLoop() {
    gameState = 'PLAYING';
    showScreen('play');
    startTime = Date.now();

    timerInterval = setInterval(() => {
        timerElement.innerText = formatTime(Date.now() - startTime);
    }, 10);
}

/**
 * TRIGGER DE JUMPSCARE ET FIN DU JEU ABSURDE
 */
function triggerDefeat(reasonText) {
    if (gameState === 'GAMEOVER') return; // Ne le déclencher qu'une fois
    gameState = 'GAMEOVER';

    // Arrête le timer
    clearInterval(timerInterval);

    // Arrête la caméra pour économiser les ressources (et arrêter la détection)
    if (camera) {
        camera.stop();
    }

    // Affiche le texte de défaite spécifique (clignement ou fuite)
    jumpscareText.innerText = reasonText;

    // Lance le jumpscare
    jumpscareScreen.style.display = 'flex';

    // Joue le son AU MAX!
    try {
        screamAudio.volume = 1.0; // Force 100% volume
        // Réinitialise le son si déjà joué
        screamAudio.currentTime = 0;
        let playPromise = screamAudio.play();

        if (playPromise !== undefined) {
            playPromise.catch(error => {
                console.log("Lecture audio empêchée par le navigateur, le joueur a eu de la chance...", error);
            });
        }
    } catch (e) {
        console.error("Erreur de son", e);
    }
}

/**
 * Initialisation de la partie et demande de caméra
 */
async function initGame() {
    showScreen('loading');
    gameState = 'LOADING';

    // 1. Initialisation de l'IA (FaceMesh)
    const faceMesh = new FaceMesh({
        locateFile: (file) => {
            return `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`;
        }
    });

    faceMesh.setOptions({
        maxNumFaces: 1,
        refineLandmarks: true, // Très important pour l'EAR (Eye Aspect Ratio) car ça repère les pupilles/paupières
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5
    });

    faceMesh.onResults(onResults);

    // 2. Initialisation de la Webcam
    camera = new Camera(videoElement, {
        onFrame: async () => {
            // Empêche MediaPipe de tourner si le jeu est fini
            if (gameState === 'GAMEOVER') return;
            await faceMesh.send({ image: videoElement });
        },
        width: 640,
        height: 480
    });

    try {
        await camera.start();
        // Une fois la caméra démarrée, on passe en attente de détection du premier visage (géré dans onResults)
    } catch (err) {
        alert("Impossible d'accéder à la webcam. Le duel est annulé. (As-tu bloqué l'accès ?)");
        showScreen('start');
        gameState = 'START';
    }
}

// ======= ÉVÉNEMENTS =======
startBtn.addEventListener('click', () => {
    // Initialise le contexte audio avec une interaction utilisateur (important pour les règles des navigateurs modernes qui bloquent l'autoplay !!)
    screamAudio.play().then(() => {
        screamAudio.pause();
        screamAudio.currentTime = 0;
    }).catch(() => { });

    initGame();
});
