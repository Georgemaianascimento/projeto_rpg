const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);
const { Pool } = require('pg');
const fs = require('fs');
const multer = require('multer');
let ffmpeg = null;
let ffmpegStatic = null;
try {
    // optional dependencies - use if available
    ffmpeg = require('fluent-ffmpeg');
    ffmpegStatic = require('ffmpeg-static');
    if (ffmpeg && ffmpegStatic) {
        ffmpeg.setFfmpegPath(ffmpegStatic);
        console.log('ffmpeg available at', ffmpegStatic);
    }
} catch (e) {
    console.warn('ffmpeg not available as optional dependency; .mov will be served as-is if uploaded.');
    ffmpeg = null;
    ffmpegStatic = null;
}

// Servir arquivos estáticos
app.use(express.static(path.join(__dirname, 'public')));

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

// Multer setup for large uploads (up to 600 MB allowed)
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadsDir);
    },
    filename: function (req, file, cb) {
        const safeName = file.originalname.replace(/\s+/g, '_');
        cb(null, `${Date.now()}-${safeName}`);
    }
});
const upload = multer({ storage, limits: { fileSize: 600 * 1024 * 1024 } });

// Estado dos jogadores (em memória, sincronizado com Postgres)
let players = {};

// Configurar pool Postgres usando DATABASE_URL
const databaseUrl = process.env.DATABASE_URL;
// Use SSL for non-local connections (e.g., Heroku). For Docker local service hostnames or true
// localhost, we disable SSL. Parse the URL to check the hostname (safer than regex matching).
let useSsl = false;
if (databaseUrl) {
    try {
        const urlObj = new URL(databaseUrl);
        const host = urlObj.hostname;
        // treat 'localhost', '127.0.0.1', or common docker hostnames like 'db' as local (no SSL)
        useSsl = !(host === 'localhost' || host === '127.0.0.1' || host === 'db' || host === 'postgres');
    } catch (err) {
        // fallback to simple string checks if parsing fails
        useSsl = !(/localhost|127\.0\.0\.1|@db:/.test(databaseUrl));
    }
}
const pool = new Pool({
    connectionString: databaseUrl,
    ssl: useSsl ? { rejectUnauthorized: false } : false
});
console.log('Database SSL enabled:', useSsl);

async function initDbAndLoadPlayers() {
    // create table if not exists
    await pool.query(`
        CREATE TABLE IF NOT EXISTS players (
            id INTEGER PRIMARY KEY,
            name TEXT,
            health INTEGER,
            maxhealth INTEGER,
            mana INTEGER,
            maxmana INTEGER,
            image TEXT
        )
    `);

    // insert defaults for ids 1..8 if not exists
    for (let i = 1; i <= 8; i++) {
        const defaultName = `Jogador ${i}`;
        const defaultImage = `https://via.placeholder.com/150x200?text=Personagem+${i}`;
        await pool.query(
            `INSERT INTO players(id, name, health, maxhealth, mana, maxmana, image)
             VALUES($1,$2,100,100,100,100,$3)
             ON CONFLICT (id) DO NOTHING`,
            [i, defaultName, defaultImage]
        );
    }

    // load players into memory
    const res = await pool.query('SELECT id, name, health, maxhealth, mana, maxmana, image FROM players ORDER BY id');
    players = {};
    for (const row of res.rows) {
        players[row.id] = {
            name: row.name,
            health: Number(row.health) || 0,
            maxHealth: Number(row.maxhealth) || 100,
            mana: Number(row.mana) || 0,
            maxMana: Number(row.maxmana) || 100,
            image: row.image || `https://via.placeholder.com/150x200?text=Personagem+${row.id}`
        };
    }
}

