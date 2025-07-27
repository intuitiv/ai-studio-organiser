// --- SCRIPT WITH FINAL PERSISTENCE ARCHITECTURE (PROMPT-ID BASED) ---

const TOOLBAR_SELECTOR = 'ms-toolbar';
const CHAT_TURN_SELECTOR = 'ms-chat-turn';
const CHAT_CONTAINER_SELECTOR = 'ms-chat-session ms-autoscroll-container > div';

let isGroupModeActive = false;
let selectedChats = [];

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function waitForElement(selector, callback) {
    const max_tries = 20; let tries = 0;
    const interval = setInterval(() => {
        const element = document.querySelector(selector);
        if (element) { clearInterval(interval); callback(element); }
        else if (tries++ > max_tries) {
            clearInterval(interval);
            console.error('[Organizer] FATAL: Could not find target element to start extension:', selector);
        }
    }, 500);
}

// --- NEW HELPER: Gets the unique ID from the URL ---
function getPromptId() {
    const pathParts = window.location.pathname.split('/');
    if (pathParts[1] === 'prompts' && pathParts[2]) {
        return pathParts[2];
    }
    return null; // Not on a saved prompt page
}

waitForElement(TOOLBAR_SELECTOR, injectUI);

function injectUI(targetToolbar) {
    if (!targetToolbar || document.getElementById('organizer-toggle-btn')) return;

    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200';
    document.head.appendChild(link);

    const toggleBtn = document.createElement('button');
    toggleBtn.id = 'organizer-toggle-btn';
    toggleBtn.textContent = 'Organize';
    toggleBtn.onclick = toggleGroupMode;

    const groupBtn = document.createElement('button');
    groupBtn.id = 'organizer-group-btn';
    groupBtn.textContent = 'Group Chats';
    groupBtn.onclick = createGroup;

    const expandAllBtn = document.createElement('button');
    expandAllBtn.id = 'organizer-expand-all';
    expandAllBtn.textContent = 'Expand All';
    expandAllBtn.onclick = expandAllGroups;

    const collapseAllBtn = document.createElement('button');
    collapseAllBtn.id = 'organizer-collapse-all';
    collapseAllBtn.textContent = 'Collapse All';
    collapseAllBtn.onclick = collapseAllGroups;

    targetToolbar.appendChild(toggleBtn);
    targetToolbar.appendChild(groupBtn);
    targetToolbar.appendChild(expandAllBtn);
    targetToolbar.appendChild(collapseAllBtn);

    observeChatContainerAndLoadGroups();
}

function observeChatContainerAndLoadGroups() {
    const promptId = getPromptId();
    if (!promptId) {
        console.log("[Organizer] Not on a saved prompt page. Persistence is disabled.");
        return;
    }

    waitForElement(CHAT_CONTAINER_SELECTOR, (chatContainer) => {
        const observer = new MutationObserver((mutationsList, obs) => {
            for (const mutation of mutationsList) {
                if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                    const hasChatTurn = Array.from(mutation.addedNodes).some(node => node.tagName === 'MS-CHAT-TURN');
                    if(hasChatTurn) {
                        console.log("[Organizer] 'Patient Watcher' detected chats. Triggering loadGroups.");
                        loadGroups();
                        obs.disconnect();
                        return;
                    }
                }
            }
        });
        observer.observe(chatContainer, { childList: true, subtree: true });
        console.log("[Organizer] Initial check for chats...");
        loadGroups();
    });
}

// --- NEW: SAVEGROUPS IS NOW PROMPT-AWARE AND USES INDICES ---
function saveGroups() {
    const promptId = getPromptId();
    if (!promptId) return; // Can't save if we don't have a key

    const allChatsOnPage = Array.from(document.querySelectorAll(CHAT_TURN_SELECTOR));
    const groupsData = [];

    document.querySelectorAll('.organizer-group-wrapper').forEach(wrapper => {
        const groupNameSpan = wrapper.querySelector('.organizer-group-name');
        const groupName = groupNameSpan.dataset.name;

        // Instead of saving IDs, save the INDEX of each chat in the overall list
        const chatIndices = Array.from(wrapper.querySelectorAll(CHAT_TURN_SELECTOR))
            .map(chat => allChatsOnPage.indexOf(chat));

        groupsData.push({ name: groupName, indices: chatIndices });
    });

    chrome.storage.local.get('organizerData', (result) => {
        const allData = result.organizerData || {};
        allData[promptId] = groupsData;
        chrome.storage.local.set({ organizerData: allData }, () => {
            console.log(`[Organizer] Groups saved for Prompt ID: ${promptId}`, groupsData);
        });
    });
}


