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

    // Force reflow to get accurate dimensions
    const containerWidth = container.clientWidth;
    const containerHeight = container.clientHeight;

    // Get actual content dimensions
    const boardWidth = board.scrollWidth;
    const boardHeight = board.scrollHeight;

    // Safety check for unsized board (e.g., hidden or detached)
    if (boardWidth === 0 || boardHeight === 0) return;

    const paddingX = 20; // Reduced padding
    const paddingY = 20;

    // Ensure available space is at least something positive
    const availableWidth = Math.max(10, containerWidth - paddingX);
    const availableHeight = Math.max(10, containerHeight - paddingY);

    // Calculate scale required to fit
    let scaleX = availableWidth / boardWidth;
    let scaleY = availableHeight / boardHeight;

    // Use the smaller scale to ensure it fits in both dimensions
    let scale = Math.min(scaleX, scaleY);

    // Safety clamp (0.01 to 1.0)
    scale = Math.max(0.01, Math.min(scale, 1.0));

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
    // Clear highlights helper
    const clearHighlights = () => {
        document.querySelectorAll('.slot.hovered').forEach(el => el.classList.remove('hovered'));
    };

    boardEl.addEventListener('dragover', (e) => {
        e.preventDefault(); // Allow dropping
        e.dataTransfer.dropEffect = 'copy';

        const target = e.target;
        const slot = target.closest('.slot');

        clearHighlights();
        if (slot && slot.children.length === 0) {
            slot.classList.add('hovered');
        }
    });

    boardEl.addEventListener('dragleave', (e) => {
        const slot = e.target.closest('.slot');
        if (slot) {
            slot.classList.remove('hovered');
        }
    });

    boardEl.addEventListener('drop', (e) => {
        e.preventDefault();
        clearHighlights();

        const type = e.dataTransfer.getData('text/plain');
        if (type !== 'new-block') return;

        // Find the closest slot
        const target = e.target;
        const slot = target.closest('.slot');

        if (slot) {
            addBlockToSlot(slot);
        }
    });

    // Touch support for mobile devices
    let dragClone = null;

    sourceBlock.addEventListener('touchstart', (e) => {
        e.preventDefault(); // Prevent scrolling
        const touch = e.touches[0];
        const rect = sourceBlock.getBoundingClientRect();

        // Create clone
        dragClone = sourceBlock.cloneNode(true);
        dragClone.style.position = 'fixed';
        dragClone.style.zIndex = '9999'; // Max z-index
        dragClone.style.pointerEvents = 'none'; // Necessary to detect element below
        dragClone.style.opacity = '0.9';
        dragClone.style.transform = 'scale(1.1)';
        dragClone.classList.remove('source-block');
        dragClone.style.width = `${rect.width}px`;
        dragClone.style.height = `${rect.height}px`;

        // Offset to show above finger
        const xOffset = rect.width / 2;
        const yOffset = rect.height * 1.5;

        dragClone.style.left = `${touch.clientX - xOffset}px`;
        dragClone.style.top = `${touch.clientY - yOffset}px`;

        document.body.appendChild(dragClone);
    }, { passive: false });

    document.addEventListener('touchmove', (e) => {
        if (!dragClone) return;
        e.preventDefault(); // Prevent scrolling
        const touch = e.touches[0];

        // Match initial offset logic
        const rect = dragClone.getBoundingClientRect();
        const xOffset = rect.width / 2;
        const yOffset = rect.height * 1.5;

        dragClone.style.left = `${touch.clientX - xOffset}px`;
        dragClone.style.top = `${touch.clientY - yOffset}px`;

        // Highlight logic for touch
        clearHighlights();
        const target = document.elementFromPoint(touch.clientX, touch.clientY);
        if (target) {
            const slot = target.closest('.slot');
            if (slot && slot.children.length === 0) {
                slot.classList.add('hovered');
            }
        }
    }, { passive: false });

    document.addEventListener('touchend', (e) => {
        if (!dragClone) return;
        clearHighlights();

        const touch = e.changedTouches[0];
        dragClone.remove();
        dragClone = null;

        // Check drop target at the finger position
        const target = document.elementFromPoint(touch.clientX, touch.clientY);

        if (target) {
            const slot = target.closest('.slot');
            if (slot) {
                addBlockToSlot(slot);
            }
        }
    });
}

function resetGame() {
    state.filled = {}; // This will be per-column count, derived from slots
    state.allComplete = false;
    victoryOverlay.classList.remove('show');
    trayEl.classList.remove('invisible');
    renderBoard();
}

function addBlockToSlot(slotEl) {
    if (state.allComplete) return;

    // Check if slot is empty
    if (slotEl.children.length > 0) return; // Already has a block

    // Create block
    const block = document.createElement('div');
    block.className = 'block placed';
    slotEl.appendChild(block);

    playSnapSound();

    // Check Column Completion
    const colIndex = parseInt(slotEl.dataset.col);
    checkColumnComplete(colIndex);
}

function checkColumnComplete(colIndex) {
    // Check all slots in this column
    const slotsContainer = document.querySelector(`.slots-container[data-col-index="${colIndex}"]`);
    if (!slotsContainer) return;

    const slots = slotsContainer.querySelectorAll('.slot');
    const totalSlots = slots.length;
    let filledCount = 0;

    slots.forEach(s => {
        if (s.children.length > 0) filledCount++;
    });

    // Update state
    if (!state.filled[colIndex]) state.filled[colIndex] = 0;
    state.filled[colIndex] = filledCount;

    if (filledCount === totalSlots) {
        // Only trigger if not already triggered? 
        const maru = document.getElementById(`maru-${colIndex}`);
        if (maru && !maru.classList.contains('show')) {
            setTimeout(() => {
                triggerColumnComplete(colIndex);
            }, 300);
        }
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