// Quando um cliente se conecta
io.on('connection', (socket) => {
    console.log('Cliente conectado:', socket.id);

    // Enviar estado atual para o novo cliente
    socket.emit('initial-state', players);

    // Atualizar vida (incremental)
    socket.on('update-health', async (data) => {
        const { playerId, amount } = data;
        const player = players[playerId];
        if (player) {
            player.health = Math.max(0, (Number(player.health) || 0) + Number(amount));
            // persist
            await pool.query('UPDATE players SET health=$1 WHERE id=$2', [player.health, playerId]);
            io.emit('player-updated', { playerId, health: player.health });
        }
    });

    // Atualizar mana (incremental)
    socket.on('update-mana', async (data) => {
        const { playerId, amount } = data;
        const player = players[playerId];
        if (player) {
            player.mana = Math.max(0, (Number(player.mana) || 0) + Number(amount));
            await pool.query('UPDATE players SET mana=$1 WHERE id=$2', [player.mana, playerId]);
            io.emit('player-updated', { playerId, mana: player.mana });
        }
    });

    // Set current health directly
    socket.on('set-health', async (data) => {
        const { playerId, value } = data;
        const player = players[playerId];
        if (player && typeof value === 'number') {
            player.health = Math.max(0, value);
            await pool.query('UPDATE players SET health=$1 WHERE id=$2', [player.health, playerId]);
            io.emit('player-updated', { playerId, health: player.health });
        }
    });

    // Set max health
    socket.on('set-max-health', async (data) => {
        const { playerId, value } = data;
        const player = players[playerId];
        if (player && typeof value === 'number') {
            player.maxHealth = Math.max(1, value);
            await pool.query('UPDATE players SET maxhealth=$1 WHERE id=$2', [player.maxHealth, playerId]);
            io.emit('player-updated', { playerId, maxHealth: player.maxHealth });
        }
    });

    // Set current mana
    socket.on('set-mana', async (data) => {
        const { playerId, value } = data;
        const player = players[playerId];
        if (player && typeof value === 'number') {
            player.mana = Math.max(0, value);
            await pool.query('UPDATE players SET mana=$1 WHERE id=$2', [player.mana, playerId]);
            io.emit('player-updated', { playerId, mana: player.mana });
        }
    });

    // Set max mana
    socket.on('set-max-mana', async (data) => {
        const { playerId, value } = data;
        const player = players[playerId];
        if (player && typeof value === 'number') {
            player.maxMana = Math.max(1, value);
            await pool.query('UPDATE players SET maxmana=$1 WHERE id=$2', [player.maxMana, playerId]);
            io.emit('player-updated', { playerId, maxMana: player.maxMana });
        }
    });

    // Atualizar nome
    socket.on('update-name', async (data) => {
        const { playerId, name } = data;
        const player = players[playerId];
        if (player) {
            player.name = name;
            await pool.query('UPDATE players SET name=$1 WHERE id=$2', [player.name, playerId]);
            io.emit('player-updated', { playerId, name: player.name });
        }
    });

    // Atualizar imagem
    socket.on('update-image', async (data) => {
        const { playerId, image } = data;
        const player = players[playerId];
        if (player) {
            player.image = image;
            await pool.query('UPDATE players SET image=$1 WHERE id=$2', [player.image, playerId]);
            io.emit('player-updated', { playerId, image: player.image });
        }
    });

    // Resetar todos os jogadores
    socket.on('reset-all', async () => {
        for (let i = 1; i <= 8; i++) {
            if (players[i]) {
                players[i].health = players[i].maxHealth;
                players[i].mana = players[i].maxMana;
                await pool.query('UPDATE players SET health=$1, mana=$2 WHERE id=$3', [players[i].health, players[i].mana, i]);
            }
        }
        io.emit('initial-state', players);
    });

    // Resetar um jogador específico
    socket.on('reset-player', async (data) => {
        try {
            const playerId = Number(data.playerId || data.player);
            if (!playerId || !players[playerId]) return;
            const defaultName = `Jogador ${playerId}`;
            const defaultImage = `https://via.placeholder.com/150x200?text=Personagem+${playerId}`;
            // update in-memory
            players[playerId] = {
                name: defaultName,
                health: 100,
                maxHealth: 100,
                mana: 100,
                maxMana: 100,
                image: defaultImage
            };
            // persist to DB (guarded)
            try {
                await pool.query(
                    'UPDATE players SET name=$1, health=$2, maxhealth=$3, mana=$4, maxmana=$5, image=$6 WHERE id=$7',
                    [defaultName, 100, 100, 100, 100, defaultImage, playerId]
                );
            } catch (e) {
                console.error('Falha ao persistir reset-player no DB para id', playerId, e.message || e);
            }
            io.emit('player-updated', { playerId, name: defaultName, health: 100, maxHealth: 100, mana: 100, maxMana: 100, image: defaultImage });
        } catch (err) {
            console.error('Erro no handler reset-player:', err.message || err);
        }
    });

    // Desconexão
    socket.on('disconnect', () => {
        console.log('Cliente desconectado:', socket.id);
    });
});

