// Conectar ao servidor
const socket = io();

// Configuração dos jogadores
const MAX_PLAYERS = 8;
const DEFAULT_MAX_HEALTH = 100;
const DEFAULT_MAX_MANA = 100;
const DEFAULT_CURREN_HEALTH = 100;
const DEFAULT_CURREN_MANA = 100;

// Criar interface dos jogadores
function createPlayerInterface() {
    const grid = document.getElementById('players-grid');

    for (let i = 1; i <= 8; i++) {
        const card = document.createElement('div');
        card.className = 'player-card';
        card.dataset.playerId = i;

        card.innerHTML = `
            <input type="text" id="player-${i}-name" class="character-name" value="Jogador ${i}">
            <div id="player-${i}-media" class="character-image"><img id="player-${i}-image" class="media-el" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='80'%3E%3Crect width='100%25' height='100%25' fill='%23ddd'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='%23000' font-size='12'%3E${i}%3C/text%3E%3C/svg%3E" alt="Jogador ${i}"></div>
            <div class="stats">
                <div class="stat">
                    <label>Vida</label>
                    <div class="bar-vertical health-bar">
                        <div id="player-${i}-health-bar" class="bar-fill-vertical" style="height: 100%"></div>
                    </div>
                    <div class="bar-values">
                        <input type="number" id="player-${i}-health-max" class="health-max" value="100" style="width:60px"> /
                        <input type="number" id="player-${i}-health-current" class="health-current" value="100" style="width:60px">
                    </div>
                    <div id="player-${i}-health-value" class="bar-value-vertical">100/100</div>
                    <div class="controls">
                        <button data-player="${i}" data-stat="health" data-amount="5">+5</button>
                        <button data-player="${i}" data-stat="health" data-amount="1">+1</button>
                        <button data-player="${i}" data-stat="health" data-amount="-1">-1</button>
                        <button data-player="${i}" data-stat="health" data-amount="-5">-5</button>
                    </div>
                </div>
                <div class="stat">
                    <label>Mana</label>
                    <div class="bar-vertical mana-bar">
                        <div id="player-${i}-mana-bar" class="bar-fill-vertical" style="height: 100%"></div>
                    </div>
                    <div class="bar-values">
                        <input type="number" id="player-${i}-mana-max" class="mana-max" value="100" style="width:60px"> /
                        <input type="number" id="player-${i}-mana-current" class="mana-current" value="100" style="width:60px">
                    </div>
                    <div id="player-${i}-mana-value" class="bar-value-vertical">100/100</div>
                    <div class="controls">
                        <button data-player="${i}" data-stat="mana" data-amount="5">+5</button>
                        <button data-player="${i}" data-stat="mana" data-amount="1">+1</button>
                        <button data-player="${i}" data-stat="mana" data-amount="-1">-1</button>
                        <button data-player="${i}" data-stat="mana" data-amount="-5">-5</button>
                    </div>
                </div>
            </div>
            <div class="player-actions">
                <button class="reset-player" data-player="${i}">Resetar</button>
            </div>
        `;

        grid.appendChild(card);
    }

    setupEventListeners();
}

