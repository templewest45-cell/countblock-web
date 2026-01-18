const state = {
    columns: 5, // Default 5 columns
    blockColor: '#3b82f6',
    blockSize: 50,
    filled: {}, // Map "col-index" -> count of filled blocks
    allComplete: false
};

// DOM Elements
const boardEl = document.getElementById('board');
const trayEl = document.getElementById('tray');
const victoryOverlay = document.getElementById('victory-overlay');
const resetBtn = document.getElementById('reset-btn');
const settingsBtn = document.getElementById('settings-btn');
const settingsModal = document.getElementById('settings-modal');
const closeModal = document.getElementById('close-modal');
const colCountInput = document.getElementById('col-count');
const colValDisplay = document.getElementById('col-val');
const colorInput = document.getElementById('block-color');
const sizeInput = document.getElementById('block-size');
const root = document.documentElement;

// Audio Context
let audioCtx = null;

function initAudio() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
}

function playSnapSound() {
    if (!audioCtx) initAudio();
    if (audioCtx.state === 'suspended') audioCtx.resume();

    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();

    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(400, audioCtx.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(600, audioCtx.currentTime + 0.1);

    gainNode.gain.setValueAtTime(0.3, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.2);

    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);


    oscillator.start();
    oscillator.stop(audioCtx.currentTime + 0.2);
}

function playFanfareSound(type) {
    if (!audioCtx) initAudio();
    if (audioCtx.state === 'suspended') audioCtx.resume();

    const now = audioCtx.currentTime;

    // Simple helper for notes
    const playNote = (freq, startTime, duration) => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();

        osc.type = 'triangle'; // Softer than sine, good for fanfare
        osc.frequency.setValueAtTime(freq, startTime);

        gain.gain.setValueAtTime(0.2, startTime);
        gain.gain.exponentialRampToValueAtTime(0.01, startTime + duration);

        osc.connect(gain);
        gain.connect(audioCtx.destination);

        osc.start(startTime);
        osc.stop(startTime + duration);
    };

    if (type === 'column') {
        // Short fanfare: C E G
        playNote(523.25, now, 0.4); // C5
        playNote(659.25, now + 0.1, 0.4); // E5
        playNote(783.99, now + 0.2, 0.6); // G5
    } else if (type === 'victory') {
        // Grand fanfare
        // C5, E5, G5, C6 arpeggio + chord
        const speeds = [0, 0.15, 0.3, 0.45, 0.6];
        [523.25, 659.25, 783.99, 1046.50, 783.99].forEach((freq, i) => {
            playNote(freq, now + speeds[i], 0.5);
        });

        // Final chord
        setTimeout(() => {
            playNote(523.25, now + 0.8, 1.5);
            playNote(659.25, now + 0.8, 1.5);
            playNote(783.99, now + 0.8, 1.5);
            playNote(1046.50, now + 0.8, 1.5);
        }, 10);
    }
}

// Initialization
function init() {
    renderBoard();
    setupEventListeners();
    updateStyles();

    // Initial scale adjustment
    setTimeout(adjustBoardScale, 100);
    window.addEventListener('resize', adjustBoardScale);
}

function adjustBoardScale() {
    const container = document.querySelector('.board-container');
    const board = document.getElementById('board');

    if (!container || !board) return;

    // Reset scale to measure true size
    board.style.transform = 'scale(1)';
    // Force layout update if needed, but usually waiting for next frame is better.
    // However, since we are inside a function, let's grab dimensions now.

    const containerWidth = container.clientWidth;
    const containerHeight = container.clientHeight;

    // Get actual content dimensions
    // We add some padding/margin allowance
    const boardWidth = board.scrollWidth;
    const boardHeight = board.scrollHeight;

    const paddingX = 40; // 2rem + extra
    const paddingY = 40;

    const availableWidth = containerWidth - paddingX;
    const availableHeight = containerHeight - paddingY;

    // Calculate scale required to fit
    let scaleX = availableWidth / boardWidth;
    let scaleY = availableHeight / boardHeight;

    // Use the smaller scale to ensure it fits in both dimensions
    let scale = Math.min(scaleX, scaleY);

    // Don't scale up if it fits (optional, but usually looks better not to become huge)
    // But user wants "max visibility", so maybe scaling up is okay? 
    // Let's limit max scale to 1.0 to avoid pixelation, 
    // BUT if the screen is huge and blocks are small, maybe they want it big?
    // Let's stick to max 1.0 for now to keep quality.
    if (scale > 1) scale = 1;

    // Apply scale
    board.style.transform = `scale(${scale})`;
}

