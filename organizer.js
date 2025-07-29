// --- SCRIPT WITH SURGICAL DOWNLOAD & ALL FEATURES ---

const TOOLBAR_SELECTOR = 'ms-toolbar';
const CHAT_TURN_SELECTOR = 'ms-chat-turn';
const CHAT_CONTAINER_SELECTOR = 'ms-chat-session ms-autoscroll-container > div';

let isGroupModeActive = false;
let selectedChats = [];
let loadGroupsDebounceTimer;
let lastClickedChat = null;
let selectionAnchorIndex = null;

function waitForElement(selector, callback) {
    const max_tries = 20;
    let tries = 0;
    const interval = setInterval(() => {
        const element = document.querySelector(selector);
        if (element) {
            clearInterval(interval);
            callback(element);
        } else if (tries++ > max_tries) {
            clearInterval(interval);
            console.error('[Organizer] FATAL: Could not find target element:', selector);
        }
    }, 500);
}

function getPromptId() {
    const pathParts = window.location.pathname.split('/');
    if (pathParts[1] === 'prompts' && pathParts[2]) {
        return pathParts[2];
    }
    return null;
}

waitForElement(TOOLBAR_SELECTOR, injectUI);

function injectUI(targetToolbar) {
    if (!targetToolbar || document.getElementById('organizer-organize')) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200';
    document.head.appendChild(link);
    const buttons = {
        'Organize': toggleGroupMode, 'Group Chats': createGroup,
        'Expand All': expandAllGroups, 'Collapse All': collapseAllGroups,
        'Reset Organization': handleResetOrganization
    };
    Object.entries(buttons).forEach(([text, action]) => {
        const btn = document.createElement('button');
        const id = `organizer-${text.toLowerCase().replace(' ', '-')}`;
        btn.id = id;
        btn.textContent = text;
        if (id.includes('group-chats')) btn.style.display = 'none';
        btn.onclick = action;
        targetToolbar.appendChild(btn);
    });
    observeChatContainerAndLoadGroups();
}

function observeChatContainerAndLoadGroups() {
    const promptId = getPromptId();
    if (!promptId) {
        console.log("[Organizer] Not a saved prompt page. Persistence disabled.");
        return;
    }
    waitForElement(CHAT_CONTAINER_SELECTOR, (chatContainer) => {
        const observer = new MutationObserver(() => {
            clearTimeout(loadGroupsDebounceTimer);
            loadGroupsDebounceTimer = setTimeout(() => {
                console.log("[Organizer] Chats appear to have finished loading. Triggering loadGroups.");
                loadGroups();
                observer.disconnect();
            }, 750);
        });
        observer.observe(chatContainer, {childList: true, subtree: true});
        loadGroups();
    });
}