// --- NEW: LOADGROUPS IS NOW PROMPT-AWARE AND USES INDICES ---
function loadGroups() {
    const promptId = getPromptId();
    if (!promptId) return;

    if (document.querySelector('.organizer-group-wrapper')) return;

    chrome.storage.local.get('organizerData', (result) => {
        const allData = result.organizerData || {};
        const savedGroups = allData[promptId];

        if (!savedGroups || savedGroups.length === 0) {
            console.log(`[Organizer] No saved groups found for Prompt ID: ${promptId}`);
            return;
        }

        console.log(`[Organizer] Found saved groups for Prompt ID: ${promptId}. Rebuilding...`, savedGroups);
        const allChatsOnPage = Array.from(document.querySelectorAll(CHAT_TURN_SELECTOR));

        if (allChatsOnPage.length === 0) {
            console.warn("[Organizer] Saved groups exist, but no chats are on the page yet. Aborting.");
            return;
        }

        savedGroups.forEach(groupInfo => {
            const groupName = groupInfo.name;

            // Rebuild the selection using the saved indices
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

// --- SIMPLIFIED DELETE: Removes from view and saves the new state ---
function handleDeleteGroup(wrapper) {
    if (confirm("Are you sure you want to remove this group and its chats from your organized view? This will NOT delete the chats from your AI Studio history.")) {
        wrapper.remove();
        saveGroups();
    }
}

// All other functions are unchanged but included for completeness.
function addGroupActionButtons(header, wrapper) {
    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'organizer-group-actions';
    const renameBtn = document.createElement('button');
    renameBtn.className = 'organizer-group-btn rename-btn';
    renameBtn.title = 'Rename group';
    renameBtn.innerHTML = `<span class="material-symbols-outlined">edit</span>`;
    renameBtn.onclick = (event) => { event.stopPropagation(); handleRenameGroup(wrapper); };
    const unorganizeBtn = document.createElement('button');
    unorganizeBtn.className = 'organizer-group-btn unorganize-btn';
    unorganizeBtn.title = 'Un-organise';
    unorganizeBtn.innerHTML = `<span class="material-symbols-outlined">list</span>`;
    unorganizeBtn.onclick = (event) => { event.stopPropagation(); handleUnorganizeGroup(wrapper); };
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'organizer-group-btn delete-btn';
    deleteBtn.title = 'Delete group';
    deleteBtn.innerHTML = `<span class="material-symbols-outlined">delete</span>`;
    deleteBtn.onclick = (event) => { event.stopPropagation(); handleDeleteGroup(wrapper); };
    actionsDiv.appendChild(renameBtn);
    actionsDiv.appendChild(unorganizeBtn);
    actionsDiv.appendChild(deleteBtn);
    header.appendChild(actionsDiv);
}
function toggleGroupMode() {
    isGroupModeActive = !isGroupModeActive;
    const toggleBtn = document.getElementById('organizer-toggle-btn');
    const groupBtn = document.getElementById('organizer-group-btn');
    if (isGroupModeActive) {
        toggleBtn.textContent = 'Cancel';
        toggleBtn.style.backgroundColor = '#d93025';
        document.querySelectorAll(CHAT_TURN_SELECTOR).forEach(chat => chat.addEventListener('click', handleChatClick));
    } else {
        toggleBtn.textContent = 'Organize';
        toggleBtn.style.backgroundColor = '#1a73e8';
        groupBtn.style.display = 'none';
        document.querySelectorAll(CHAT_TURN_SELECTOR).forEach(chat => chat.classList.remove('organizer-selected'));
        selectedChats = [];
    }
}
function handleChatClick(event) {
    if (!isGroupModeActive) return;
    event.stopPropagation();
    event.preventDefault();
    const chatElement = event.currentTarget;
    if (chatElement.closest('.organizer-group-wrapper')) return;
    const index = selectedChats.indexOf(chatElement);
    if (index > -1) {
        selectedChats.splice(index, 1);
        chatElement.classList.remove('organizer-selected');
    } else {
        selectedChats.push(chatElement);
        chatElement.classList.add('organizer-selected');
    }
    const groupBtn = document.getElementById('organizer-group-btn');
    if (selectedChats.length > 0) {
        groupBtn.style.display = 'inline-block';
        groupBtn.textContent = `Group ${selectedChats.length} Chat(s)`;
    } else {
        groupBtn.style.display = 'none';
    }
}
expandAllGroups = () => document.querySelectorAll('.organizer-group-wrapper').forEach(w => { const c = w.querySelector('.organizer-group-content'), s = w.querySelector('.organizer-group-name'); if (c && s) { c.style.display='block'; s.textContent=`▼ ${s.dataset.name}`; }});
collapseAllGroups = () => document.querySelectorAll('.organizer-group-wrapper').forEach(w => { const c = w.querySelector('.organizer-group-content'), s = w.querySelector('.organizer-group-name'); if (c && s) { c.style.display='none'; s.textContent=`▶ ${s.dataset.name}`; }});
handleRenameGroup = (w) => { const s = w.querySelector('.organizer-group-name'); const n = prompt("New name:", s.dataset.name); if(n&&n.trim()){ const e=s.textContent.trim().startsWith('▼'); s.dataset.name = n.trim(); s.textContent = `${e?'▼':'▶'} ${n.trim()}`; saveGroups(); }};
handleUnorganizeGroup = (w) => { const p = w.parentNode; w.querySelectorAll(CHAT_TURN_SELECTOR).forEach(c=>p.insertBefore(c,w)); w.remove(); saveGroups(); };