function updateStyles() {
    root.style.setProperty('--block-color', state.blockColor);
    root.style.setProperty('--block-size', `${state.blockSize}px`);
}

function renderBoard() {
    boardEl.innerHTML = '';
    state.filled = {};

    for (let i = 1; i <= state.columns; i++) {
        // Create Column Wrapper
        const colWrapper = document.createElement('div');
        colWrapper.className = 'col-wrapper';

        // Slots Container
        const slotsContainer = document.createElement('div');
        slotsContainer.className = 'slots-container';
        // Assign ID for drop target
        slotsContainer.dataset.colIndex = i;

        // Create slots (height = i)
        for (let j = 0; j < i; j++) {
            const slot = document.createElement('div');
            slot.className = 'slot';
            slot.dataset.col = i;
            slot.dataset.row = j; // 0 is bottom
            slotsContainer.appendChild(slot);
        }

        // Initialize filled count
        state.filled[i] = 0;

        // Number Tile
        const numberTile = document.createElement('div');
        numberTile.className = 'number-tile';
        numberTile.textContent = i;

        // Maru SVG
        const maru = document.createElement('div');
        maru.className = 'maru-mark';
        maru.id = `maru-${i}`;
        // Simple red circle SVG
        maru.innerHTML = `
            <svg viewBox="0 0 100 100">
                 <circle cx="50" cy="50" r="40" stroke="red" stroke-width="8" fill="none" />
            </svg>
        `;

        colWrapper.appendChild(slotsContainer);
        colWrapper.appendChild(maru); // Place overlay
        colWrapper.appendChild(numberTile);
        boardEl.appendChild(colWrapper);
    }
}

