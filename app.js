// Initialisation Telegram WebApp
const tg = window.Telegram.WebApp;
tg.ready();
tg.expand(); // La WebApp prend tout l'écran
tg.enableClosingConfirmation(); // Demande confirmation avant fermeture

// Configuration
const CONFIG = {
    RETRY_DELAY: 3000, // 3 secondes avant rechargement
    MAX_RETRIES: 3,
    VIEWER_UPDATE_INTERVAL: 30000 // 30 secondes
};

// État de l'application
let state = {
    source: null,
    id: null,
    streamNo: 1,
    viewers: 0,
    retryCount: 0,
    streams: [], // Pour stocker tous les flux disponibles
    currentStream: null
};

// Éléments DOM
const elements = {
    loading: document.getElementById('loadingOverlay'),
    error: document.getElementById('errorOverlay'),
    iframe: document.getElementById('streamIframe'),
    viewerCount: document.getElementById('viewerCountText'),
    errorMessage: document.getElementById('errorMessage'),
    streamSelector: document.getElementById('streamSelector'),
    streamList: document.getElementById('streamList'),
    currentStreamNo: document.getElementById('currentStreamNo'),
    totalStreams: document.getElementById('totalStreams')
};

// Récupérer les paramètres de l'URL
function getUrlParams() {
    const params = new URLSearchParams(window.location.search);
    return {
        source: params.get('source'),
        id: params.get('id'),
        streamNo: parseInt(params.get('streamNo')) || 1,
        viewers: parseInt(params.get('viewers')) || 0
    };
}

// Valider les paramètres
function validateParams(params) {
    if (!params.source || !params.id) {
        showError('Paramètres de stream invalides');
        return false;
    }
    return true;
}

// Initialiser l'application
async function init() {
    try {
        // Récupérer et valider les paramètres
        const params = getUrlParams();
        if (!validateParams(params)) return;
        
        state.source = params.source;
        state.id = params.id;
        state.streamNo = params.streamNo;
        state.viewers = params.viewers;
        
        // Mettre à jour le thème Telegram
        updateTheme();
        
        // Charger les informations du stream
        await loadStreamInfo();
        
        // Charger le flux
        loadStream();
        
        // Écouter les changements de thème
        tg.onEvent('themeChanged', updateTheme);
        
        // Démarrer la mise à jour des viewers
        startViewerUpdates();
        
    } catch (error) {
        console.error('Initialization error:', error);
        showError('Erreur d\'initialisation');
    }
}

// Mettre à jour le thème selon Telegram
function updateTheme() {
    const theme = tg.themeParams;
    document.body.style.backgroundColor = theme.bg_color || '#ffffff';
    document.body.style.color = theme.text_color || '#000000';
}

// Charger les informations du stream (optionnel - pour avoir tous les flux)
async function loadStreamInfo() {
    try {
        // Ici tu pourrais appeler une API pour récupérer tous les flux disponibles
        // Pour l'instant, on simule avec les paramètres
        const mockStreams = [
            { streamNo: 1, hd: true, language: 'Français' },
            { streamNo: 2, hd: false, language: 'English' },
            { streamNo: 3, hd: true, language: 'Español' }
        ];
        
        state.streams = mockStreams;
        updateStreamSelector();
        
    } catch (error) {
        console.warn('Could not load stream info:', error);
    }
}

// Mettre à jour le sélecteur de flux
function updateStreamSelector() {
    if (state.streams.length <= 1) return;
    
    elements.streamSelector.classList.remove('hidden');
    elements.totalStreams.textContent = state.streams.length;
    
    // Vider la liste
    elements.streamList.innerHTML = '';
    
    // Ajouter les options
    state.streams.forEach(stream => {
        const li = document.createElement('li');
        const a = document.createElement('a');
        a.className = `dropdown-item ${stream.streamNo === state.streamNo ? 'active' : ''}`;
        a.href = '#';
        a.onclick = (e) => {
            e.preventDefault();
            switchStream(stream.streamNo);
        };
        
        a.innerHTML = `
            Flux ${stream.streamNo}
            ${stream.hd ? '<span class="hd-badge">HD</span>' : ''}
            <small class="text-muted d-block">${stream.language}</small>
        `;
        
        li.appendChild(a);
        elements.streamList.appendChild(li);
    });
}

