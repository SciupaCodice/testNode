import express from 'express';
import bodyParser from 'body-parser';
import fetch from 'node-fetch';
import jwt from 'jsonwebtoken';

const app = express();
const port = 3000; 

// Configurazione OpenWebUI
const OPENWEBUI_BASE_URL = 'https://openwebuispg.sogiscuola.eu';
const OPENWEBUI_API_KEY = 'sk-81625ddff3a74bf9b750e13664031dbf'; // Sostituisci con la tua API key

const JWT_SECRET = 'e8b7be43a2d9c582c3ecaa0e04236ffb';

// Middleware per abilitare CORS
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    next();
});

// Middleware per parsare il body delle richieste JSON
app.use(bodyParser.json());

function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Accesso negato. Token mancante.' });
    }

    jwt.verify(
        token,
        JWT_SECRET,
        { ignoreExpiration: true },    // <–– IGNORA la scadenza exp
        (err, decoded) => {
            if (err) {
                // qui gestisci solo errori di firma o malformazione
                return res.status(403).json({ error: 'Token non valido.' });
            }

            // decoded contiene header + payload, exp compreso se presente
            req.user = decoded;
            next();
        }
    );
}

// Endpoint per ottenere i modelli disponibili da OpenWebUI
app.get('/models', authenticateToken, async (req, res) => {
    try {
        const response = await fetch(`${OPENWEBUI_BASE_URL}/api/v1/models/`, {
            headers: {
                'Authorization': `Bearer ${OPENWEBUI_API_KEY}`,
            }
        });

        if (!response.ok) {
            throw new Error(`Errore HTTP! Stato: ${response.status}`);
        }

        const data = await response.json();
        const availableModels = data.map(model => ({
            name: model.name,
            id: model.id
        }));

        res.json({ models: availableModels, user: req.user }); // Includi i dati decodificati del token
    } catch (error) {
        console.error('❌ Errore durante il recupero dei modelli:', error.message);
        res.status(500).json({ error: 'Impossibile recuperare i modelli disponibili in questo momento.' });
    }
});


// Endpoint API per la chat con OpenWebUI
app.post('/chat', authenticateToken, async (req, res) => {
    const userInput = req.body.message;
    const conversation = req.body.conversation || [];
    const selectedModel = req.body.model || 'llama3.2:3b';

    console.log(req.body);
    console.log(selectedModel)

    if (!userInput || userInput.trim() === '') {
        return res.status(400).json({ error: 'Il messaggio non può essere vuoto.' });
    }

    // Prepara i messaggi nel formato OpenAI
    const messages = [
        ...conversation,
        { role: 'user', content: userInput.trim() }
    ];

    // Imposta gli headers per Server-Sent Events
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');

    try {
        // Prima prova senza streaming per testare la connessione
        const response = await fetch(`${OPENWEBUI_BASE_URL}/api/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${OPENWEBUI_API_KEY}`
            },
            body: JSON.stringify({
                model: selectedModel,
                messages: messages,
                stream: false, // Cambiato a false per semplicità
                temperature: 0.7,
                max_tokens: 2000
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Errore response:', response.status, errorText);
            throw new Error(`Errore HTTP! Stato: ${response.status} - ${errorText}`);
        }

        const data = await response.json();
        const botMessage = data.choices?.[0]?.message?.content || 'Nessuna risposta ricevuta';

        // Simula lo streaming dividendo la risposta in chunk
        const words = botMessage.split(' ');
        let currentMessage = '';

        for (let i = 0; i < words.length; i++) {
            currentMessage += (i > 0 ? ' ' : '') + words[i];
            res.write(`data: ${JSON.stringify({ type: 'chunk', content: (i > 0 ? ' ' : '') + words[i] })}\n\n`);
            
            // Piccola pausa per simulare lo streaming
            await new Promise(resolve => setTimeout(resolve, 50));
        }

        // Aggiorna la conversazione e invia la risposta finale
        const updatedConversation = [
            ...conversation,
            { role: 'user', content: userInput.trim() },
            { role: 'assistant', content: botMessage }
        ];

        res.write(`data: ${JSON.stringify({ type: 'end', conversation: updatedConversation })}\n\n`);
        res.end();

    } catch (error) {
        console.error('❌ Errore durante la comunicazione con OpenWebUI:', error.message);
        res.write(`data: ${JSON.stringify({ type: 'error', error: `Errore: ${error.message}` })}\n\n`);
        res.end();
    }
});

// Serve i file statici dalla cartella 'public'
app.use(express.static('public'));

// Avvia il server
app.listen(port, () => {
    console.log(`🚀 Server Node.js in ascolto`);
});