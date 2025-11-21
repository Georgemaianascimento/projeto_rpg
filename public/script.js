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
            <div class="character-image"><img id="player-${i}-image" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='80'%3E%3Crect width='100%25' height='100%25' fill='%23ddd'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='%23000' font-size='12'%3E${i}%3C/text%3E%3C/svg%3E" alt="Jogador ${i}"></div>
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
    
    // Campos de nome
    document.querySelectorAll('.character-name').forEach(input => {
        input.addEventListener('blur', function() {
            const playerId = this.id.split('-')[1];
            socket.emit('update-name', { playerId, name: this.value });
        });
    });
    
    // Imagens (clique para trocar)
    // Image upload: resize client-side to limit file size and standardize display
    document.querySelectorAll('.character-image img').forEach(img => {
        img.addEventListener('click', function() {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'image/*';
            input.onchange = e => {
                const file = e.target.files[0];
                if (!file) return;

                const reader = new FileReader();
                reader.onload = event => {
                    const imgEl = this;
                    const imageDataUrl = event.target.result;
                    // create an Image to get real dimensions
                    const tmp = new Image();
                    tmp.onload = () => {
                        // limit max dimension to avoid huge uploads
                        const MAX_DIM = 600; // px
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
                        // draw resized image
                        ctx.drawImage(tmp, 0, 0, targetW, targetH);
                        // export as jpeg to reduce size (keep some quality)
                        const outputDataUrl = canvas.toDataURL('image/jpeg', 0.8);

                        // set image src to the resized data URL
                        imgEl.src = outputDataUrl;
                        const playerId = imgEl.id.split('-')[1];
                        socket.emit('update-image', { playerId, image: outputDataUrl });
                    };
                    tmp.src = imageDataUrl;
                };
                reader.readAsDataURL(file);
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
    
    // Botão reset
    document.getElementById('reset-all').addEventListener('click', () => {
        if (confirm('Resetar todos os jogadores?')) {
            socket.emit('reset-all');
        }
    });
}

// Atualizar interface com dados do servidor
function updatePlayerDisplay(playerId, playerData) {
    // Atualizar nome
    document.getElementById(`player-${playerId}-name`).value = playerData.name;
    
    // Atualizar imagem (se existir no card)
    const imgEl = document.getElementById(`player-${playerId}-image`);
    if (imgEl && playerData.image) {
        imgEl.src = playerData.image;
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