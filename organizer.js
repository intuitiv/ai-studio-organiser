// --- FINAL, MORE ROBUST SCRIPT ---

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
            console.error('Organizer: Could not find the target element to inject UI. Selector used:', selector);
        }
    }, 500);
}

waitForElement(TOOLBAR_SELECTOR, injectUI);

function injectUI() {
    const targetToolbar = document.querySelector(TOOLBAR_SELECTOR);
    if (!targetToolbar) return;

    if (document.getElementById('organizer-toggle-btn')) return;

    const toggleBtn = document.createElement('button');
    toggleBtn.id = 'organizer-toggle-btn';
    toggleBtn.textContent = 'Organize Chats';
    toggleBtn.onclick = toggleGroupMode;
    targetToolbar.appendChild(toggleBtn);

    const groupBtn = document.createElement('button');
    groupBtn.id = 'organizer-group-btn';
    groupBtn.textContent = 'Group Chats';
    groupBtn.onclick = createGroup;
    targetToolbar.appendChild(groupBtn);

    setTimeout(loadGroups, 1000); // Increased delay to ensure chats are fully rendered
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

function createGroup() {
    if (selectedChats.length === 0) return;
    const groupName = prompt('Enter a name for this group:', 'My Investigation');
    if (!groupName) return;

    const firstChat = selectedChats[0];
    const parentContainer = firstChat.parentNode;

    const wrapper = document.createElement('div');
    wrapper.className = 'organizer-group-wrapper';

    const header = document.createElement('div');
    header.className = 'organizer-group-header';
    header.innerHTML = `<span class="organizer-arrow">▶</span> <span class="organizer-title">${groupName}</span>`;

    wrapper.appendChild(header);
    parentContainer.insertBefore(wrapper, firstChat);

    const chatIds = selectedChats.map(chat => chat.id);
    header.dataset.chatIds = JSON.stringify(chatIds);

    selectedChats.forEach(chat => {
        chat.style.display = 'none'; // Hide the original chats
    });

    header.addEventListener('click', () => toggleGroupVisibility(header));

    saveGroups();
    toggleGroupMode();
}

function toggleGroupVisibility(header) {
    const arrow = header.querySelector('.organizer-arrow');
    const isCollapsed = arrow.textContent.includes('▶');
    const chatIds = JSON.parse(header.dataset.chatIds);

    chatIds.forEach(id => {
        const chatElement = document.getElementById(id);
        if (chatElement) {
            chatElement.style.display = isCollapsed ? 'flex' : 'none';
        }
    });
    
    arrow.textContent = isCollapsed ? '▼' : '▶';
}

function saveGroups() {
    const groupsData = [];
    document.querySelectorAll('.organizer-group-header').forEach(header => {
        const groupName = header.querySelector('.organizer-title').textContent;
        const chatIds = JSON.parse(header.dataset.chatIds);
        groupsData.push({ name: groupName, chats: chatIds });
    });
    chrome.storage.local.set({ savedGroups: groupsData });
}

async function loadGroups() {
    const data = await chrome.storage.local.get('savedGroups');
    if (!data.savedGroups || data.savedGroups.length === 0) return;

    data.savedGroups.forEach(groupInfo => {
        const chatElements = groupInfo.chats
            .map(id => document.getElementById(id))
            .filter(Boolean);
        
        if (chatElements.length > 0) {
            const firstChat = chatElements[0];
            const parentContainer = firstChat.parentNode;
            
            const wrapper = document.createElement('div');
            wrapper.className = 'organizer-group-wrapper';

            const header = document.createElement('div');
            header.className = 'organizer-group-header';
            header.innerHTML = `<span class="organizer-arrow">▶</span> <span class="organizer-title">${groupInfo.name}</span>`;
            header.dataset.chatIds = JSON.stringify(groupInfo.chats);

            wrapper.appendChild(header);
            parentContainer.insertBefore(wrapper, firstChat);

            chatElements.forEach(chat => {
                chat.style.display = 'none';
            });

            header.addEventListener('click', () => toggleGroupVisibility(header));
        }
    });
}