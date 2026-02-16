// ================================================
// STREAM WEBAPP - Version professionnelle
// Telegram WebApp pour streams sportifs
// ================================================

// Initialisation Telegram
const tg = window.Telegram.WebApp;
tg.ready();
tg.expand();
tg.enableClosingConfirmation();

// ================================================
// CONFIGURATION
// ================================================
const CONFIG = {
    RETRY_DELAY: 3000,           // 3 secondes avant rechargement
    MAX_RETRIES: 3,               // Nombre maximum de tentatives
    VIEWER_UPDATE_INTERVAL: 30000, // 30 secondes entre mises à jour viewers
    PROXY_ENABLED: false,          // Activer/désactiver le proxy CORS
    PROXY_URL: 'https://cors-anywhere.herokuapp.com/' // Proxy optionnel
};

// ================================================
// ÉTAT DE L'APPLICATION
// ================================================
let state = {
    source: null,
    id: null,
    streamNo: 1,
    viewers: 0,
    retryCount: 0,
    streams: [],
    currentStream: null,
    embedUrl: null,
    originalUrl: null
};

// ================================================
// ÉLÉMENTS DOM
// ================================================
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

// ================================================
// UTILITAIRES
// ================================================

/**
 * Récupère les paramètres de l'URL
 */
function getUrlParams() {
    const params = new URLSearchParams(window.location.search);
    return {
        source: params.get('source'),
        id: params.get('id'),
        streamNo: parseInt(params.get('streamNo')) || 1,
        viewers: parseInt(params.get('viewers')) || 0
    };
}

/**
 * Valide les paramètres requis
 */
function validateParams(params) {
    if (!params.source || !params.id) {
        showError('Paramètres de stream invalides');
        return false;
    }
    return true;
}

/**
 * Met à jour le thème Telegram
 */
function updateTheme() {
    const theme = tg.themeParams;
    document.body.style.backgroundColor = theme.bg_color || '#ffffff';
    document.body.style.color = theme.text_color || '#000000';
    
    // Mettre à jour la couleur du bouton principal
    const buttons = document.querySelectorAll('.btn-telegram');
    buttons.forEach(btn => {
        btn.style.backgroundColor = theme.button_color || '#40a7e3';
        btn.style.color = theme.button_text_color || '#ffffff';
    });
}

/**
 * Formate le nombre de viewers (ex: 1500 -> 1.5k)
 */
function formatViewers(count) {
    if (count >= 1000000) {
        return (count / 1000000).toFixed(1) + 'M';
    }
    if (count >= 1000) {
        return (count / 1000).toFixed(1) + 'k';
    }
    return count.toString();
}

// ================================================
// CONSTRUCTION DE L'URL D'EMBED
// ================================================

/**
 * Détecte le type d'ID (numérique ou texte)
 */
function isNumericId(id) {
    return /^\d+$/.test(id);
}

/**
 * Extrait l'ID numérique d'une URL de type golf/19813
 */
function extractNumericId(id) {
    const match = id.match(/\d+/);
    return match ? match[0] : id;
}

/**
 * Construit l'URL d'embed selon la source
 */
function buildEmbedUrl(source, id, streamNo) {
    // Sauvegarder l'URL originale pour référence
    const originalUrl = `https://embedsports.top/embed/${source}/${id}/${streamNo}`;
    state.originalUrl = originalUrl;
    
    // Détection automatique du type de source
    const numericId = isNumericId(id) ? id : extractNumericId(id);
    
    // CAS 1: Source "golf" ou ID numérique (format embedhd.org)
    if (source === 'golf' || isNumericId(id)) {
        console.log(`🎯 Détection: source numérique (${source}, ID: ${id})`);
        return `https://embedhd.org/source/streamed.php?hd=118&id=${numericId}&no=${streamNo}`;
    }
    
    // CAS 2: Source "echo" avec ID texte (cricket, football...)
    if (source === 'echo' && !isNumericId(id)) {
        console.log(`🎯 Détection: source echo texte (${id})`);
        
        // Vérifier si l'ID contient des mots-clés spécifiques
        if (id.includes('cricket') || id.includes('world-cup')) {
            // Format cricket: on garde l'URL originale mais on peut ajouter des paramètres
            return originalUrl;
        }
    }
    
    // CAS 3: Autres sources (alpha, bravo, etc.)
    console.log(`🎯 Détection: source standard (${source})`);
    
    // Par défaut, on tente l'URL originale
    return originalUrl;
}

// ================================================
// GESTION DE L'IFRAME
// ================================================

/**
 * Crée et configure l'iframe avec les attributs optimaux
 */