// Configurar event listeners
function setupEventListeners() {
    // Botões de adicionar/subtrair (usar diretamente o `data-amount`)
    document.querySelectorAll('.controls button').forEach(button => {
        button.addEventListener('click', function() {
            const playerId = this.dataset.player;
            const stat = this.dataset.stat;
            const amount = parseInt(this.dataset.amount, 10) || 0;

            // Always update only the CURRENT value for the given stat (health or mana)
            const currentInputId = `player-${playerId}-${stat}-current`;
            const maxInputId = `player-${playerId}-${stat}-max`;
            socket.emit(stat === 'health' ? 'update-health' : 'update-mana', { playerId, amount });
            // ensure local state
            socket.players = socket.players || {};
            socket.players[playerId] = socket.players[playerId] || { health: DEFAULT_MAX_HEALTH, maxHealth: DEFAULT_MAX_HEALTH, mana: DEFAULT_MAX_MANA, maxMana: DEFAULT_MAX_MANA, name: `Jogador ${playerId}` };
            // compute new current value only
            if (stat === 'health') {
                socket.players[playerId].health = (Number(socket.players[playerId].health) || 0) + amount;
            } else {
                socket.players[playerId].mana = (Number(socket.players[playerId].mana) || 0) + amount;
            }
            // update the DOM current input explicitly
            const currentEl = document.getElementById(currentInputId);
            if (currentEl) {
                currentEl.value = stat === 'health' ? socket.players[playerId].health : socket.players[playerId].mana;
            }
            // also refresh display (bar and text) using only current/max values
            updatePlayerDisplay(playerId, socket.players[playerId]);
            // do not touch max inputs here
        });
    });

    // Botões de reset por personagem
    document.querySelectorAll('.reset-player').forEach(btn => {
        btn.addEventListener('click', () => {
            const playerId = btn.dataset.player;
            if (!confirm(`Resetar jogador ${playerId}?`)) return;

            // Apply reset locally for instant feedback
            socket.players = socket.players || {};
            const defaultPlayer = {
                name: `Jogador ${playerId}`,
                health: DEFAULT_CURREN_HEALTH,
                maxHealth: DEFAULT_MAX_HEALTH,
                mana: DEFAULT_CURREN_MANA,
                maxMana: DEFAULT_MAX_MANA,
                image: `https://via.placeholder.com/150x200?text=Personagem+${playerId}`
            };
            socket.players[playerId] = defaultPlayer;
            updatePlayerDisplay(playerId, defaultPlayer);

            // Notify server to persist and broadcast
            try {
                socket.emit('reset-player', { playerId });
            } catch (err) {
                console.error('Falha ao enviar reset-player via socket:', err);
            }
        });
    });

// Utility: convert Blob to dataURL
function blobToDataURL(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

// Singleton ffmpeg instance to avoid reloading repeatedly
let ffmpegInstance = null;
async function getFFmpeg() {
    if (ffmpegInstance) return ffmpegInstance;
    // Try multiple CDN endpoints to load ffmpeg.wasm (may fail due to CORS/network)
    const urls = [
        'https://unpkg.com/@ffmpeg/ffmpeg@0.11.8/dist/ffmpeg.min.js',
        'https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.11.8/dist/ffmpeg.min.js'
    ];
    let lastErr = null;
    for (const url of urls) {
        try {
            const mod = await import(url);
            const createFFmpeg = mod.createFFmpeg || mod.default?.createFFmpeg || mod.createFFmpeg;
            const fetchFile = mod.fetchFile || mod.default?.fetchFile || mod.fetchFile;
            if (!createFFmpeg) throw new Error('createFFmpeg not found in module');
            const ff = createFFmpeg({ log: true });
            await ff.load();
            ffmpegInstance = { ff, fetchFile };
            return ffmpegInstance;
        } catch (err) {
            console.warn('ffmpeg load failed from', url, err);
            lastErr = err;
            // try next URL
        }
    }
    console.error('Failed to load ffmpeg from CDNs', lastErr);
    throw new Error('Não foi possível carregar ffmpeg.wasm no navegador. Veja o console para mais detalhes.');
}

// Compress video file using ffmpeg.wasm
async function compressVideoFile(file) {
    const { ff, fetchFile } = await getFFmpeg();
    try {
        // write input
        ff.FS('writeFile', 'in.mp4', await fetchFile(file));
        // scale to 1280 width, keep aspect, crf 28 for good compression
        await ff.run('-i', 'in.mp4', '-vf', 'scale=1280:-2', '-crf', '28', 'out.mp4');
        const data = ff.FS('readFile', 'out.mp4');
        const blob = new Blob([data.buffer], { type: 'video/mp4' });
        return blob;
    } catch (err) {
        console.error('compressVideoFile error:', err);
        throw err;
    } finally {
        // cleanup FS entries if possible
        try { ff.FS('unlink', 'in.mp4'); } catch(e){}
        try { ff.FS('unlink', 'out.mp4'); } catch(e){}
    }
}
    
    // Campos de nome
    document.querySelectorAll('.character-name').forEach(input => {
        input.addEventListener('blur', function() {
            const playerId = this.id.split('-')[1];
            socket.emit('update-name', { playerId, name: this.value });
        });
    });
    
    // Imagens (clique para trocar)
    // Image upload: resize client-side to limit file size and standardize display
        // Media upload (image or video). Accept both image/* and video/* and enforce display size.
        document.querySelectorAll('[id^="player-"][id$="-media"]').forEach(container => {
            container.addEventListener('click', async function() {
                const containerEl = this;
                const playerId = this.id.split('-')[1];
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = 'image/*,video/*';
                input.onchange = async e => {
                    const file = e.target.files[0];
                    if (!file) return;

                    // Limits: images small, videos can be large and uploaded to server
                    const IMAGE_MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
                    const SERVER_VIDEO_MAX_FILE_SIZE = 500 * 1024 * 1024; // 500 MB allowed on server
                    const CLIENT_VIDEO_COMPRESSION_LIMIT = 0; // sempre envia direto

                    if (file.type.startsWith('image/')) {
                        if (file.size > IMAGE_MAX_FILE_SIZE) {
                            alert('Imagem muito grande. Limite: 5 MB.');
                            return;
                        }
                        const reader = new FileReader();
                        reader.onload = event => {
                            const imageDataUrl = event.target.result;
                            const tmp = new Image();
                            tmp.onload = () => {
                                const MAX_DIM = 600;
                                let { width, height } = tmp;
                                let scale = 1;
                                if (width > MAX_DIM || height > MAX_DIM) {
                                    scale = Math.min(MAX_DIM / width, MAX_DIM / height);
                                }
                                const targetW = Math.round(width * scale);
                                const targetH = Math.round(height * scale);
                                const canvas = document.createElement('canvas');
                                canvas.width = targetW;
                                canvas.height = targetH;
                                const ctx = canvas.getContext('2d');
                                ctx.drawImage(tmp, 0, 0, targetW, targetH);
                                const outputDataUrl = canvas.toDataURL('image/jpeg', 0.8);
                                // replace container content with img
                                containerEl.innerHTML = `<img id="player-${playerId}-image" class="media-el" src="${outputDataUrl}" alt="Jogador ${playerId}">`;
                                socket.emit('update-image', { playerId, image: outputDataUrl });
                            };
                            tmp.src = imageDataUrl;
                        };
                        reader.readAsDataURL(file);
                    } else if (file.type.startsWith('video/')) {
                        if (file.size > SERVER_VIDEO_MAX_FILE_SIZE) {
                            alert('Vídeo muito grande. Limite: 500 MB.');
                            return;
                        }

                        // If file is small enough, try client-side compression; otherwise upload to server
                        const uploadToServer = file.size > CLIENT_VIDEO_COMPRESSION_LIMIT;

                        if (uploadToServer) {
                            // Upload large video directly to server (multipart/form-data)
                            try {
                                containerEl.innerHTML = '<div class="uploading">Enviando vídeo para o servidor, aguarde...</div>';
                                const form = new FormData();
                                form.append('media', file);
                                form.append('playerId', playerId);
                                const resp = await fetch('/api/upload-media', { method: 'POST', body: form });
                                if (!resp.ok) {
                                    const errText = await resp.text();
                                    throw new Error(errText || 'Upload falhou');
                                }
                                const body = await resp.json();
                                const url = body.url;
                                containerEl.innerHTML = `<video id="player-${playerId}-image" class="media-el" controls loop muted playsinline src="${url}"></video>`;
                                socket.emit('update-image', { playerId, image: url });
                            } catch (err) {
                                console.error('Erro ao enviar vídeo para o servidor:', err);
                                alert('Falha ao enviar o vídeo. Veja o console para mais detalhes.');
                            }
                        } else {
                            // Try client-side compression first for small files
                            try {
                                containerEl.innerHTML = '<div class="uploading">Compactando vídeo, aguarde...</div>';
                                const compressedBlob = await compressVideoFile(file);
                                // convert compressed blob to data URL for sending via socket
                                const dataUrl = await blobToDataURL(compressedBlob);
                                containerEl.innerHTML = `<video id="player-${playerId}-image" class="media-el" controls loop muted playsinline src="${dataUrl}"></video>`;
                                socket.emit('update-image', { playerId, image: dataUrl });
                            } catch (err) {
                                console.warn('Compressão cliente falhou, tentando upload ao servidor...', err);
                                // fallback: upload to server
                                try {
                                    containerEl.innerHTML = '<div class="uploading">Enviando vídeo para o servidor, aguarde...</div>';
                                    const form = new FormData();
                                    form.append('media', file);
                                    form.append('playerId', playerId);
                                    const resp = await fetch('/api/upload-media', { method: 'POST', body: form });
                                    if (!resp.ok) {
                                        const errText = await resp.text();
                                        throw new Error(errText || 'Upload falhou');
                                    }
                                    const body = await resp.json();
                                    const url = body.url;
                                    containerEl.innerHTML = `<video id="player-${playerId}-image" class="media-el" controls loop muted playsinline src="${url}"></video>`;
                                    socket.emit('update-image', { playerId, image: url });
                                } catch (err2) {
                                    console.error('Erro ao enviar vídeo para o servidor (fallback):', err2);
                                    alert('Falha ao processar o vídeo. Veja o console para mais detalhes.');
                                }
                            }
                        }
                    } else {
                        alert('Tipo de arquivo não suportado.');
                    }
                };
                input.click();
            });
        });

    // Inputs para ajustar valores atuais (live) e máximos (on change)
    // Current inputs: update as user types (input event)
    document.querySelectorAll('.health-current, .mana-current').forEach(input => {
        input.addEventListener('input', function() {
            const parts = this.id.split('-');
            const playerId = parts[1];
            const type = parts[2]; // health or mana
            const value = Number(this.value) || 0;

            socket.players = socket.players || {};
            socket.players[playerId] = socket.players[playerId] || { health: DEFAULT_MAX_HEALTH, maxHealth: DEFAULT_MAX_HEALTH, mana: DEFAULT_MAX_MANA, maxMana: DEFAULT_MAX_MANA, name: `Jogador ${playerId}` };

            if (type === 'health') {
                socket.players[playerId].health = value;
                socket.emit('set-health', { playerId, value });
            } else {
                socket.players[playerId].mana = value;
                socket.emit('set-mana', { playerId, value });
            }

            updatePlayerDisplay(playerId, socket.players[playerId]);
        });
    });

    // Max inputs: update on change (when user finishes)
    document.querySelectorAll('.health-max, .mana-max').forEach(input => {
        input.addEventListener('change', function() {
            const parts = this.id.split('-');
            const playerId = parts[1];
            const type = parts[2]; // health or mana
            const value = Number(this.value) || 0;

            socket.players = socket.players || {};
            socket.players[playerId] = socket.players[playerId] || { health: DEFAULT_MAX_HEALTH, maxHealth: DEFAULT_MAX_HEALTH, mana: DEFAULT_MAX_MANA, maxMana: DEFAULT_MAX_MANA, name: `Jogador ${playerId}` };

            if (type === 'health') {
                socket.players[playerId].maxHealth = value;
                socket.emit('set-max-health', { playerId, value });
            } else {
                socket.players[playerId].maxMana = value;
                socket.emit('set-max-mana', { playerId, value });
            }

            updatePlayerDisplay(playerId, socket.players[playerId]);
        });
    });
    
    // Botão reset global (se existir) — protegido para evitar erro quando removido do HTML
    const resetAllBtn = document.getElementById('reset-all');
    if (resetAllBtn) {
        resetAllBtn.addEventListener('click', () => {
            if (!confirm('Resetar todos os jogadores?')) return;

            // Aplicar reset imediatamente no cliente para feedback instantâneo
            socket.players = socket.players || {};
            for (let i = 1; i <= MAX_PLAYERS; i++) {
                const defaultPlayer = {
                    name: `Jogador ${i}`,
                    health: DEFAULT_CURREN_HEALTH,
                    maxHealth: DEFAULT_MAX_HEALTH,
                    mana: DEFAULT_CURREN_MANA,
                    maxMana: DEFAULT_MAX_MANA,
                    image: `https://via.placeholder.com/150x200?text=Personagem+${i}`
                };
                socket.players[i] = defaultPlayer;
                updatePlayerDisplay(i, defaultPlayer);
            }

            // Emitir para o servidor (o servidor persiste e re-emite o estado)
            try {
                socket.emit('reset-all');
            } catch (err) {
                console.error('Falha ao enviar reset-all via socket:', err);
            }
        });
    }
}

// Atualizar interface com dados do servidor
function updatePlayerDisplay(playerId, playerData) {
    // Atualizar nome
    document.getElementById(`player-${playerId}-name`).value = playerData.name;
    
    // Atualizar mídia (imagem ou vídeo). Substitui elemento se o tipo mudar.
    const mediaContainer = document.getElementById(`player-${playerId}-media`);
    const mediaId = `player-${playerId}-image`;
    const url = playerData.image || `https://via.placeholder.com/150x200?text=Personagem+${playerId}`;
    const isVideo = typeof url === 'string' && (url.startsWith('data:video') || /\.(mp4|webm|ogg|mov|mkv)(\?.*)?$/i.test(url));

    if (mediaContainer) {
        let existing = document.getElementById(mediaId);
        if (existing) {
            const tag = existing.tagName.toLowerCase();
            if (isVideo && tag !== 'video') {
                // replace img with video
                const video = document.createElement('video');
                video.id = mediaId;
                video.className = 'media-el';
                video.controls = true;
                video.loop = true;
                video.muted = true;
                video.playsInline = true;
                video.src = url;
                mediaContainer.replaceChild(video, existing);
            } else if (!isVideo && tag !== 'img') {
                // replace video with img
                const img = document.createElement('img');
                img.id = mediaId;
                img.className = 'media-el';
                img.alt = `Jogador ${playerId}`;
                img.src = url;
                mediaContainer.replaceChild(img, existing);
            } else {
                // same tag, just update src
                try { existing.src = url; } catch (e) { existing.setAttribute('src', url); }
            }
        } else {
            // no existing media element, create appropriate one
            if (isVideo) {
                mediaContainer.innerHTML = `<video id="${mediaId}" class="media-el" controls loop muted playsinline src="${url}"></video>`;
            } else {
                mediaContainer.innerHTML = `<img id="${mediaId}" class="media-el" src="${url}" alt="Jogador ${playerId}">`;
            }
        }
    }

    // Atualizar vida (usar height para barra vertical)
    const maxHealth = Number(playerData.maxHealth) || DEFAULT_MAX_HEALTH;
    const currentHealth = Number(playerData.health) || DEFAULT_CURREN_HEALTH;
    let healthPercentage = 0;
    if (maxHealth > 0) {
        healthPercentage = Math.round((currentHealth / maxHealth) * 100);
    }
    healthPercentage = Math.min(100, Math.max(0, healthPercentage));
    const healthBar = document.getElementById(`player-${playerId}-health-bar`);
    if (healthBar) {
        healthBar.style.height = `${healthPercentage}%`;
    }
    const healthValueEl = document.getElementById(`player-${playerId}-health-value`);
    if (healthValueEl) {
        healthValueEl.textContent = `${currentHealth}/${maxHealth}`;
    }

    // Atualizar inputs (se existirem)
    const healthCurrentInput = document.getElementById(`player-${playerId}-health-current`);
    if (healthCurrentInput && document.activeElement !== healthCurrentInput) healthCurrentInput.value = currentHealth;
    const healthMaxInput = document.getElementById(`player-${playerId}-health-max`);
    if (healthMaxInput && document.activeElement !== healthMaxInput) healthMaxInput.value = maxHealth;

    // Atualizar mana (usar height para barra vertical)

    const maxMana = Number(playerData.maxMana) || DEFAULT_MAX_MANA;
    const currentMana = Number(playerData.mana) || DEFAULT_CURREN_MANA;
    let manaPercentage = 0;
    if (maxMana > 0) {
        manaPercentage = Math.round((currentMana / maxMana) * 100);
    }
    manaPercentage = Math.min(100, Math.max(0, manaPercentage));
    const manaBar = document.getElementById(`player-${playerId}-mana-bar`);
    if (manaBar) {
        manaBar.style.height = `${manaPercentage}%`;
    }
    const manaValueEl = document.getElementById(`player-${playerId}-mana-value`);
    if (manaValueEl) {
        manaValueEl.textContent = `${currentMana}/${maxMana}`;
    }

    // Atualizar inputs (se existirem)
    const manaCurrentInput = document.getElementById(`player-${playerId}-mana-current`);
    if (manaCurrentInput && document.activeElement !== manaCurrentInput) manaCurrentInput.value = currentMana;
    const manaMaxInput = document.getElementById(`player-${playerId}-mana-max`);
    if (manaMaxInput && document.activeElement !== manaMaxInput) manaMaxInput.value = maxMana;
}

// Eventos do Socket.IO
socket.on('initial-state', (players) => {
    for (let i = 1; i <= MAX_PLAYERS; i++) {
        if (players[i]) {
            updatePlayerDisplay(i, players[i]);
        }
    }
});

socket.on('player-updated', (data) => {
    const players = socket.players || {};
    if (players[data.playerId]) {
        if (data.health !== undefined) {
            players[data.playerId].health = data.health;
        }
        if (data.mana !== undefined) {
            players[data.playerId].mana = data.mana;
        }
        if (data.name !== undefined) {
            players[data.playerId].name = data.name;
        }
        if (data.image !== undefined) {
            players[data.playerId].image = data.image;
        }
        updatePlayerDisplay(data.playerId, players[data.playerId]);
    }
});

// Manter estado local
socket.on('initial-state', (players) => {
    socket.players = players;
});

// Inicializar
createPlayerInterface();