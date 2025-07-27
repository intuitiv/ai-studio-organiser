// --- SCRIPT WITH CORRECTED GROUP CREATION LOGIC ---

const TOOLBAR_SELECTOR = 'ms-toolbar';
const CHAT_TURN_SELECTOR = 'ms-chat-turn';

let isGroupModeActive = false;
let selectedChats = [];

function waitForElement(selector, callback) {
    const max_tries = 20;
    let tries = 0;
    const interval = setInterval(() => {
        const element = document.querySelector(selector);
        if (element) {
            clearInterval(interval);
            callback();
        } else if (tries++ > max_tries) {
            clearInterval(interval);
            console.error('Organizer: Could not find the target element. Selector used:', selector);
        }
    }, 500);
}

waitForElement(TOOLBAR_SELECTOR, injectUI);

function injectUI() {
    const targetToolbar = document.querySelector(TOOLBAR_SELECTOR);
    if (!targetToolbar) return;
    if (document.getElementById('organizer-toggle-btn')) return;

    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200';
    document.head.appendChild(link);

    const toggleBtn = document.createElement('button');
    toggleBtn.id = 'organizer-toggle-btn';
    toggleBtn.textContent = 'Organize Chats';
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

    setTimeout(loadGroups, 1000); // Increased delay slightly for stability
}

function expandAllGroups() {
    document.querySelectorAll('.organizer-group-wrapper').forEach(wrapper => {
        const content = wrapper.querySelector('.organizer-group-content');
        const header = wrapper.querySelector('.organizer-group-header');
        const groupNameSpan = header.querySelector('.organizer-group-name');

        content.style.display = 'block';
        groupNameSpan.textContent = `▼ ${groupNameSpan.dataset.name}`;
    });
}

function collapseAllGroups() {
    document.querySelectorAll('.organizer-group-wrapper').forEach(wrapper => {
        const content = wrapper.querySelector('.organizer-group-content');
        const header = wrapper.querySelector('.organizer-group-header');
        const groupNameSpan = header.querySelector('.organizer-group-name');

        content.style.display = 'none';
        groupNameSpan.textContent = `▶ ${groupNameSpan.dataset.name}`;
    });
}

function addGroupActionButtons(header, wrapper) {
    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'organizer-group-actions';

    const unorganizeBtn = document.createElement('button');
    unorganizeBtn.className = 'organizer-group-btn unorganize-btn';
    unorganizeBtn.title = 'Un-organise';
    unorganizeBtn.innerHTML = `<span class="material-symbols-outlined">ungroup</span>`;
    unorganizeBtn.onclick = (event) => {
        event.stopPropagation();
        handleUnorganizeGroup(wrapper);
    };

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'organizer-group-btn delete-btn';
    deleteBtn.title = 'Delete group and chats';
    deleteBtn.innerHTML = `<span class="material-symbols-outlined">delete</span>`;
    deleteBtn.onclick = (event) => {
        event.stopPropagation();
        handleDeleteGroup(wrapper);
    };

    actionsDiv.appendChild(unorganizeBtn);
    actionsDiv.appendChild(deleteBtn);
    header.appendChild(actionsDiv);
}

function handleUnorganizeGroup(wrapper) {
    const parentContainer = wrapper.parentNode;
    const chatsToUnorganize = wrapper.querySelectorAll(CHAT_TURN_SELECTOR);

    chatsToUnorganize.forEach(chat => {
        parentContainer.insertBefore(chat, wrapper);
    });

    wrapper.remove();
    saveGroups();
}

function handleDeleteGroup(wrapper) {
    if (confirm("Are you sure you want to permanently delete this group and all of its chats? This action cannot be undone.")) {
        wrapper.remove();
        saveGroups();
    }
}

// --- THIS FUNCTION IS THE ONE THAT WAS FIXED ---
function createGroup() {
    if (selectedChats.length === 0) return;
    const groupName = prompt('Enter a name for this group:', 'My Investigation');
    if (!groupName) return;

    const firstChat = selectedChats[0];
    const parentContainer = firstChat.parentNode;

    // 1. Create all the new elements first
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

    // 2. CRITICAL FIX: Insert the empty group wrapper into the page BEFORE moving the chats.
    // The `firstChat` is used as a reference point for where to insert.
    parentContainer.insertBefore(wrapper, firstChat);

    // 3. NOW it is safe to move the chats from the main list into the new group.
    selectedChats.forEach(chat => {
        content.appendChild(chat);
    });

    // 4. Add the click handler for expanding/collapsing
    header.addEventListener('click', () => {
        const isCollapsed = content.style.display === 'none';
        content.style.display = isCollapsed ? 'block' : 'none';
        groupNameSpan.textContent = `${isCollapsed ? '▼' : '▶'} ${groupName}`;
    });

    saveGroups();
    toggleGroupMode();
}

// This function's logic was already correct, but it's included for completeness.
function loadGroups() {
    chrome.storage.local.get('savedGroups', (data) => {
        if (!data.savedGroups || data.savedGroups.length === 0) return;

        data.savedGroups.forEach(groupInfo => {
            const groupName = groupInfo.name;
            selectedChats = groupInfo.chats
                .map(id => document.getElementById(id))
                .filter(Boolean);

            if (selectedChats.length > 0) {
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

                // Logic here is correct: insert wrapper, THEN move chats.
                parentContainer.insertBefore(wrapper, firstChat);
                selectedChats.forEach(chat => content.appendChild(chat));

                header.addEventListener('click', () => {
                    const isCollapsed = content.style.display === 'none';
                    content.style.display = isCollapsed ? 'block' : 'none';
                    groupNameSpan.textContent = `${isCollapsed ? '▼' : '▶'} ${groupName}`;
                });
            }
        });
        selectedChats = [];
    });
}

function saveGroups() {
    const groupsData = [];
    document.querySelectorAll('.organizer-group-wrapper').forEach(wrapper => {
        const groupNameSpan = wrapper.querySelector('.organizer-group-name');
        const groupName = groupNameSpan.dataset.name;
        const chatIds = Array.from(wrapper.querySelectorAll(CHAT_TURN_SELECTOR)).map(chat => chat.id);
        groupsData.push({ name: groupName, chats: chatIds });
    });
    chrome.storage.local.set({ savedGroups: groupsData });
}

function toggleGroupMode() {
    isGroupModeActive = !isGroupModeActive;
    const toggleBtn = document.getElementById('organizer-toggle-btn');
    const groupBtn = document.getElementById('organizer-group-btn');
    if (isGroupModeActive) {
        toggleBtn.textContent = 'Cancel Organizing';
        toggleBtn.style.backgroundColor = '#d93025';
        document.querySelectorAll(CHAT_TURN_SELECTOR).forEach(chat => {
            chat.addEventListener('click', handleChatClick);
            chat.style.cursor = 'pointer';
        });
    } else {
        toggleBtn.textContent = 'Organize Chats';
        toggleBtn.style.backgroundColor = '#1a73e8';
        groupBtn.style.display = 'none';
        document.querySelectorAll(CHAT_TURN_SELECTOR).forEach(chat => {
            chat.removeEventListener('click', handleChatClick);
            chat.style.cursor = 'default';
            chat.classList.remove('organizer-selected');
        });
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