function configureIframe(embedUrl) {
    const iframe = elements.iframe;
    
    // Attributs de base (basés sur l'exemple qui fonctionne)
    iframe.title = "Stream Player";
    iframe.setAttribute('marginheight', "0");
    iframe.setAttribute('marginwidth', "0");
    iframe.src = embedUrl;
    iframe.scrolling = "no";
    iframe.allowfullscreen = "yes";
    iframe.allow = "encrypted-media; picture-in-picture; fullscreen";
    iframe.width = "100%";
    iframe.height = "100%";
    iframe.frameborder = "0";
    iframe.style.border = "none";
    
    // Attributs de sécurité (optimisés pour embedsports)
    iframe.sandbox = "allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-presentation allow-top-navigation";
    iframe.referrerpolicy = "no-referrer-when-downgrade";
    iframe.loading = "lazy";
    
    // Gestionnaires d'événements
    iframe.onload = handleIframeLoad;
    iframe.onerror = handleIframeError;
    
    return iframe;
}

/**
 * Gestionnaire de chargement réussi
 */
function handleIframeLoad() {
    console.log('✅ Iframe chargé avec succès');
    elements.loading.classList.add('hidden');
    elements.iframe.classList.remove('hidden');
    state.retryCount = 0;
    
    // Notifier Telegram
    tg.sendData(JSON.stringify({
        action: 'stream_started',
        streamNo: state.streamNo,
        viewers: state.viewers,
        url: state.embedUrl
    }));
    
    // Analyser le contenu de l'iframe pour détection avancée
    try {
        setTimeout(() => {
            const iframeDoc = elements.iframe.contentDocument || elements.iframe.contentWindow.document;
            if (iframeDoc.body.innerHTML.includes('embedhd.org')) {
                console.log('🔄 Détection: redirection interne vers embedhd.org');
                // Si l'iframe contient une autre iframe, on pourrait la remonter
            }
        }, 2000);
    } catch (e) {
        // Cross-origin, pas d'accès
    }
}

/**
 * Gestionnaire d'erreur de chargement
 */
function handleIframeError() {
    console.error('❌ Erreur de chargement iframe');
    handleStreamError();
}

// ================================================
// GESTION DES ERREURS
// ================================================

/**
 * Affiche un message d'erreur
 */
function showError(message) {
    elements.errorMessage.textContent = message;
    elements.loading.classList.add('hidden');
    elements.iframe.classList.add('hidden');
    elements.error.classList.remove('hidden');
}

/**
 * Gère les erreurs de stream avec retry automatique
 */
function handleStreamError() {
    state.retryCount++;
    
    if (state.retryCount <= CONFIG.MAX_RETRIES) {
        console.log(`🔄 Tentative ${state.retryCount}/${CONFIG.MAX_RETRIES}...`);
        
        // Stratégie de retry avec backoff exponentiel
        const delay = CONFIG.RETRY_DELAY * Math.pow(2, state.retryCount - 1);
        
        elements.loading.querySelector('p').textContent = 
            `Tentative ${state.retryCount}/${CONFIG.MAX_RETRIES}...`;
        
        setTimeout(() => {
            loadStream();
        }, delay);
    } else {
        showError('Le flux n\'est pas disponible. Veuillez réessayer plus tard.');
    }
}

/**
 * Réessaie le chargement
 */
function retryLoad() {
    state.retryCount = 0;
    elements.error.classList.add('hidden');
    loadStream();
}

// ================================================
// GESTION DES FLUX
// ================================================

/**
 * Charge le stream principal
 */
function loadStream() {
    // Construire l'URL d'embed
    state.embedUrl = buildEmbedUrl(state.source, state.id, state.streamNo);
    console.log('📺 Chargement stream:', state.embedUrl);
    
    // Cacher l'erreur, montrer le loading
    elements.error.classList.add('hidden');
    elements.loading.classList.remove('hidden');
    elements.iframe.classList.add('hidden');
    
    // Configurer l'iframe
    configureIframe(state.embedUrl);
}

/**
 * Charge les informations des flux disponibles (simulé)
 * Dans une version future, on pourrait appeler une API
 */
async function loadStreamInfo() {
    try {
        // Simulation de flux multiples basée sur la source
        const mockStreams = [];
        
        if (state.source === 'echo') {
            mockStreams.push(
                { streamNo: 1, hd: true, language: 'Français' },
                { streamNo: 2, hd: false, language: 'English' },
                { streamNo: 3, hd: true, language: 'Español' }
            );
        } else if (state.source === 'golf' || isNumericId(state.id)) {
            mockStreams.push(
                { streamNo: 1, hd: true, language: 'English' },
                { streamNo: 2, hd: true, language: 'Spanish' }
            );
        } else {
            mockStreams.push(
                { streamNo: 1, hd: true, language: 'Default' }
            );
        }
        
        state.streams = mockStreams;
        updateStreamSelector();
        
    } catch (error) {
        console.warn('⚠️ Impossible de charger les infos flux:', error);
    }
}

/**
 * Met à jour le sélecteur de flux
 */