// --- COMPLETELY REWRITTEN & FIXED DOWNLOAD FUNCTION ---
function handleDownloadGroup(button) {
    const wrapper = button.closest('.organizer-group-wrapper');
    if (!wrapper) {
        console.warn('[Organizer] Could not find organizer-group-wrapper');
        return;
    }

    // Step 1: Smooth scroll to load virtual content
    const scrollToLoadAllContent = () => {
        return new Promise((resolve) => {
            const scrollStep = 300;
            let previousHeight = -1;
            let tries = 0;
            const maxTries = 30;

            const interval = setInterval(() => {
                wrapper.scrollTop += scrollStep;

                const currentHeight = wrapper.scrollHeight;
                const scrollEndReached = wrapper.scrollTop + wrapper.clientHeight >= currentHeight;

                if (currentHeight === previousHeight || scrollEndReached || tries++ > maxTries) {
                    clearInterval(interval);
                    console.log('[Organizer] Scroll complete or content fully loaded');
                    resolve();
                }

                previousHeight = currentHeight;
            }, 300);
        });
    };

    // Step 2: Wait for most turn contents to be populated
    const waitUntilMostTurnContentReady = () => {
        return new Promise((resolve, reject) => {
            const max_tries = 30;
            let tries = 0;
            const interval = setInterval(() => {
                const turns = wrapper.querySelectorAll('.chat-turn-container .turn-content');
                const readyCount = Array.from(turns).filter(el => el.textContent.trim().length > 0).length;
                const readinessRatio = turns.length > 0 ? readyCount / turns.length : 0;

                console.log(`[Organizer] Loaded ${readyCount}/${turns.length} turns (${Math.round(readinessRatio * 100)}%)`);

                if (readinessRatio >= 0.8) {
                    clearInterval(interval);
                    resolve();
                } else if (tries++ > max_tries) {
                    clearInterval(interval);
                    console.warn('[Organizer] Proceeding despite incomplete content');
                    resolve(); // Proceed anyway
                }
            }, 500);
        });
    };

    // Step 3: Do the download after waiting
    scrollToLoadAllContent().then(() => {
        return waitUntilMostTurnContentReady();
    }).then(() => {
        const groupNameSpan = wrapper.querySelector('.organizer-group-name');
        const groupName = groupNameSpan ? groupNameSpan.dataset.name : "Conversation";

        let conversationText = `Conversation from Group: ${groupName}\n\n================================\n\n`;

        const chatTurns = wrapper.querySelectorAll('.chat-turn-container');

        chatTurns.forEach(chat => {
            const turnContent = chat.querySelector('.turn-content');
            let text = "[Empty]";
            if (turnContent) {
                const chunks = turnContent.querySelectorAll('ms-text-chunk');
                text = chunks.length > 0
                    ? Array.from(chunks).map(c => c.textContent.trim()).join('\n')
                    : turnContent.textContent.trim();
            }

            const isUser = chat.classList.contains('user');
            const role = isUser ? "User" : "Model";
            const icon = isUser ? "👤" : "✨";

            conversationText += `${icon} ${role}:\n${text}\n\n================================\n\n`;
        });

        const blob = new Blob([conversationText], {type: 'text/plain;charset=utf-8'});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${groupName}.txt`;
        a.click();
        URL.revokeObjectURL(url);
    }).catch(err => {
        console.error('[Organizer]', err.message);
    });
}


// 🔧 Helper: Recursively extract text from DOM, skipping buttons
function extractAllText(node) {
    let text = '';

    if (node.nodeType === Node.TEXT_NODE) {
        text += node.textContent.trim();
    } else if (node.nodeType === Node.ELEMENT_NODE && node.tagName !== 'BUTTON') {
        node.childNodes.forEach(child => {
            text += extractAllText(child) + ' ';
        });
    }

    return text.trim();
}


function addGroupActionButtons(header, wrapper) {
    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'organizer-group-actions';
    const downloadBtn = document.createElement('button');
    downloadBtn.className = 'organizer-group-btn download-btn';
    downloadBtn.title = 'Download group conversation';
    downloadBtn.innerHTML = `<span class="material-symbols-outlined">download</span>`;
    downloadBtn.onclick = (event) => {
        event.stopPropagation();
        handleDownloadGroup(wrapper);
    };
    const renameBtn = document.createElement('button');
    renameBtn.className = 'organizer-group-btn rename-btn';
    renameBtn.title = 'Rename group';
    renameBtn.innerHTML = `<span class="material-symbols-outlined">edit</span>`;
    renameBtn.onclick = (event) => {
        event.stopPropagation();
        handleRenameGroup(wrapper);
    };
    const unorganizeBtn = document.createElement('button');
    unorganizeBtn.className = 'organizer-group-btn unorganize-btn';
    unorganizeBtn.title = 'Un-organise';
    unorganizeBtn.innerHTML = `<span class="material-symbols-outlined">list</span>`;
    unorganizeBtn.onclick = (event) => {
        event.stopPropagation();
        handleUnorganizeGroup(wrapper);
    };
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'organizer-group-btn delete-btn';
    deleteBtn.title = 'Delete group (removes from view)';
    deleteBtn.innerHTML = `<span class="material-symbols-outlined">delete</span>`;
    deleteBtn.onclick = (event) => {
        event.stopPropagation();
        handleDeleteGroup(wrapper);
    };
    actionsDiv.appendChild(downloadBtn);
    actionsDiv.appendChild(renameBtn);
    actionsDiv.appendChild(unorganizeBtn);
    actionsDiv.appendChild(deleteBtn);
    header.appendChild(actionsDiv);
}

function handleDeleteGroup(wrapper) {
    if (confirm("Are you sure you want to remove this group from your organized view? This will NOT delete the chats from your AI Studio history.")) {
        wrapper.remove();
        saveGroups();
    }
}

function handleResetOrganization() {
    const promptId = getPromptId();
    if (!promptId) {
        alert("This feature only works on a saved prompt.");
        return;
    }

    if (confirm("Are you sure you want to reset all organization for this prompt? All groups will be removed and chats will return to a flat list. This cannot be undone.")) {
        chrome.storage.local.get('organizerData', (result) => {
            const allData = result.organizerData || {};
            // Delete the data for the current prompt
            delete allData[promptId];
            chrome.storage.local.set({ organizerData: allData }, () => {
                console.log(`[Organizer] Organization data cleared for Prompt ID: ${promptId}`);
                alert("Organization has been reset. Reloading the page to apply changes.");
                // Hard reload to get a clean slate
                window.location.reload();
            });
        });
    }
}

function saveGroups() {
    const promptId = getPromptId();
    if (!promptId) return;
    const allChatsOnPage = Array.from(document.querySelectorAll(CHAT_TURN_SELECTOR));
    const groupsData = [];
    document.querySelectorAll('.organizer-group-wrapper').forEach(wrapper => {
        const groupNameSpan = wrapper.querySelector('.organizer-group-name');
        const groupName = groupNameSpan.dataset.name;
        const chatIndices = Array.from(wrapper.querySelectorAll(CHAT_TURN_SELECTOR)).map(chat => allChatsOnPage.indexOf(chat)).filter(index => index !== -1);
        groupsData.push({name: groupName, indices: chatIndices});
    });
    chrome.storage.local.get('organizerData', (result) => {
        const allData = result.organizerData || {};
        allData[promptId] = groupsData;
        chrome.storage.local.set({organizerData: allData}, () => {
            console.log(`[Organizer] Groups saved for Prompt ID: ${promptId}`);
        });
    });
}

function loadGroups() {
    const promptId = getPromptId();
    if (!promptId || document.querySelector('.organizer-group-wrapper')) return;
    chrome.storage.local.get('organizerData', (result) => {
        const allData = result.organizerData || {};
        const savedGroups = allData[promptId];
        if (!savedGroups || savedGroups.length === 0) return;
        const allChatsOnPage = Array.from(document.querySelectorAll(CHAT_TURN_SELECTOR));
        if (allChatsOnPage.length === 0) return;
        savedGroups.forEach(groupInfo => {
            const groupName = groupInfo.name;
            const chatsForThisGroup = groupInfo.indices.map(index => allChatsOnPage[index]).filter(Boolean);
            if (chatsForThisGroup.length > 0) {
                const firstChat = chatsForThisGroup[0];
                const parentContainer = firstChat.parentNode;
                if (!parentContainer) return;
                const wrapper = document.createElement('div');
                wrapper.className = 'organizer-group-wrapper';
                const header = document.createElement('div');
                header.className = 'organizer-group-header';
                const groupNameSpan = document.createElement('span');
                groupNameSpan.className = 'organizer-group-name';
                groupNameSpan.textContent = `▶ ${groupName}`;
                groupNameSpan.dataset.name = groupName;
                header.appendChild(groupNameSpan);
                addGroupActionButtons(header, wrapper);
                const content = document.createElement('div');
                content.className = 'organizer-group-content';
                content.style.display = 'none';
                wrapper.appendChild(header);
                wrapper.appendChild(content);
                parentContainer.insertBefore(wrapper, firstChat);
                chatsForThisGroup.forEach(chat => content.appendChild(chat));
                header.addEventListener('click', () => {
                    const isCollapsed = content.style.display === 'none';
                    content.style.display = isCollapsed ? 'block' : 'none';
                    groupNameSpan.textContent = `${isCollapsed ? '▼' : '▶'} ${groupNameSpan.dataset.name}`;
                });
            }
        });
    });
}

function createGroup() {
    if (selectedChats.length === 0) return;
    const groupName = prompt('Enter a name for this group:', 'My Investigation');
    if (!groupName || groupName.trim() === "") return;
    const firstChat = selectedChats[0];
    const parentContainer = firstChat.parentNode;
    const wrapper = document.createElement('div');
    wrapper.className = 'organizer-group-wrapper';
    const header = document.createElement('div');
    header.className = 'organizer-group-header';
    const groupNameSpan = document.createElement('span');
    groupNameSpan.className = 'organizer-group-name';
    groupNameSpan.textContent = `▶ ${groupName}`;
    groupNameSpan.dataset.name = groupName;
    header.appendChild(groupNameSpan);
    addGroupActionButtons(header, wrapper);
    const content = document.createElement('div');
    content.className = 'organizer-group-content';
    content.style.display = 'none';
    wrapper.appendChild(header);
    wrapper.appendChild(content);
    parentContainer.insertBefore(wrapper, firstChat);
    selectedChats.forEach(chat => content.appendChild(chat));
    header.addEventListener('click', () => {
        const isCollapsed = content.style.display === 'none';
        content.style.display = isCollapsed ? 'block' : 'none';
        groupNameSpan.textContent = `${isCollapsed ? '▼' : '▶'} ${groupNameSpan.dataset.name}`;
    });
    saveGroups();
    toggleGroupMode();
}

function handleChatClick(event) {
    if (!isGroupModeActive) return;
    event.stopPropagation();
    event.preventDefault();

    const clickedChat = event.currentTarget;
    // Rule: Do not allow selecting anything already inside a group.
    if (clickedChat.closest('.organizer-group-wrapper')) return;

    // Get a live list of all chats that are NOT already in a group.
    const availableChats = Array.from(document.querySelectorAll(CHAT_TURN_SELECTOR))
        .filter(chat => !chat.closest('.organizer-group-wrapper'));

    const clickedIndex = availableChats.indexOf(clickedChat);

    // If this is the first click in a selection sequence, set the anchor.
    if (selectionAnchorIndex === null) {
        selectionAnchorIndex = clickedIndex;
    }

    // Clear previous selection visually and from the array
    selectedChats = [];
    availableChats.forEach(chat => chat.classList.remove('organizer-selected'));

    // Determine the start and end of the continuous block
    const start = Math.min(selectionAnchorIndex, clickedIndex);
    const end = Math.max(selectionAnchorIndex, clickedIndex);

    // Select everything within the range
    for (let i = start; i <= end; i++) {
        const chatInRange = availableChats[i];
        selectedChats.push(chatInRange);
        chatInRange.classList.add('organizer-selected');
    }

    updateGroupButton();
}

function updateGroupButton() {
    const groupBtn = document.getElementById('organizer-group-chats');
    if (selectedChats.length > 0) {
        groupBtn.style.display = 'inline-block';
        groupBtn.textContent = `Group ${selectedChats.length} Chat(s)`;
    } else {
        groupBtn.style.display = 'none';
    }
}

function toggleGroupMode() {
    isGroupModeActive = !isGroupModeActive;
    const toggleBtn = document.getElementById('organizer-organize');
    const groupBtn = document.getElementById('organizer-group-chats');
    if (isGroupModeActive) {
        toggleBtn.textContent = 'Cancel';
        toggleBtn.style.backgroundColor = '#d93025';
        toggleBtn.style.color = '#ffffff';
        document.querySelectorAll(CHAT_TURN_SELECTOR).forEach(chat => chat.addEventListener('click', handleChatClick));
    } else {
        toggleBtn.textContent = 'Organize';
        toggleBtn.style.backgroundColor = '';
        toggleBtn.style.color = '';
        groupBtn.style.display = 'none';
        document.querySelectorAll(CHAT_TURN_SELECTOR).forEach(chat => chat.classList.remove('organizer-selected'));
        // Reset state completely on cancel
        selectedChats = [];
        selectionAnchorIndex = null;
    }
}

expandAllGroups = () => document.querySelectorAll('.organizer-group-wrapper').forEach(w => {
    const c = w.querySelector('.organizer-group-content'), s = w.querySelector('.organizer-group-name');
    if (c && s) {
        c.style.display = 'block';
        s.textContent = `▼ ${s.dataset.name}`;
    }
});
collapseAllGroups = () => document.querySelectorAll('.organizer-group-wrapper').forEach(w => {
    const c = w.querySelector('.organizer-group-content'), s = w.querySelector('.organizer-group-name');
    if (c && s) {
        c.style.display = 'none';
        s.textContent = `▶ ${s.dataset.name}`;
    }
});
handleRenameGroup = (w) => {
    const s = w.querySelector('.organizer-group-name');
    const n = prompt("New name:", s.dataset.name);
    if (n && n.trim()) {
        const e = s.textContent.trim().startsWith('▼');
        s.dataset.name = n.trim();
        s.textContent = `${e ? '▼' : '▶'} ${n.trim()}`;
        saveGroups();
    }
};
handleUnorganizeGroup = (w) => {
    const p = w.parentNode;
    w.querySelectorAll(CHAT_TURN_SELECTOR).forEach(c => p.insertBefore(c, w));
    w.remove();
    saveGroups();
};