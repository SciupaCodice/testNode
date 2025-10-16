// chatbot-loader.js
(function () {
    const CHATBOT_API_URL = 'https://testnode-rhxt.onrender.com/chat';
    const MODELS_API_URL = 'https://testnode-rhxt.onrender.com/models';

    let jwtActive = false;      // Flag per verificare se il token JWT è attivo
    let JWT_TOKEN = null;       // Il JWT estratto
    let hasJwtToken = false;    // Flag per verificare se esiste un token JWT
    let jwtSettings = {};       // Impostazioni ricavate dal token JWT

    // Impostazioni predefinite
    const defaultSettings = {
        headerColor: '#005bbb',
        botBubbleColor: '#eee',
        userBubbleColor: '#007bff',
        chatPosition: 'right',
        model: 'casi-e-pareri---llama32',
        allowedDomains: ["prototipo.spaggiari.eu", "etbnew.spaggiari.eu"]      // Fallback se il token non contiene allowedDomains
    };

    function decodeJwt(token = '') {
        if (!token) {
            throw new Error('Il token JWT non può essere vuoto.');
        }
        const parts = token.split('.');
        if (parts.length !== 3) {
            throw new Error('Il token JWT non è valido: deve avere 3 parti (header, payload, signature).');
        }
        const [headerB64, payloadB64, signature] = parts;

        function base64UrlDecode(str) {
            let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
            while (base64.length % 4) base64 += '=';
            const decoded = atob(base64);
            return decodeURIComponent([...decoded].map(c =>
                '%' + c.charCodeAt(0).toString(16).padStart(2, '0')
            ).join(''));
        }

        try {
            const header = JSON.parse(base64UrlDecode(headerB64));
            const payload = JSON.parse(base64UrlDecode(payloadB64));
            return { header, payload, signature };
        } catch (e) {
            throw new Error('Errore nella decodifica o parsing JSON del token JWT: ' + e.message);
        }
    }

    // Legge il token dal tag <script> e popola jwtSettings
    function getScriptParameters() {
        const scriptTag = document.querySelector('#chatbot-loader');
        if (!scriptTag) return {};

        const token = scriptTag.getAttribute('token');
        if (!token) return {};

        try {
            const { payload } = decodeJwt(token);
            hasJwtToken = true;
            jwtActive = true;
            JWT_TOKEN = token;

            // Costruisci jwtSettings unendo defaultSettings con il payload
            jwtSettings = {
                headerColor: payload.headerColor || defaultSettings.headerColor,
                botBubbleColor: payload.botBubbleColor || defaultSettings.botBubbleColor,
                userBubbleColor: payload.userBubbleColor || defaultSettings.userBubbleColor,
                chatPosition: payload.chatPosition || defaultSettings.chatPosition,
                model: payload.model || defaultSettings.model,
                allowedDomains: defaultSettings.allowedDomains
                // allowedDomains: Array.isArray(payload.allowedDomains)
                //     ? payload.allowedDomains
                //     : defaultSettings.allowedDomains
            };

            console.log('Impostazioni JWT trovate:', jwtSettings);
            return jwtSettings;
        } catch (err) {
            console.error('Errore nella decodifica del token JWT:', err);
            return {};
        }
    }

    // Carica impostazioni con priorità: JWT > localStorage > default
    let settings = { ...defaultSettings };

    function saveSettingsToLocalStorage() {
        if (!hasJwtToken) { // Salva solo se non c'è un token JWT
            localStorage.setItem('chatbotSettings', JSON.stringify(settings));
            console.log('Impostazioni salvate in localStorage:', settings);
        }
    }

    // Funzione per caricare le impostazioni da localStorage
    function loadSettingsFromLocalStorage() {
        if (!hasJwtToken) { // Carica solo se non c'è un token JWT
            const savedSettings = localStorage.getItem('chatbotSettings');
            if (savedSettings) {
                console.log('Impostazioni caricate da localStorage:', JSON.parse(savedSettings));
                return { ...defaultSettings, ...JSON.parse(savedSettings) };
            }
        }
        return defaultSettings;
    }

    // Funzione per inizializzare le impostazioni con la giusta priorità
    function initializeSettings() {
        // 1. Controlla se c'è un token JWT
        const jwtParams = getScriptParameters();

        if (hasJwtToken) {
            // Se c'è un token JWT, usa sempre quelle impostazioni
            console.log('Usando impostazioni da token JWT (priorità massima)');
            return jwtSettings;
        } else {
            // Se non c'è token JWT, controlla localStorage
            const localStorageSettings = loadSettingsFromLocalStorage();
            if (localStorageSettings && JSON.stringify(localStorageSettings) !== JSON.stringify(defaultSettings)) {
                console.log('Usando impostazioni da localStorage');
                return localStorageSettings;
            } else {
                console.log('Usando impostazioni predefinite');
                return defaultSettings;
            }
        }
    }

    async function fetchModels() {
        try {
            const res = await fetch(MODELS_API_URL, {
                headers: jwtActive
                    ? { 'Authorization': `Bearer ${JWT_TOKEN}` }
                    : {}
            });
            if (!res.ok) throw new Error('Errore nel recupero dei modelli');
            const data = await res.json();
            return data.models || [];
        } catch (error) {
            console.error('Errore durante il recupero dei modelli:', error);
            return ['llama3.2:3b'];
        }
    }


    async function fetchSettings() {
        try {
            return initializeSettings();
        } catch (error) {
            console.error('Errore durante il recupero delle impostazioni:', error);
            return defaultSettings; // Ritorna le impostazioni predefinite in caso di errore
        }
    }

    function updateStyles() {
        const existingStyle = document.getElementById('chatbot-dynamic-styles');
        if (existingStyle) {
            existingStyle.remove();
        }

        const dynamicCSS = `
        #chatbot-toggle-btn {
            background: ${settings.headerColor};
            ${settings.chatPosition === 'left' ? 'left: 20px; right: auto;' : ''}
        }
        #my-chatbot-widget {
            ${settings.chatPosition === 'left' ? 'left: 20px; right: auto;' : ''}
        }
        #my-chatbot-widget .chat-header,
        #settings-panel .settings-header {
            background: ${settings.headerColor};
        }
        #my-chatbot-widget .chat-message.bot .bubble {
            background: ${settings.botBubbleColor};
        }
        #my-chatbot-widget .chat-message.user .bubble {
            background: ${settings.userBubbleColor};
            color: ${settings.userBubbleColor === '#007bff' ? '#fff' : '#333'};
        }
        `;

        const styleEl = document.createElement('style');
        styleEl.id = 'chatbot-dynamic-styles';
        styleEl.textContent = dynamicCSS;
        document.head.appendChild(styleEl);
    }

    async function initializeChatbot() {
        settings = await fetchSettings();

        // 2. Controllo del dominio consentito
        const currentDomain = window.location.hostname;
        const allowed = Array.isArray(settings.allowedDomains)
            ? settings.allowedDomains
            : [];
        const isAllowed = allowed.includes(currentDomain);

        if (!isAllowed) {
            console.warn(`Chatbot non caricato: il dominio "${currentDomain}" non è nella lista dei domini consentiti.`);
            return; // Esci se dominio non autorizzato
        }
        // *** Fine blocco di controllo del dominio ***

        // Inietta CSS base
        const css = `
        /* Icona tonda in basso a destra */
        #chatbot-toggle-btn {
          position: fixed;
          bottom: 20px;
          right: 20px;
          width: 56px;
          height: 56px;
          border-radius: 50%;
          box-shadow: 0 2px 8px rgba(0,0,0,0.2);
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 28px;
          color: #fff;
          z-index: 9999;
          transition: all 0.3s ease;
        }
        #chatbot-toggle-btn:hover {
          transform: scale(1.1);
        }
        /* Container principale, nascosto di default */
        #my-chatbot-widget {
          position: fixed;
          bottom: 90px;
          right: 20px;
          width: 370px;
          height: 520px;
          background: #ffffff;
          border: 1px solid #ddd;
          border-radius: 8px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.15);
          display: none;
          flex-direction: column;
          overflow: hidden;
          font-family: sans-serif;
          font-size: 14px;
          z-index: 9998;
        }
        /* Header */
        #my-chatbot-widget .chat-header {
          color: #fff;
          padding: 12px;
          font-weight: bold;
          text-align: center;
          position: relative;
        }
        #my-chatbot-widget #close-chatbot-btn,
        #my-chatbot-widget #settings-btn {
            position: absolute;
            top: 45%;
            transform: translateY(-50%);
            background: none;
            border: none;
            font-size: 18px;
            color: #fff;
            cursor: pointer;
            padding: 4px;
            border-radius: 4px;
        }
        #my-chatbot-widget #close-chatbot-btn {
            right: 8px;
        }
        #my-chatbot-widget #settings-btn {
            right: 40px;
        }
        #my-chatbot-widget #close-chatbot-btn:hover,
        #my-chatbot-widget #settings-btn:hover {
            background: rgba(255,255,255,0.2);
        }
        /* Pannello Impostazioni */
        #settings-panel {
          position: fixed;
          bottom: 90px;
          right: 20px;
          width: 370px;
          height: 520px;
          background: #ffffff;
          border: 1px solid #ddd;
          border-radius: 8px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.15);
          display: none;
          flex-direction: column;
          overflow: hidden;
          font-family: sans-serif;
          font-size: 14px;
          z-index: 9997;
        }
        #settings-panel .settings-header {
          color: #fff;
          padding: 12px;
          font-weight: bold;
          text-align: center;
          position: relative;
        }
        #settings-panel #close-settings-btn,
        #settings-panel #back-to-chat-btn {
            position: absolute;
            top: 45%;
            transform: translateY(-50%);
            background: none;
            border: none;
            font-size: 18px;
            color: #fff;
            cursor: pointer;
            padding: 4px;
            border-radius: 4px;
        }
        #settings-panel #close-settings-btn {
            right: 8px;
        }
        #settings-panel #back-to-chat-btn {
            left: 8px; /* Posiziona a sinistra */
        }
        #settings-panel #close-settings-btn:hover,
        #settings-panel #back-to-chat-btn:hover {
            background: rgba(255,255,255,0.2);
        }
        #settings-panel .settings-content {
          flex: 1;
          padding: 20px;
          overflow-y: auto;
        }
        #settings-panel .setting-group {
          margin-bottom: 20px;
        }
        #settings-panel .setting-group label {
          display: block;
          margin-bottom: 8px;
          font-weight: bold;
          color: #333;
        }
        #settings-panel .setting-group input[type="text"],
        #settings-panel .setting-group select {
          width: 100%;
          padding: 8px;
          border: 1px solid #ccc;
          border-radius: 4px;
          font-size: 14px;
        }
        
        /* Selettore colore personalizzato */
        #settings-panel .color-picker-container {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-top: 8px;
        }
        #settings-panel .color-input-wrapper input[type="color"] {
          /* Rimuovi l'input type="color" dalla visualizzazione diretta */
          opacity: 0;
          position: absolute;
          width: 1px;
          height: 1px;
          padding: 0;
          margin: -1px;
          overflow: hidden;
          clip: rect(0, 0, 0, 0);
          border: 0;
        }
        #settings-panel .color-hex-input {
          width: 100%;
          padding: 8px 12px;
          border: 1px solid #ddd;
          border-radius: 6px;
          font-family: monospace;
          font-size: 13px;
          text-transform: uppercase;
          background: #f8f9fa;
          transition: all 0.2s ease;
        }
        #settings-panel .color-hex-input:focus {
          border-color: #007bff;
          background: white;
          outline: none;
          box-shadow: 0 0 0 2px rgba(0,123,255,0.1);
        }
        #settings-panel .color-preview {
          width: 55px;
          height: 45px;
          border-radius: 8px;
          border: 2px solid #ddd;
          display: block;
          cursor: pointer;
          transition: all 0.3s ease;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
          position: relative;
          overflow: hidden;
        }
        #settings-panel .color-preview:hover {
          border-color: #007bff;
          transform: scale(1.05);
          box-shadow: 0 4px 12px rgba(0,123,255,0.3);
        }
        #settings-panel .color-preview:active {
          transform: scale(0.98);
        }
        #settings-panel .color-preview::after {
          content: '🎨';
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          font-size: 18px;
          opacity: 0;
          transition: opacity 0.2s ease;
          pointer-events: none;
        }
        #settings-panel .color-preview:hover::after {
          opacity: 0.8;
          text-shadow: 0 0 4px rgba(255,255,255,0.8);
        }
        #settings-panel .preset-colors {
          display: flex;
          gap: 8px;
          margin-top: 8px;
          flex-wrap: wrap;
        }
        #settings-panel .preset-color {
          width: 32px;
          height: 32px;
          border-radius: 6px;
          border: 2px solid #ddd;
          cursor: pointer;
          transition: all 0.2s ease;
        }
        #settings-panel .preset-color:hover {
          transform: scale(1.1);
          border-color: #007bff;
          box-shadow: 0 2px 8px rgba(0,0,0,0.2);
        }
        #settings-panel .buttons {
          padding: 15px 20px;
          border-top: 1px solid #ddd;
          display: flex;
          gap: 10px;
        }
        #settings-panel .buttons button {
          flex: 1;
          padding: 10px;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-size: 14px;
        }
        #settings-panel .btn-save {
          background: #28a745;
          color: white;
        }
        #settings-panel .btn-reset {
          background: #dc3545;
          color: white;
        }
        #settings-panel .btn-save:hover {
          background: #218838;
        }
        #settings-panel .btn-reset:hover {
          background: #c82333;
        }
        /* Modello dropdown */
        #model-select {
          width: calc(100% - 24px);
          margin: 8px auto;
          padding: 8px;
          border: 1px solid #ccc;
          border-radius: 4px;
          outline: none;
          font-size: 14px;
        }
        /* Messages area */
        #my-chatbot-widget .chat-messages {
          flex: 1;
          padding: 12px;
          overflow-y: auto;
          background: #f9f9f9;
        }
        /* Messaggi */
        #my-chatbot-widget .chat-message {
          display: flex;
          margin-bottom: 8px;
          max-width: 80%;
          line-height: 1.4;
        }
        #my-chatbot-widget .chat-message.bot { justify-content: flex-start; }
        #my-chatbot-widget .chat-message.bot .bubble {
          color: #333; border-radius: 0 8px 8px 8px;
        }
        #my-chatbot-widget .chat-message.user {
            justify-content: flex-end;
            margin-left: auto;
            margin-right: 0;
        }
        #my-chatbot-widget .chat-message.user .bubble {
            margin-right: 0;
            border-radius: 8px 0 8px 8px;
        }
        #my-chatbot-widget .bubble {
          padding: 8px 12px; position: relative;
        }
        #my-chatbot-widget .bubble .icon {
          margin-right: 6px;
        }
        /* Input area */
        #my-chatbot-widget .chat-input-area {
          display: flex; border-top: 1px solid #ddd; padding: 8px; background: #fafafa;
        }
        #my-chatbot-widget .chat-input-area input {
          flex: 1; padding: 10px; border: 1px solid #ccc; border-radius: 20px; outline: none;
        }
        #my-chatbot-widget .chat-input-area button {
          margin-left: 8px; padding: 8px 16px; border: none; border-radius: 20px;
          background: #28a745; color: #fff; cursor: pointer;
        }
        #my-chatbot-widget .chat-input-area button:disabled {
          opacity: 0.6; cursor: default;
        }
        `;
        const styleEl = document.createElement('style');
        styleEl.textContent = css;
        document.head.appendChild(styleEl);

        // settings = await fetchSettings();

        // Applica stili dinamici
        updateStyles();

        // Bottone toggle
        const toggleBtn = document.createElement('div');
        toggleBtn.id = 'chatbot-toggle-btn';
        toggleBtn.innerHTML = '🤖';
        document.body.appendChild(toggleBtn);

        // Container chat
        const container = document.createElement('div');
        container.id = 'my-chatbot-widget';
        document.body.appendChild(container);

        // Pannello impostazioni
        const settingsPanel = document.createElement('div');
        settingsPanel.id = 'settings-panel';
        document.body.appendChild(settingsPanel);

        // Build chat UI
        const header = document.createElement('div');
        header.className = 'chat-header';
        header.innerHTML = `
            <span>Chatbot</span>` + (!jwtActive ? `<button id="settings-btn" title="Impostazioni"><span style="color: white; font-size: 22px;">⚙</span></button>` : ``) + `
            <button id="close-chatbot-btn" title="Chiudi chat"><span style="color: white; font-size: 18px;">✖</span></button>
        `;
        container.appendChild(header);

        // Build settings UI
        settingsPanel.innerHTML = `
            <div class="settings-header">
                <button id="back-to-chat-btn" title="Torna alla chat">◀</button>
                <span>Impostazioni</span>
                <button id="close-settings-btn" title="Chiudi impostazioni"><span style="color: white; font-size: 18px;">✖</span></button>
            </div>
            <div class="settings-content">
                <div class="setting-group">
                    <label for="header-color">Colore Header:</label>
                    <div class="color-picker-container">
                        <div class="color-input-wrapper">
                            <input type="color" id="header-color" value="${settings.headerColor}">
                        </div>
                        <input type="text" id="header-hex" class="color-hex-input" value="${settings.headerColor}">
                        <span class="color-preview" id="header-preview"></span>
                    </div>
                    <div class="preset-colors">
                        <div class="preset-color" style="background: #005bbb" data-color="#005bbb" data-target="header"></div>
                        <div class="preset-color" style="background: #007bff" data-color="#007bff" data-target="header"></div>
                        <div class="preset-color" style="background: #28a745" data-color="#28a745" data-target="header"></div>
                        <div class="preset-color" style="background: #dc3545" data-color="#dc3545" data-target="header"></div>
                        <div class="preset-color" style="background: #6f42c1" data-color="#6f42c1" data-target="header"></div>
                        <div class="preset-color" style="background: #fd7e14" data-color="#fd7e14" data-target="header"></div>
                    </div>
                </div>
                <div class="setting-group">
                    <label for="bot-bubble-color">Colore Messaggi Bot:</label>
                    <div class="color-picker-container">
                        <div class="color-input-wrapper">
                            <input type="color" id="bot-bubble-color" value="${settings.botBubbleColor}">
                        </div>
                        <input type="text" id="bot-hex" class="color-hex-input" value="${settings.botBubbleColor}">
                        <span class="color-preview" id="bot-preview"></span>
                    </div>
                    <div class="preset-colors">
                        <div class="preset-color" style="background: #eee" data-color="#eee" data-target="bot"></div>
                        <div class="preset-color" style="background: #f8f9fa" data-color="#f8f9fa" data-target="bot"></div>
                        <div class="preset-color" style="background: #e9ecef" data-color="#e9ecef" data-target="bot"></div>
                        <div class="preset-color" style="background: #d1ecf1" data-color="#d1ecf1" data-target="bot"></div>
                        <div class="preset-color" style="background: #d4edda" data-color="#d4edda" data-target="bot"></div>
                        <div class="preset-color" style="background: #fff3cd" data-color="#fff3cd" data-target="bot"></div>
                    </div>
                </div>
                <div class="setting-group">
                    <label for="user-bubble-color">Colore Messaggi Utente:</label>
                    <div class="color-picker-container">
                        <div class="color-input-wrapper">
                            <input type="color" id="user-bubble-color" value="${settings.userBubbleColor}">
                        </div>
                        <input type="text" id="user-hex" class="color-hex-input" value="${settings.userBubbleColor}">
                        <span class="color-preview" id="user-preview"></span>
                    </div>
                    <div class="preset-colors">
                        <div class="preset-color" style="background: #007bff" data-color="#007bff" data-target="user"></div>
                        <div class="preset-color" style="background: #28a745" data-color="#28a745" data-target="user"></div>
                        <div class="preset-color" style="background: #6f42c1" data-color="#6f42c1" data-target="user"></div>
                        <div class="preset-color" style="background: #fd7e14" data-color="#fd7e14" data-target="user"></div>
                        <div class="preset-color" style="background: #e83e8c" data-color="#e83e8c" data-target="user"></div>
                        <div class="preset-color" style="background: #20c997" data-color="#20c997" data-target="user"></div>
                    </div>
                </div>
                <div class="setting-group">
                    <label for="chat-position">Posizione Chat:</label>
                    <select id="chat-position">
                        <option value="right" ${settings.chatPosition === 'right' ? 'selected' : ''}>Destra</option>
                        <option value="left" ${settings.chatPosition === 'left' ? 'selected' : ''}>Sinistra</option>
                    </select>
                </div>
            </div>
            <div class="buttons">
                <button class="btn-save" id="save-settings">Salva</button>
                <button class="btn-reset" id="reset-settings">Reset</button>
            </div>
        `;

        // Dropdown per la selezione del modello
        const modelSelect = document.createElement('select');
        modelSelect.id = 'model-select';
        // Recupera i modelli disponibili e popola il menu
        const models = await fetchModels();
        models.forEach(model => {
            const option = document.createElement('option');
            option.value = model.id;
            option.textContent = model.name;
            modelSelect.appendChild(option);
        });

        if (settings.model) {
            modelSelect.value = settings.model; // Imposta il modello selezionato dalle impostazioni
        }

        container.appendChild(modelSelect);

        const messages = document.createElement('div');
        messages.className = 'chat-messages';
        container.appendChild(messages);

        // Prima bolletta di benvenuto
        const welcome = document.createElement('div');
        welcome.className = 'chat-message bot';
        welcome.innerHTML = `<div class="bubble"><span class="icon">🤖</span>Ciao! Come posso aiutarti?</div>`;
        messages.appendChild(welcome);

        const inputArea = document.createElement('div');
        inputArea.className = 'chat-input-area';
        inputArea.innerHTML = `
            <input type="text" id="user-input" placeholder="Scrivi un messaggio..." />
            <button id="send-button">Invia</button>
        `;
        container.appendChild(inputArea);

        // Logica
        const userInput = inputArea.querySelector('#user-input');
        const sendButton = inputArea.querySelector('#send-button');
        const settingsBtn = document.getElementById('settings-btn'); // Ottieni il riferimento al bottone delle impostazioni
        const closeSettingsBtn = document.getElementById('close-settings-btn'); // Ottieni il riferimento al bottone di chiusura delle impostazioni
        const backToChatBtn = document.getElementById('back-to-chat-btn'); // Nuovo bottone per tornare alla chat

        let conversation = [], thinkingInterval, currentBubble;

        // Update color previews
        function updateColorPreviews() {
            document.getElementById('header-preview').style.backgroundColor = settings.headerColor;
            document.getElementById('bot-preview').style.backgroundColor = settings.botBubbleColor;
            document.getElementById('user-preview').style.backgroundColor = settings.userBubbleColor;
            document.getElementById('header-hex').value = settings.headerColor.toUpperCase();
            document.getElementById('bot-hex').value = settings.botBubbleColor.toUpperCase();
            document.getElementById('user-hex').value = settings.userBubbleColor.toUpperCase();
        }
        updateColorPreviews();

        // Helper function to validate and format hex color
        function validateHexColor(hex) {
            const hexRegex = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;
            return hexRegex.test(hex) ? hex : null;
        }

        // Settings event listeners
        document.getElementById('header-color').addEventListener('change', (e) => {
            settings.headerColor = e.target.value;
            updateColorPreviews();
            updateStyles();
        });

        document.getElementById('header-preview').addEventListener('click', () => {
            document.getElementById('header-color').click();
        });

        document.getElementById('header-hex').addEventListener('input', (e) => {
            let hex = e.target.value;
            if (!hex.startsWith('#')) hex = '#' + hex;
            const validHex = validateHexColor(hex);
            if (validHex) {
                settings.headerColor = validHex;
                document.getElementById('header-color').value = validHex;
                updateColorPreviews();
                updateStyles();
            }
        });

        document.getElementById('bot-bubble-color').addEventListener('change', (e) => {
            settings.botBubbleColor = e.target.value;
            updateColorPreviews();
            updateStyles();
        });

        document.getElementById('bot-preview').addEventListener('click', () => {
            document.getElementById('bot-bubble-color').click();
        });

        document.getElementById('bot-hex').addEventListener('input', (e) => {
            let hex = e.target.value;
            if (!hex.startsWith('#') && hex.length > 0) hex = '#' + hex;
            const validHex = validateHexColor(hex);
            if (validHex) {
                settings.botBubbleColor = validHex;
                document.getElementById('bot-bubble-color').value = validHex;
                updateColorPreviews();
                updateStyles();
            }
        });

        document.getElementById('user-bubble-color').addEventListener('change', (e) => {
            settings.userBubbleColor = e.target.value;
            updateColorPreviews();
            updateStyles();
        });

        document.getElementById('user-preview').addEventListener('click', () => {
            document.getElementById('user-bubble-color').click();
        });

        document.getElementById('user-hex').addEventListener('input', (e) => {
            let hex = e.target.value;
            if (!hex.startsWith('#') && hex.length > 0) hex = '#' + hex;
            const validHex = validateHexColor(hex);
            if (validHex) {
                settings.userBubbleColor = validHex;
                document.getElementById('user-bubble-color').value = validHex;
                updateColorPreviews();
                updateStyles();
            }
        });

        document.getElementById('chat-position').addEventListener('change', (e) => {
            settings.chatPosition = e.target.value;
            updateStyles();
        });

        // Preset color selection
        document.querySelectorAll('.preset-color').forEach(preset => {
            preset.addEventListener('click', (e) => {
                const color = e.target.getAttribute('data-color');
                const target = e.target.getAttribute('data-target');

                if (target === 'header') {
                    settings.headerColor = color;
                    document.getElementById('header-color').value = color;
                } else if (target === 'bot') {
                    settings.botBubbleColor = color;
                    document.getElementById('bot-bubble-color').value = color;
                } else if (target === 'user') {
                    settings.userBubbleColor = color;
                    document.getElementById('user-bubble-color').value = color;
                }

                updateColorPreviews();
                updateStyles();
            });
        });

        document.getElementById('save-settings').addEventListener('click', async () => {
            try {
                saveSettingsToLocalStorage();
                settingsPanel.style.display = 'none';
                container.style.display = 'flex'; // Riapri la chat dopo il salvataggio
                userInput.focus();

            } catch (error) {
                console.error('Errore durante il salvataggio delle impostazioni:', error);
                alert('Errore nel salvataggio delle impostazioni. Controlla la console.');
            }
        });

        document.getElementById('reset-settings').addEventListener('click', () => {
            if (confirm('Vuoi ripristinare le impostazioni predefinite?')) {
                settings = { ...defaultSettings };
                document.getElementById('header-color').value = settings.headerColor;
                document.getElementById('bot-bubble-color').value = settings.botBubbleColor;
                document.getElementById('user-bubble-color').value = settings.userBubbleColor;
                document.getElementById('chat-position').value = settings.chatPosition; // Resetta anche la posizione
                updateColorPreviews();
                updateStyles();
            }
        });

        modelSelect.addEventListener('change', () => {
            // Reset della conversazione
            conversation = [];

            // Svuota l'area messaggi
            messages.innerHTML = '';

            // Ri-aggiungi il messaggio di benvenuto
            const welcome = document.createElement('div');
            welcome.className = 'chat-message bot';
            welcome.innerHTML = `<div class="bubble"><span class="icon">🤖</span>Ciao! Come posso aiutarti?</div>`;
            messages.appendChild(welcome);

            // Porta il focus sull'input
            userInput.focus();
        });

        // Toggle chat con lo stesso tasto
        toggleBtn.addEventListener('click', () => {
            // Chiudi le impostazioni solo se sono aperte e stiamo aprendo la chat
            if (settingsPanel.style.display === 'flex') {
                settingsPanel.style.display = 'none';
                container.style.display = 'flex';
                userInput.focus();
            } else if (container.style.display === 'flex') {
                container.style.display = 'none';
            } else {
                container.style.display = 'flex';
                userInput.focus();
            }
        });

        // Apertura pannello impostazioni
        if (!jwtActive) {
            settingsBtn.addEventListener('click', () => {
                // Se la chat è aperta, chiudila per aprire le impostazioni
                if (container.style.display === 'flex') {
                    container.style.display = 'none';
                }
                // Apri o chiudi il pannello impostazioni
                if (settingsPanel.style.display === 'flex') {
                    settingsPanel.style.display = 'none';
                } else {
                    settingsPanel.style.display = 'flex';
                }
            });
        }

        // Chiusura tramite pulsante interno chat
        const closeInternalBtn = container.querySelector('#close-chatbot-btn');
        closeInternalBtn.addEventListener('click', () => {
            container.style.display = 'none';
        });

        // Chiusura tramite pulsante interno impostazioni (la 'x')
        closeSettingsBtn.addEventListener('click', () => {
            settingsPanel.style.display = 'none';
            // Non riaprire automaticamente la chat qui, lascio all'utente la scelta
        });

        // Nuovo: Bottone "Indietro" nelle impostazioni
        backToChatBtn.addEventListener('click', () => {
            settingsPanel.style.display = 'none'; // Chiudi le impostazioni
            container.style.display = 'flex';    // Apri la chat
            userInput.focus();                   // Porta il focus all'input della chat
        });

        function addMessage(text, sender) {
            const msgWrap = document.createElement('div');
            msgWrap.className = `chat-message ${sender}`;
            const bubble = document.createElement('div');
            bubble.className = 'bubble';
            bubble.innerHTML = `<span class="icon">${sender === 'user' ? '👤' : '🤖'}</span>${text}`;
            msgWrap.appendChild(bubble);
            messages.appendChild(msgWrap);
            messages.scrollTop = messages.scrollHeight;
            return bubble;
        }

        async function sendMessage() {
            const txt = userInput.value.trim();
            if (!txt) return;
            const model = modelSelect.value;
            addMessage(txt, 'user');
            userInput.value = '';
            sendButton.disabled = true;

            // Pensiero...
            const think = document.createElement('div');
            think.className = 'chat-message bot';
            think.innerHTML = `<div class="bubble"><span class="icon">🤖</span><em id="thinking-text">Pensando</em></div>`;
            messages.appendChild(think);
            messages.scrollTop = messages.scrollHeight;
            const thinkTxt = think.querySelector('#thinking-text');
            let dots = 0;
            thinkingInterval = setInterval(() => {
                dots = (dots + 1) % 4;
                thinkTxt.textContent = 'Pensando' + '.'.repeat(dots);
            }, 500);

            // Inizia la parte di gestione dello stream
            let fullBotResponse = '';
            let currentBubble = null;

            try {
                const response = await fetch(CHATBOT_API_URL, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        ...(jwtActive && { 'Authorization': `Bearer ${JWT_TOKEN}` })
                    },
                    body: JSON.stringify({ message: txt, conversation, model })
                });

                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }

                const reader = response.body.getReader();
                const decoder = new TextDecoder('utf-8');

                // Rimuovi il messaggio "Pensando..."
                messages.removeChild(think);
                clearInterval(thinkingInterval);

                // Crea la bolla del bot dove verrà scritto il testo in streaming
                const botMessageDiv = document.createElement('div');
                botMessageDiv.className = 'chat-message bot';
                botMessageDiv.innerHTML = `<div class="bubble"><span class="icon">🤖</span><span class="content"></span></div>`;
                messages.appendChild(botMessageDiv);

                const contentSpan = botMessageDiv.querySelector('.content');
                let buffer = ''; // Buffer per gestire chunk parziali

                while (true) {
                    const { done, value } = await reader.read();
                    if (done) {
                        break;
                    }

                    // Decodifica il chunk
                    const chunk = decoder.decode(value, { stream: true });
                    buffer += chunk;

                    // Processa tutti gli eventi completi nel buffer
                    let lines = buffer.split('\n');
                    buffer = lines.pop() || ''; // Mantieni l'ultima riga parziale nel buffer

                    for (const line of lines) {
                        if (line.startsWith('data: ')) {
                            const eventData = line.substring(6);

                            // Salta eventi vuoti o di keep-alive
                            if (!eventData.trim() || eventData.trim() === '[DONE]') {
                                continue;
                            }

                            try {
                                const parsedData = JSON.parse(eventData);

                                if (parsedData.type === 'chunk') {
                                    fullBotResponse += parsedData.content;

                                    // Aggiorna il contenuto in tempo reale
                                    // Se hai una funzione per convertire markdown in HTML, usala qui
                                    contentSpan.textContent = fullBotResponse;
                                    // Oppure se vuoi supportare HTML/markdown:
                                    // contentSpan.innerHTML = convertMarkdownToHTML(fullBotResponse);

                                    // Scrolla alla fine
                                    messages.scrollTop = messages.scrollHeight;

                                } else if (parsedData.type === 'end') {
                                    conversation = parsedData.conversation;
                                    break;

                                } else if (parsedData.type === 'error') {
                                    console.error('Errore dallo stream:', parsedData.error);
                                    contentSpan.textContent = `Errore: ${parsedData.error}`;
                                    break;
                                }
                            } catch (e) {
                                console.warn('Errore nel parsing del JSON dello stream:', e, 'Event data:', eventData);
                                // Continua con il prossimo evento
                            }
                        }
                    }
                }

            } catch (error) {
                console.error('Errore nella richiesta di chat:', error);

                // Rimuovi il messaggio "Pensando..." se ancora presente
                if (think.parentNode) {
                    messages.removeChild(think);
                }
                clearInterval(thinkingInterval);

                // Mostra l'errore
                const errorDiv = document.createElement('div');
                errorDiv.className = 'chat-message bot';
                errorDiv.innerHTML = `<div class="bubble"><span class="icon">🤖</span>Si è verificato un errore: ${error.message}</div>`;
                messages.appendChild(errorDiv);
                messages.scrollTop = messages.scrollHeight;

            } finally {
                // Riabilita l'interfaccia
                sendButton.disabled = false;
                userInput.focus();
                clearInterval(thinkingInterval);
            }
        }

        sendButton.addEventListener('click', sendMessage);
        userInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                sendMessage();
            }
        });
    }

    // Inizializza il chatbot quando il DOM è completamente caricato
    document.addEventListener('DOMContentLoaded', initializeChatbot);
})();