// Changer de flux
function switchStream(streamNo) {
    if (streamNo === state.streamNo) return;
    
    state.streamNo = streamNo;
    elements.currentStreamNo.textContent = streamNo;
    
    // Recharger le flux
    loadStream();
}

// Construire l'URL d'embed
function buildEmbedUrl() {
    // Format basé sur ton exemple : https://embedsports.top/embed/[source]/[id]/[streamNo]
    return `https://embedsports.top/embed/${state.source}/${state.id}/${state.streamNo}`;
}

// Charger le stream
function loadStream() {
    // Cacher l'erreur, montrer le loading
    elements.error.classList.add('hidden');
    elements.loading.classList.remove('hidden');
    elements.iframe.classList.add('hidden');
    
    // Construire l'URL
    const embedUrl = buildEmbedUrl();
    
    // Configurer l'iframe
    elements.iframe.src = embedUrl;
    
    // Gérer le chargement de l'iframe
    elements.iframe.onload = () => {
        elements.loading.classList.add('hidden');
        elements.iframe.classList.remove('hidden');
        state.retryCount = 0; // Reset retry count on success
        
        // Envoyer un événement à Telegram
        tg.sendData(JSON.stringify({
            action: 'stream_started',
            streamNo: state.streamNo,
            viewers: state.viewers
        }));
    };
    
    // Gérer les erreurs de l'iframe
    elements.iframe.onerror = () => {
        handleStreamError();
    };
}

// Gérer les erreurs de stream
function handleStreamError() {
    state.retryCount++;
    
    if (state.retryCount <= CONFIG.MAX_RETRIES) {
        // Réessayer automatiquement
        setTimeout(() => {
            loadStream();
        }, CONFIG.RETRY_DELAY);
    } else {
        // Afficher l'erreur
        showError('Le flux n\'est pas disponible. Veuillez réessayer plus tard.');
    }
}

// Afficher une erreur
function showError(message) {
    elements.errorMessage.textContent = message;
    elements.loading.classList.add('hidden');
    elements.iframe.classList.add('hidden');
    elements.error.classList.remove('hidden');
}

// Réessayer le chargement
function retryLoad() {
    state.retryCount = 0;
    loadStream();
}

// Mettre à jour le compteur de viewers
function updateViewerCount(viewers) {
    if (viewers !== undefined) {
        state.viewers = viewers;
    }
    
    // Formater le nombre
    const formatted = state.viewers >= 1000 
        ? (state.viewers / 1000).toFixed(1) + 'k'
        : state.viewers.toString();
    
    elements.viewerCount.textContent = formatted;
}

// Démarrer les mises à jour des viewers (simulation)
function startViewerUpdates() {
    updateViewerCount();
    
    // Simuler des mises à jour (dans la vraie vie, tu utiliserais WebSocket ou polling API)
    setInterval(() => {
        // Variation aléatoire pour la démo
        const variation = Math.floor(Math.random() * 10) - 5;
        state.viewers = Math.max(0, state.viewers + variation);
        updateViewerCount();
        
        // Optionnel: envoyer les viewers à Telegram
        tg.sendData(JSON.stringify({
            action: 'viewers_update',
            viewers: state.viewers
        }));
    }, CONFIG.VIEWER_UPDATE_INTERVAL);
}

// Mode plein écran
function toggleFullscreen() {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen();
    } else {
        if (document.exitFullscreen) {
            document.exitFullscreen();
        }
    }
}

// Fermer la WebApp
function closeWebApp() {
    tg.close();
}

// Empêcher le copier-coller
document.addEventListener('copy', (e) => e.preventDefault());
document.addEventListener('cut', (e) => e.preventDefault());
document.addEventListener('paste', (e) => e.preventDefault());
document.addEventListener('contextmenu', (e) => e.preventDefault());

// Démarrer l'application
document.addEventListener('DOMContentLoaded', init);