// API REST para integração com OBS ou outras ferramentas
app.get('/api/players', (req, res) => {
    res.json(players);
});

// Endpoint para upload de mídia (image/video). Campo esperado: 'media'
app.post('/api/upload-media', upload.single('media'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo enviado' });
        const playerId = req.body.playerId;
        const originalFilename = req.file.filename;
        let publicUrl = `/uploads/${originalFilename}`;

        // If uploaded file is a .mov and ffmpeg is available, transcode to MP4 for better browser compatibility
        const ext = path.extname(req.file.originalname || '').toLowerCase();
        if ((ext === '.mov' || ext === '.qt') && ffmpeg) {
            try {
                const baseName = path.basename(originalFilename, path.extname(originalFilename));
                const outFilename = `${baseName}.mp4`;
                const outPath = path.join(uploadsDir, outFilename);

                await new Promise((resolve, reject) => {
                    ffmpeg(path.join(uploadsDir, originalFilename))
                        .outputOptions(['-c:v libx264', '-preset veryfast', '-crf 28', '-c:a aac', '-b:a 128k'])
                        .on('end', () => resolve())
                        .on('error', (err) => reject(err))
                        .save(outPath);
                });

                // remove original file to save space
                try { fs.unlinkSync(path.join(uploadsDir, originalFilename)); } catch (e) { /* ignore */ }

                publicUrl = `/uploads/${outFilename}`;
            } catch (e) {
                console.error('Erro ao transcodificar .mov para mp4:', e);
                // fallback: keep original file
                publicUrl = `/uploads/${originalFilename}`;
            }
        }

        // If a playerId was provided, update that player's image and persist
        if (playerId && players[playerId]) {
            players[playerId].image = publicUrl;
            try {
                await pool.query('UPDATE players SET image=$1 WHERE id=$2', [publicUrl, playerId]);
            } catch (e) {
                console.error('Falha ao persistir imagem no DB para id', playerId, e.message || e);
            }
            io.emit('player-updated', { playerId: Number(playerId), image: publicUrl });
        }

        return res.json({ url: publicUrl });
    } catch (err) {
        console.error('Erro em /api/upload-media:', err);
        return res.status(500).json({ error: 'Erro no servidor' });
    }
});

app.post('/api/player/:id/health', express.json(), (req, res) => {
    const playerId = req.params.id;
    const { amount } = req.body;
    
    if (players[playerId] && typeof amount === 'number') {
        players[playerId].health = Math.max(0, Math.min(players[playerId].health + amount, players[playerId].maxHealth));
        io.emit('player-updated', {
            playerId,
            health: players[playerId].health
        });
        res.json({ success: true, health: players[playerId].health });
    } else {
        res.status(400).json({ error: 'Dados inválidos' });
    }
});

app.post('/api/player/:id/mana', express.json(), async (req, res) => {
    const playerId = req.params.id;
    const { amount } = req.body;
    if (players[playerId] && typeof amount === 'number') {
        players[playerId].mana = Math.max(0, (Number(players[playerId].mana) || 0) + Number(amount));
        await pool.query('UPDATE players SET mana=$1 WHERE id=$2', [players[playerId].mana, playerId]);
        io.emit('player-updated', { playerId, mana: players[playerId].mana });
        res.json({ success: true, mana: players[playerId].mana });
    } else {
        res.status(400).json({ error: 'Dados inválidos' });
    }
});

// Inicializar DB e iniciar servidor
const PORT = process.env.PORT || 3333;
initDbAndLoadPlayers().then(() => {
    server.listen(PORT, () => {
        console.log(`Servidor rodando na porta ${PORT}`);
        console.log(`Acesse: http://localhost:${PORT}`);
    });
}).catch(err => {
    console.error('Erro inicializando banco de dados:', err);
    process.exit(1);
});