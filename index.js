import express from 'express';
import bodyParser from 'body-parser';
import fetch from 'node-fetch'; // Aggiungi: npm install node-fetch

const app = express();
const port = process.env.PORT || 3000;

// API Groq invece di Ollama
const GROQ_API_KEY = process.env.GROQ_API_KEY || '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';
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';

// Middleware CORS
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    next();
});

app.use(bodyParser.json());

// Endpoint per i modelli disponibili
app.get('/models', (req, res) => {
    const availableModels = [
        'llama-3.1-70b-versatile',
        'llama-3.1-8b-instant',
        'mixtral-8x7b-32768',
        'gemma2-9b-it'
    ];
    res.json({ models: availableModels });
});

// Endpoint chat con Groq
app.post('/chat', async (req, res) => {
    const userInput = req.body.message;
    const conversation = req.body.conversation || [];
    const selectedModel = req.body.model || 'llama-3.1-8b-instant';

    if (!userInput || userInput.trim() === '') {
        return res.status(400).json({ error: 'Il messaggio non può essere vuoto.' });
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    try {
        const response = await fetch(GROQ_API_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${GROQ_API_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: selectedModel,
                messages: [
                    ...conversation,
                    { role: 'user', content: userInput.trim() }
                ],
                stream: true,
                max_tokens: 1024,
                temperature: 0.7
            }),
        });

        if (!response.ok) {
            throw new Error(`Groq API error: ${response.status}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullBotMessage = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value);
            const lines = chunk.split('\n');

            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const data = line.slice(6);
                    if (data === '[DONE]') continue;
                    
                    try {
                        const parsed = JSON.parse(data);
                        const content = parsed.choices?.[0]?.delta?.content || '';
                        if (content) {
                            fullBotMessage += content;
                            res.write(`data: ${JSON.stringify({ type: 'chunk', content })}\n\n`);
                        }
                    } catch (e) {
                        // Ignora errori di parsing
                    }
                }
            }
        }

        conversation.push({ role: 'user', content: userInput.trim() });
        conversation.push({ role: 'assistant', content: fullBotMessage });
        res.write(`data: ${JSON.stringify({ type: 'end', conversation })}\n\n`);
        res.end();

    } catch (error) {
        console.error('❌ Errore Groq API:', error.message);
        res.write(`data: ${JSON.stringify({ type: 'error', error: 'Errore del server' })}\n\n`);
        res.end();
    }
});

app.use(express.static('public'));

app.listen(port, () => {
    console.log(`🚀 Server online su porta ${port}`);
});