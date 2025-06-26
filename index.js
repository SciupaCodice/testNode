import express from 'express';
import bodyParser from 'body-parser';
import fetch from 'node-fetch';

const app = express();
const port = 3000; 

// Configurazione OpenWebUI
const OPENWEBUI_BASE_URL = 'https://openwebuispg.sogiscuola.eu';
const OPENWEBUI_API_KEY = 'sk-81625ddff3a74bf9b750e13664031dbf'; // Sostituisci con la tua API key

const allowedOrigins = [
  'https://miodominio1.com',
  'https://miodominio2.it',
  'http://localhost:4200',
  'null',
  'https://etbnew.spaggiari.eu'
];

// Middleware per gestire CORS con whitelist
function corsWithWhitelist(req, res, next) {
  const origin = req.get('Origin');

  if (allowedOrigins.includes(origin)) {
    // Se il dominio è nella whitelist, abilita CORS per quell’Origin
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Vary', 'Origin');
    res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    res.header(
      'Access-Control-Allow-Headers',
      'Origin, X-Requested-With, Content-Type, Accept, Authorization'
    );
  } else {
    // Altrimenti blocca la richiesta CORS
    return res.status(403).json({ error: 'Accesso non consentito dal dominio: ' + origin });
  }

  // Gestione preflight
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }

  next();
}

// Usa il middleware al posto di quello attuale
app.use(corsWithWhitelist);

// Middleware per abilitare CORS
// app.use((req, res, next) => {
//     res.header('Access-Control-Allow-Origin', '*');
//     res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
//     res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
//     next();
// });

// Middleware per parsare il body delle richieste JSON
app.use(bodyParser.json());

// Endpoint per ottenere i modelli disponibili da OpenWebUI
app.get('/models', async (req, res) => {
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
        // Extract both name and id for each model
        const availableModels = data.map(model => ({
            name: model.name,
            id: model.id
        }));

        res.json({ models: availableModels });
    } catch (error) {
        console.error('❌ Errore durante il recupero dei modelli da OpenWebUI:', error.message);
        res.status(500).json({ error: 'Impossibile recuperare i modelli disponibili in questo momento.' });
    }
});

// Endpoint API per la chat con OpenWebUI
app.post('/chat', async (req, res) => {
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