const state = {
    columns: 5, // Default 5 columns
    blockColor: '#3b82f6',
    blockSize: 30,
    blockShape: 'square', // square, circle
    blockType: 'single', // single, connected
    showSeparator: true, // show 'border' between slots vertically
    showColBoundary: false, // show lines between columns
    trayRandom: false, // randomize tray order
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
const shapeInputs = document.getElementsByName('block-shape'); // NodeList
const typeInputs = document.getElementsByName('block-type'); // NodeList
const sepInputs = document.getElementsByName('slot-separator'); // New
const colInputs = document.getElementsByName('col-boundary'); // New
const maxColInputs = document.getElementsByName('max-columns'); // New
const trayOrderInputs = document.getElementsByName('tray-order'); // New

function initAudio() {
    if (!audioCtx) {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (AudioContext) {
            audioCtx = new AudioContext();
        }
    }
}

// Resume AudioContext on user interaction for Mobile/iPad
const resumeAudio = () => {
    if (!audioCtx) initAudio();
    if (audioCtx && audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
};

document.addEventListener('touchstart', resumeAudio, { once: true });
document.addEventListener('click', resumeAudio, { once: true });

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
    renderTray(); // New function call
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

// Update Styles
function updateStyles() {
    root.style.setProperty('--block-color', state.blockColor);
    root.style.setProperty('--block-size', `${state.blockSize}px`);

    // Update board class for slot shapes
    if (state.blockShape === 'circle') {
        boardEl.classList.add('shape-circle');
    } else {
        boardEl.classList.remove('shape-circle');
    }



    // Determine visual mode
    // Merged Look (Continuous background): if Connected OR Separator is Hidden
    const useMergedLook = (state.blockType === 'connected' || !state.showSeparator);

    if (useMergedLook) {
        boardEl.classList.add('use-merged-look');
    } else {
        boardEl.classList.remove('use-merged-look');
    }

    // Show Inner Lines (Dividers): if Separator is Shown AND Merged Look is active
    // (If not Merged Look, standard slots have borders/gaps naturally)
    // Show Inner Lines (Dividers): if Separator is Shown AND Merged Look is active
    // (If not Merged Look, standard slots have borders/gaps naturally)
    if (state.showSeparator && useMergedLook) {
        boardEl.classList.add('show-inner-lines');
    } else {
        boardEl.classList.remove('show-inner-lines');
    }

    // Show lines between columns
    if (state.showColBoundary) {
        boardEl.classList.add('show-col-boundary');
    } else {
        boardEl.classList.remove('show-col-boundary');
    }

    // Update block shapes
    const blocks = document.querySelectorAll('.block, .draggable-block');
    blocks.forEach(b => {
        if (state.blockShape === 'circle') b.classList.add('circle');
        else b.classList.remove('circle');
    });

    // Update connected logic in tray? redrawn by renderTray
}

function renderTray() {
    trayEl.innerHTML = '';

    if (state.blockType === 'single') {
        const block = document.createElement('div');
        block.className = 'draggable-block source-block';
        if (state.blockShape === 'circle') block.classList.add('circle');
        block.draggable = true;
        block.dataset.size = 1;
        trayEl.appendChild(block);
    } else {
        // Connected: Show blocks of size 1 to N (columns)
        let sizes = [];
        for (let i = 1; i <= state.columns; i++) sizes.push(i);

        if (state.trayRandom) {
            // Shuffle
            for (let i = sizes.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [sizes[i], sizes[j]] = [sizes[j], sizes[i]];
            }
        }

        sizes.forEach(i => {
            const container = document.createElement('div');
            container.className = 'connected-block-container';

            // Create a compound block
            const block = document.createElement('div');
            block.className = 'draggable-block source-block connected';
            if (state.blockShape === 'circle') block.classList.add('circle');
            block.draggable = true;
            block.dataset.size = i;

            // Visual height
            const gap = 8;
            block.style.height = `calc(var(--block-size) * ${i} + ${gap}px * ${i - 1})`;

            // Internal structure for consistency (invisible but structural)
            for (let k = 0; k < i; k++) {
                const sub = document.createElement('div');
                sub.className = 'sub-block';
                block.appendChild(sub);
            }

            container.appendChild(block);

            // Label
            const label = document.createElement('span');
            label.textContent = i;
            container.appendChild(label);

            trayEl.appendChild(container);
        });
    }
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

// Re-attach listeners for new source blocks
function setupTrayListeners() {
    const sourceBlocks = document.querySelectorAll('.source-block');
    sourceBlocks.forEach(b => {
        b.addEventListener('dragstart', handleDragStart);
        // Touch events need to be re-attached too
        b.addEventListener('touchstart', handleTouchStart, { passive: false });
    });
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

    shapeInputs.forEach(input => {
        input.addEventListener('change', (e) => {
            state.blockShape = e.target.value;
            updateStyles();
            renderTray();
            setupTrayListeners(); // Re-bind
            resetGame();
        });
    });

    typeInputs.forEach(input => {
        input.addEventListener('change', (e) => {
            state.blockType = e.target.value;
            updateStyles(); // Update board class
            renderTray();
            setupTrayListeners(); // Re-bind
            resetGame();
        });
    });

    sepInputs.forEach(input => {
        input.addEventListener('change', (e) => {
            state.showSeparator = (e.target.value === 'show');
            updateStyles();
            resetGame();
        });
    });

    colInputs.forEach(input => {
        input.addEventListener('change', (e) => {
            state.showColBoundary = (e.target.value === 'show');
            updateStyles();
            resetGame();
        });
    });

    maxColInputs.forEach(input => {
        input.addEventListener('change', (e) => {
            const val = parseInt(e.target.value);
            state.columns = val;

            // Auto-resize for mobile usability
            if (val === 10) {
                state.blockSize = 30; // Smaller size for 10 columns
                sizeInput.value = 30;
            }
            updateStyles();

            // Re-render everything
            renderTray();
            resetGame();
            adjustBoardScale();
        });
    });

    trayOrderInputs.forEach(input => {
        input.addEventListener('change', (e) => {
            state.trayRandom = (e.target.value === 'random');
            renderTray();
            setupTrayListeners();
            // No reset game needed, just reshuffle tray
        });
    });

    // Initial Tray Listeners
    setupTrayListeners();

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

        // Retrieve size
        let size = parseInt(dragSize || 1); // Use global or assume 1

        if (state.blockType === 'connected') {
            // Gravity Logic: Target is the lowest empty slot in the column
            // Highlight ALL slots that would be filled.
            if (slot) {
                const colIndex = parseInt(slot.dataset.col);
                const targetSlots = getGravityTargetSlots(colIndex, size);

                if (targetSlots) {
                    targetSlots.forEach(s => s.classList.add('hovered'));
                }
            }
        } else {
            // Standard exact logic
            if (slot && slot.children.length === 0) {
                slot.classList.add('hovered');
            }
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

        // Retrieve size
        const size = parseInt(e.dataTransfer.getData('application/x-block-size') || 1);

        if (slot) {
            if (state.blockType === 'connected') {
                // Gravity Drop
                const colIndex = parseInt(slot.dataset.col);
                const targetSlots = getGravityTargetSlots(colIndex, size);
                if (targetSlots) {
                    // Use the lowest slot as the anchor for addBlockToSlot
                    // targetSlots[0] should be the bottom-most one (lowest row index)
                    // But our array from getGravityTargetSlots is sorted by row index ascending?
                    // Let's check getGravityTargetSlots implementation below.
                    addBlockToSlot(targetSlots[0], size, true); // true = avoid re-check
                }
            } else {
                addBlockToSlot(slot, size);
            }
        }
    });

    // Touch support for mobile devices

    // Moved to handleTouchStart/Move/End functions for reusability
}

let dragClone = null;
let dragSize = 1;

function handleDragStart(e) {
    e.dataTransfer.setData('text/plain', 'new-block');
    e.dataTransfer.setData('application/x-block-size', e.target.dataset.size || 1);
    e.dataTransfer.effectAllowed = 'copy';
    dragSize = parseInt(e.target.dataset.size || 1);
}

function handleTouchStart(e) {
    e.preventDefault(); // Prevent scrolling
    const sourceBlock = e.target.closest('.source-block');
    if (!sourceBlock) return;

    // Init audio on first touch
    if (!audioCtx) initAudio();
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();

    dragSize = parseInt(sourceBlock.dataset.size || 1);

    const touch = e.touches[0];
    const rect = sourceBlock.getBoundingClientRect();

    // Create clone
    dragClone = sourceBlock.cloneNode(true);
    dragClone.style.position = 'fixed';
    dragClone.style.zIndex = '9999';
    dragClone.style.pointerEvents = 'none';
    dragClone.style.opacity = '0.9';
    dragClone.style.transform = 'scale(1.1)';
    dragClone.style.willChange = 'transform, left, top'; // Force GPU layer on iPad
    dragClone.style.width = `${rect.width}px`;
    dragClone.style.height = `${rect.height}px`;
    // Ensure background color is visible (in case CSS class is lost)
    dragClone.style.backgroundColor = state.blockColor;
    dragClone.style.borderRadius = state.blockShape === 'circle' ? `${state.blockSize / 2}px` : '4px';
    dragClone.style.boxShadow = '2px 4px 10px rgba(0,0,0,0.4)';

    // Center block on finger position
    const xOffset = rect.width / 2;
    const yOffset = rect.height / 2;

    dragClone.style.left = `${touch.clientX - xOffset}px`;
    dragClone.style.top = `${touch.clientY - yOffset}px`;

    document.body.appendChild(dragClone);
}

// Add these to document event listeners in setupEventListeners or init, 
// but since they are document level, we can just leave them in setupEventListeners 
// OR refactor because we removed them from the big function.
// Let's add them back to document level.

document.addEventListener('touchmove', (e) => {
    if (!dragClone) return;
    e.preventDefault(); // Prevent scrolling
    const touch = e.touches[0];

    // Center block on finger position
    const rect = dragClone.getBoundingClientRect();
    const xOffset = rect.width / 2;
    const yOffset = rect.height / 2;

    dragClone.style.left = `${touch.clientX - xOffset}px`;
    dragClone.style.top = `${touch.clientY - yOffset}px`;

    // Highlight logic for touch
    clearHighlights();
    const target = document.elementFromPoint(touch.clientX, touch.clientY);
    if (target) {
        const slot = target.closest('.slot');
        if (slot) {
            if (state.blockType === 'connected') {
                const colIndex = parseInt(slot.dataset.col);
                const targetSlots = getGravityTargetSlots(colIndex, dragSize);
                if (targetSlots) {
                    targetSlots.forEach(s => s.classList.add('hovered'));
                }
            } else if (slot.children.length === 0) {
                slot.classList.add('hovered');
            }
        }
    }
}, { passive: false });

document.addEventListener('touchend', (e) => {
    if (!dragClone) return;
    // clearHighlights(); // Keep highlight for a moment? No.

    const touch = e.changedTouches[0];
    dragClone.remove();
    dragClone = null;

    // Check drop target at the finger position
    const target = document.elementFromPoint(touch.clientX, touch.clientY);

    if (target) {
        const slot = target.closest('.slot');
        if (slot) {
            if (state.blockType === 'connected') {
                const colIndex = parseInt(slot.dataset.col);
                const targetSlots = getGravityTargetSlots(colIndex, dragSize);
                if (targetSlots) {
                    addBlockToSlot(targetSlots[0], dragSize, true);
                }
            } else {
                addBlockToSlot(slot, dragSize);
            }
        }
    }
    clearHighlights();
});

function clearHighlights() {
    document.querySelectorAll('.slot.hovered').forEach(el => el.classList.remove('hovered'));
}

/* 
   We need to remove the old touch listeners from setupEventListeners 
   because we moved them to global scope or named functions. 
   The replacement block above covered 'dragstart' logic but left 
   the old big chunk of touch logic in the 'setupEventListeners' 
   which we replaced partially. 
   Wait, I replaced 'dragstart' ... 'addBlockToSlot' call in the previous chunk.
   The 'Touch support' section was inside setupEventListeners. I must ensure I don't duplicate.
*/


function resetGame() {
    state.filled = {}; // This will be per-column count, derived from slots
    state.allComplete = false;
    victoryOverlay.classList.remove('show');
    trayEl.classList.remove('invisible');
    document.querySelectorAll('.source-block').forEach(b => b.classList.remove('invisible'));
    renderBoard();
}

function getGravityTargetSlots(colIndex, size) {
    const slotsContainer = document.querySelector(`.slots-container[data-col-index="${colIndex}"]`);
    if (!slotsContainer) return null;

    const slots = Array.from(slotsContainer.querySelectorAll('.slot'));
    // Sort by row index just in case (0 is bottom)
    slots.sort((a, b) => parseInt(a.dataset.row) - parseInt(b.dataset.row));

    // Find the first empty slot (lowest index)
    let firstEmptyIndex = -1;
    for (let i = 0; i < slots.length; i++) {
        if (slots[i].children.length === 0) {
            firstEmptyIndex = i;
            break;
        }
    }

    if (firstEmptyIndex === -1) return null; // Column full

    // Check if we have enough space (size) starting from firstEmptyIndex
    // We need [firstEmptyIndex, firstEmptyIndex + 1, ..., firstEmptyIndex + size - 1]
    const targetSlots = [];
    for (let k = 0; k < size; k++) {
        const index = firstEmptyIndex + k;
        if (index >= slots.length) return null; // Not enough space
        if (slots[index].children.length > 0) return null; // Should not happen if finding first empty, unless gaps?

        targetSlots.push(slots[index]);
    }

    return targetSlots;
}

function addBlockToSlot(slotEl, size = 1, skipValidation = false) {
    if (state.allComplete) return;

    const colIndex = parseInt(slotEl.dataset.col);
    const rowIndex = parseInt(slotEl.dataset.row);

    // Validate if we have enough space
    // We need 'size' contiguous slots starting from 'rowIndex' upwards
    // Note: Visual slots are usually ordered bottom-up in the DOM? 
    // Wait, in renderBoard:
    // for (let j = 0; j < i; j++) { ... slot.dataset.row = j ... appendChild }
    // So j=0 is first child, j=i-1 is last child.
    // CSS Flexbox defaults: row (horizontal) or column (vertical).
    // .slots-container usually has 'flex-direction: column-reverse' to stack bottom up?
    // Let's check style.css later. Assuming standard order 0..N.

    // We need to check if slots [row, row+1, ..., row+size-1] exist and are empty.
    const container = slotEl.parentElement;
    const slots = Array.from(container.children); // All slots in this column

    // Find the slots we need
    // Find the slots we need
    const targetSlots = [];

    if (state.blockType === 'single' || !skipValidation) {
        // Exact position check
        for (let k = 0; k < size; k++) {
            const neededRow = rowIndex + k;
            const found = slots.find(s => parseInt(s.dataset.row) === neededRow);

            if (!found) return;
            if (found.children.length > 0) return;

            targetSlots.push(found);
        }
    } else {
        // Connected Gravity (Validated by caller, but let's re-fetch safely)
        // We assume slotEl is the bottom-most valid slot
        for (let k = 0; k < size; k++) {
            const neededRow = rowIndex + k;
            const found = slots.find(s => parseInt(s.dataset.row) === neededRow);
            if (found) targetSlots.push(found);
        }
    }

    // All clear, modify the DOM
    // For 'Connected', do we spawn one tall block or N small blocks?
    // The request says "rectangles of different heights corresponding to the number".
    // So one tall block is better.

    if (state.blockType === 'single') {
        // Should only be size 1 ideally, but loop just in case
        targetSlots.forEach(s => {
            spawnBlockInSlot(s, 1);
        });
    } else {
        // Connected: Spawn one big block in the first slot, 
        // but it needs to visually cover the others.
        // CSS Grid or Absolute positioning? 
        // Simplest: inner div that has height = size * unit + gaps

        const baseSlot = targetSlots[0];
        spawnBlockInSlot(baseSlot, size);

        // Mark other slots as 'occupied' invisibly? 
        // If we just put the big block in the first slot, the other slots are technically empty.
        // So we should probably fill them with 'phantom' blocks or data attribute
        // to prevent other blocks being dropped there.
        for (let k = 1; k < size; k++) {
            const filler = document.createElement('div');
            filler.className = 'block-spacer'; // Invisible filler
            filler.style.display = 'none'; // Or just visibility hidden
            // But if we use 'children.length > 0' check, any child is enough.
            targetSlots[k].appendChild(filler);
        }

        // Hide the source block from tray
        const sourceBlock = trayEl.querySelector(`.draggable-block.source-block[data-size="${size}"]`);
        if (sourceBlock) {
            sourceBlock.classList.add('invisible');
        }
    }

    playSnapSound();
    checkColumnComplete(colIndex);
}

function spawnBlockInSlot(slot, size) {
    const block = document.createElement('div');
    block.className = 'block placed'; // Base class
    if (state.blockShape === 'circle') block.classList.add('circle');
    if (size > 1) {
        block.classList.add('connected');
        // Set explicit height to match the slots + gaps
        const gap = 8;
        block.style.height = `calc(var(--block-size) * ${size} + ${gap}px * ${size - 1})`;
    }

    slot.appendChild(block);
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