function setupEventListeners() {
    // Reset
    resetBtn.addEventListener('click', resetGame);

    // Settings logic
    settingsBtn.addEventListener('click', () => {
        settingsModal.classList.remove('hidden');
    });

    closeModal.addEventListener('click', () => {
        settingsModal.classList.add('hidden');
    });

    window.addEventListener('click', (e) => {
        if (e.target === settingsModal) {
            settingsModal.classList.add('hidden');
        }
    });

    colCountInput.addEventListener('input', (e) => {
        state.columns = parseInt(e.target.value);
        colValDisplay.textContent = state.columns;
        renderBoard();
        adjustBoardScale();
    });

    colorInput.addEventListener('input', (e) => {
        state.blockColor = e.target.value;
        updateStyles();
    });

    sizeInput.addEventListener('input', (e) => {
        state.blockSize = parseInt(e.target.value);
        updateStyles();
        adjustBoardScale();
    });

    // Drag and Drop Logic
    // Source Block
    const sourceBlock = document.querySelector('.source-block');
    sourceBlock.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', 'new-block');
        e.dataTransfer.effectAllowed = 'copy';
    });

    // For touch devices, we might need extra handling, 
    // but using standard HTML5 drag/drop for now as requested for "web app".
    // "Hand" area to board area.

    // Board Delegation
    boardEl.addEventListener('dragover', (e) => {
        e.preventDefault(); // Allow dropping
        e.dataTransfer.dropEffect = 'copy';
    });

    boardEl.addEventListener('drop', (e) => {
        e.preventDefault();
        const type = e.dataTransfer.getData('text/plain');
        if (type !== 'new-block') return;

        // Find the closest drop zone (slots-container or slot)
        const target = e.target;
        const slotsContainer = target.closest('.slots-container');

        if (slotsContainer) {
            const colIndex = parseInt(slotsContainer.dataset.colIndex);
            addBlockToColumn(colIndex, slotsContainer);
        }
    });

    // Touch support for mobile devices
    let dragClone = null;
    let dragOffsetX = 0;
    let dragOffsetY = 0;

    sourceBlock.addEventListener('touchstart', (e) => {
        e.preventDefault(); // Prevent scrolling
        const touch = e.touches[0];
        const rect = sourceBlock.getBoundingClientRect();

        // Create clone
        dragClone = sourceBlock.cloneNode(true);
        dragClone.style.position = 'fixed';
        dragClone.style.zIndex = '1000';
        dragClone.style.pointerEvents = 'none'; // Allow finding element below
        dragClone.style.opacity = '0.8';
        dragClone.style.transform = 'scale(1.1)';
        dragClone.classList.remove('source-block'); // Avoid side effects

        // Center on touch or keep relative offset
        dragOffsetX = rect.width / 2;
        dragOffsetY = rect.height / 2;

        dragClone.style.left = `${touch.clientX - dragOffsetX}px`;
        dragClone.style.top = `${touch.clientY - dragOffsetY}px`;

        document.body.appendChild(dragClone);
    }, { passive: false });

    document.addEventListener('touchmove', (e) => {
        if (!dragClone) return;
        e.preventDefault(); // Prevent scrolling while dragging
        const touch = e.touches[0];

        dragClone.style.left = `${touch.clientX - dragOffsetX}px`;
        dragClone.style.top = `${touch.clientY - dragOffsetY}px`;
    }, { passive: false });

    document.addEventListener('touchend', (e) => {
        if (!dragClone) return;

        const touch = e.changedTouches[0];
        dragClone.remove();
        dragClone = null;

        // Find drop target
        // We temporarily hid the clone so we can look 'under' it, although pointer-events: none handles this.
        const target = document.elementFromPoint(touch.clientX, touch.clientY);

        if (target) {
            const slotsContainer = target.closest('.slots-container');
            if (slotsContainer) {
                const colIndex = parseInt(slotsContainer.dataset.colIndex);
                addBlockToColumn(colIndex, slotsContainer);
            }
        }
    });
}

function resetGame() {
    state.filled = {};
    state.allComplete = false;
    victoryOverlay.classList.remove('show');
    trayEl.classList.remove('invisible');
    renderBoard(); // Re-creates board and resets filled counts
}

function addBlockToColumn(colIndex, containerEl) {
    if (state.allComplete) return;

    const currentFilled = state.filled[colIndex];
    const maxCapacity = colIndex; // Height is equal to column index

    if (currentFilled < maxCapacity) {
        // Can place
        const slots = containerEl.querySelectorAll('.slot');
        const targetSlot = slots[currentFilled];

        // Create block
        const block = document.createElement('div');
        block.className = 'block placed'; // 'placed' triggers animation

        targetSlot.appendChild(block);

        state.filled[colIndex]++;
        playSnapSound();

        // Check for Column Completion
        if (state.filled[colIndex] === maxCapacity) {
            setTimeout(() => {
                triggerColumnComplete(colIndex);
            }, 300); // Slight delay after snap
        }
    } else {
        // Full
    }
}

function triggerColumnComplete(colIndex) {
    const maru = document.getElementById(`maru-${colIndex}`);
    if (maru) maru.classList.add('show');
    playFanfareSound('column');

    // Check Global Completion
    checkAllComplete();
}

function checkAllComplete() {
    // Check if all columns are full
    let allFull = true;
    for (let i = 1; i <= state.columns; i++) {
        if (state.filled[i] < i) {
            allFull = false;
            break;
        }
    }

    if (allFull) {
        state.allComplete = true;
        setTimeout(() => {
            triggerVictory();
        }, 800);
    }
}

function triggerVictory() {
    playFanfareSound('victory');
    victoryOverlay.classList.add('show');

    // Hide tray block
    trayEl.classList.add('invisible');
}

// Start
init();