function updateStreamSelector() {
    if (state.streams.length <= 1) {
        elements.streamSelector.classList.add('hidden');
        return;
    }
    
    elements.streamSelector.classList.remove('hidden');
    elements.totalStreams.textContent = state.streams.length;
    elements.currentStreamNo.textContent = state.streamNo;
    
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
    
    // Initialiser le dropdown Bootstrap
    if (window.bootstrap) {
        new bootstrap.Dropdown(document.querySelector('.dropdown-toggle'));
    }
}

/**
 * Change de flux
 */
function switchStream(streamNo) {
    if (streamNo === state.streamNo) return;
    
    console.log(`🔄 Changement vers flux ${streamNo}`);
    state.streamNo = streamNo;
    elements.currentStreamNo.textContent = streamNo;
    
    // Mettre à jour l'URL
    state.embedUrl = buildEmbedUrl(state.source, state.id, state.streamNo);
    
    // Recharger l'iframe
    elements.iframe.src = state.embedUrl;
    
    // Notifier Telegram
    tg.sendData(JSON.stringify({
        action: 'stream_changed',
        streamNo: streamNo,
        url: state.embedUrl
    }));
}

// ================================================
// GESTION DES VIEWERS
// ================================================

/**
 * Met à jour le compteur de viewers
 */
function updateViewerCount(viewers) {
    if (viewers !== undefined) {
        state.viewers = viewers;
    }
    
    elements.viewerCount.textContent = formatViewers(state.viewers);
}

/**
 * Simule des mises à jour de viewers
 * Dans la vraie vie, remplacer par WebSocket ou API polling
 */
function startViewerUpdates() {
    updateViewerCount();
    
    setInterval(() => {
        // Variation aléatoire réaliste
        const variation = Math.floor(Math.random() * 20) - 10;
        state.viewers = Math.max(0, state.viewers + variation);
        updateViewerCount();
        
        // Notifier Telegram
        tg.sendData(JSON.stringify({
            action: 'viewers_update',
            viewers: state.viewers
        }));
    }, CONFIG.VIEWER_UPDATE_INTERVAL);
}

// ================================================
// CONTRÔLES D'INTERFACE
// ================================================

/**
 * Bascule en plein écran
 */
function toggleFullscreen() {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen();
    } else {
        if (document.exitFullscreen) {
            document.exitFullscreen();
        }
    }
}

/**
 * Ferme la WebApp
 */
function closeWebApp() {
    tg.close();
}

// ================================================
// SÉCURITÉ
// ================================================

/**
 * Empêche les actions de copie
 */
function preventCopy() {
    document.addEventListener('copy', (e) => e.preventDefault());
    document.addEventListener('cut', (e) => e.preventDefault());
    document.addEventListener('paste', (e) => e.preventDefault());
    document.addEventListener('contextmenu', (e) => e.preventDefault());
    
    // Empêcher la sélection de texte
    document.addEventListener('selectstart', (e) => e.preventDefault());
    
    // Désactiver le drag & drop
    document.addEventListener('dragstart', (e) => e.preventDefault());
}

/**
 * Nettoie l'URL des paramètres sensibles
 */
function cleanUrl() {
    if (window.history.replaceState) {
        const cleanUrl = window.location.protocol + "//" + 
                        window.location.host + 
                        window.location.pathname;
        window.history.replaceState({}, document.title, cleanUrl);
    }
}

// ================================================
// INITIALISATION
// ================================================

/**
 * Initialise l'application
 */
async function init() {
    try {
        console.log('🚀 Initialisation de Stream WebApp');
        
        // Récupérer et valider les paramètres
        const params = getUrlParams();
        if (!validateParams(params)) return;
        
        state.source = params.source;
        state.id = params.id;
        state.streamNo = params.streamNo;
        state.viewers = params.viewers;
        
        console.log('📋 Paramètres:', state);
        
        // Appliquer le thème Telegram
        updateTheme();
        
        // Sécurité
        preventCopy();
        cleanUrl();
        
        // Charger les infos des flux
        await loadStreamInfo();
        
        // Charger le stream
        loadStream();
        
        // Démarrer les mises à jour
        startViewerUpdates();
        
        // Écouter les changements de thème
        tg.onEvent('themeChanged', updateTheme);
        
        // Notifier Telegram que la WebApp est prête
        tg.sendData(JSON.stringify({
            action: 'webapp_ready',
            source: state.source,
            id: state.id
        }));
        
    } catch (error) {
        console.error('💥 Erreur d\'initialisation:', error);
        showError('Erreur d\'initialisation: ' + error.message);
    }
}

// ================================================
// DÉMARRAGE
// ================================================

// Attendre que le DOM soit chargé
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

// Exposer les fonctions globales nécessaires
window.toggleFullscreen = toggleFullscreen;
window.closeWebApp = closeWebApp;
window.retryLoad = retryLoad;
window.switchStream = switchStream;
