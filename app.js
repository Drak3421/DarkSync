// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyCJSf__L4LqkL376Y6psdDv91FOkMQDpcE",
  authDomain: "darksync-75891.firebaseapp.com",
  projectId: "darksync-75891",
  storageBucket: "darksync-75891.firebasestorage.app",
  messagingSenderId: "679911358092",
  appId: "1:679911358092:web:35fadff9308281bc2085a9"
};

// Current active profile role
let currentProfile = null;
let useFirebase = false;
let db = null;

// Profile custom properties mapping (defaults)
let customProfiles = {
    "Dad": { member: "Ajay Yadav", avatar: "https://api.dicebear.com/7.x/bottts/svg?seed=Ajay" },
    "Mom": { member: "Poonam Yadav", avatar: "https://api.dicebear.com/7.x/bottts/svg?seed=Poonam" },
    "Child 1": { member: "Naman", avatar: "https://api.dicebear.com/7.x/bottts/svg?seed=Naman" },
    "Child 2": { member: "Muskan", avatar: "https://api.dicebear.com/7.x/bottts/svg?seed=Muskan" }
};

// Local Fallback Storage Cache
let localTasks = JSON.parse(localStorage.getItem('family_sync_tasks')) || [];
let localMessages = JSON.parse(localStorage.getItem('family_sync_messages')) || [];

// Initialize App
document.addEventListener('DOMContentLoaded', () => {
    initFirebase();
    setupEventListeners();
    
    // Initialize Theme
    const currentTheme = localStorage.getItem('family_sync_theme') || 'dark';
    if (currentTheme === 'light') {
        document.body.classList.add('light-theme');
        const themeIcon = document.querySelector('#themeToggleBtn i');
        if (themeIcon) {
            themeIcon.className = 'fa-solid fa-sun';
        }
    }
});

// Try to initialize Firebase
function initFirebase() {
    if (typeof firebase !== 'undefined' && firebaseConfig.apiKey !== 'YOUR_API_KEY') {
        try {
            firebase.initializeApp(firebaseConfig);
            // Silent anonymous authentication for database security in production mode
            firebase.auth().signInAnonymously().catch(err => {
                console.warn("Anonymous login failed: ", err);
            });
            db = firebase.firestore();
            useFirebase = true;
            console.log('Firebase Realtime Sync Activated!');
        } catch (e) {
            console.warn('Firebase failed to initialize, falling back to Local Storage mode.', e);
        }
    } else {
        console.log('Firebase config not set. Running in Local Storage offline mode.');
    }

    // Start listening to profiles sync
    syncProfiles();
}

// Set up UI events
function setupEventListeners() {
    // Profile Selection Cards
    document.querySelectorAll('.profile-card').forEach(card => {
        card.addEventListener('click', () => {
            const role = card.dataset.role;
            selectProfile(role);
        });
    });

    // Profile Switch Button
    document.getElementById('switchProfileBtn').addEventListener('click', showProfileSelector);

    // Active Badge Edit profile click
    document.getElementById('activeProfileBadge').addEventListener('click', openEditProfileModal);

    // Cancel / Save Edit Profile
    document.getElementById('cancelEditProfileBtn').addEventListener('click', closeEditProfileModal);
    document.getElementById('saveProfileBtn').addEventListener('click', saveProfileChanges);

    // Edit avatar preview listener
    document.getElementById('editAvatarUrl').addEventListener('input', updateAvatarPreview);

    // Form Submissions
    document.getElementById('taskForm').addEventListener('submit', handleAddTask);
    document.getElementById('chatForm').addEventListener('submit', handleSendMessage);

    // Tab Navigation
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

            btn.classList.add('active');
            const targetTab = btn.dataset.tab;
            document.getElementById(targetTab).classList.add('active');

            if (targetTab === 'chatTab') {
                scrollToBottom();
            }
        });
    });

    // Theme Toggle Button
    document.getElementById('themeToggleBtn').addEventListener('click', toggleThemeMode);
}

function toggleThemeMode() {
    const isLight = document.body.classList.toggle('light-theme');
    const themeIcon = document.querySelector('#themeToggleBtn i');
    if (themeIcon) {
        themeIcon.className = isLight ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
    }
    localStorage.setItem('family_sync_theme', isLight ? 'light' : 'dark');
}

// Sync Profiles (Live sync or Local fallback)
function syncProfiles() {
    if (useFirebase) {
        db.collection('profiles').onSnapshot((snapshot) => {
            snapshot.forEach(doc => {
                const role = doc.id;
                if (customProfiles[role]) {
                    customProfiles[role] = doc.data();
                }
            });
            updateProfileUI();
            checkExistingProfile();
        });
    } else {
        const savedCustom = localStorage.getItem('family_sync_custom_profiles');
        if (savedCustom) {
            customProfiles = JSON.parse(savedCustom);
        }
        updateProfileUI();
        checkExistingProfile();
    }
}

// Render/Update all names and avatars in UI
function updateProfileUI() {
    for (const [role, data] of Object.entries(customProfiles)) {
        const key = getShortKey(role);
        const card = document.querySelector(`.profile-card[data-role="${role}"]`);
        if (card) {
            card.dataset.member = data.member;
            card.dataset.avatar = data.avatar;
        }
        
        const img = document.querySelector(`.profile-img-${key}`);
        if (img) img.src = data.avatar;
        const text = document.querySelector(`.name-${key}`);
        if (text) text.textContent = data.member;

        const columns = document.querySelector(`.task-column[data-role="${role}"]`);
        if (columns) {
            const colTitle = columns.querySelector('.column-title');
            if (colTitle) colTitle.textContent = `${data.member} (${role})`;
            const colImg = columns.querySelector('.column-header img');
            if (colImg) colImg.src = data.avatar;
        }

        const selectOption = document.querySelector(`#taskAssignee option[value="${role}"], #taskAssignee option[value="${data.member}"]`);
        if (selectOption) {
            selectOption.value = data.member;
            selectOption.textContent = `${role} (${data.member})`;
        }
    }
}

function getShortKey(role) {
    if (role === 'Dad') return 'Ajay';
    if (role === 'Mom') return 'Poonam';
    if (role === 'Child 1') return 'Naman';
    if (role === 'Child 2') return 'Muskan';
    return role;
}

// Profile Management
function checkExistingProfile() {
    const saved = localStorage.getItem('family_sync_profile_role');
    if (saved && customProfiles[saved]) {
        selectProfile(saved);
    } else {
        showProfileSelector();
    }
}

function selectProfile(role) {
    currentProfile = {
        role: role,
        member: customProfiles[role].member,
        avatar: customProfiles[role].avatar
    };
    localStorage.setItem('family_sync_profile_role', role);

    document.getElementById('headerAvatar').src = currentProfile.avatar;
    document.getElementById('headerProfileName').textContent = `${currentProfile.member} (${role})`;
    
    document.getElementById('profileOverlay').classList.remove('active');
    document.getElementById('appContainer').classList.add('loaded');

    loadTasks();
    loadMessages();
}

function showProfileSelector() {
    document.getElementById('profileOverlay').classList.add('active');
    document.getElementById('appContainer').classList.remove('loaded');
}

// Edit Profile Modal Handling
function openEditProfileModal() {
    if (!currentProfile) return;
    const role = currentProfile.role;
    const data = customProfiles[role];
    
    document.getElementById('editDisplayName').value = data.member;
    
    if (data.avatar.includes('api.dicebear.com')) {
        const urlParams = new URL(data.avatar).searchParams;
        document.getElementById('editAvatarUrl').value = urlParams.get('seed') || '';
    } else {
        document.getElementById('editAvatarUrl').value = data.avatar;
    }
    
    updateAvatarPreview();
    document.getElementById('editProfileOverlay').classList.add('active');
}

function closeEditProfileModal() {
    document.getElementById('editProfileOverlay').classList.remove('active');
}

function updateAvatarPreview() {
    const inputVal = document.getElementById('editAvatarUrl').value.trim();
    const previewImg = document.getElementById('editAvatarPreview');
    
    if (!inputVal) {
        previewImg.src = "https://api.dicebear.com/7.x/bottts/svg?seed=Default";
    } else if (inputVal.startsWith('http://') || inputVal.startsWith('https://')) {
        previewImg.src = inputVal;
    } else {
        previewImg.src = `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(inputVal)}`;
    }
}

function saveProfileChanges() {
    if (!currentProfile) return;
    const role = currentProfile.role;
    const newName = document.getElementById('editDisplayName').value.trim();
    const avatarInput = document.getElementById('editAvatarUrl').value.trim();
    
    if (!newName) return alert('Name cannot be empty!');

    let finalAvatar = avatarInput;
    if (!avatarInput) {
        finalAvatar = `https://api.dicebear.com/7.x/bottts/svg?seed=Default`;
    } else if (!avatarInput.startsWith('http://') && !avatarInput.startsWith('https://')) {
        finalAvatar = `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(avatarInput)}`;
    }

    const updatedData = {
        member: newName,
        avatar: finalAvatar
    };

    if (useFirebase) {
        db.collection('profiles').doc(role).set(updatedData)
          .then(() => {
              closeEditProfileModal();
          })
          .catch(err => console.error("Error updating profile:", err));
    } else {
        customProfiles[role] = updatedData;
        localStorage.setItem('family_sync_custom_profiles', JSON.stringify(customProfiles));
        updateProfileUI();
        selectProfile(role);
        closeEditProfileModal();
    }
}

// Task Handling
function loadTasks() {
    if (useFirebase) {
        db.collection('tasks').orderBy('timestamp', 'desc')
          .onSnapshot((snapshot) => {
              const tasks = [];
              snapshot.forEach(doc => {
                  tasks.push({ id: doc.id, ...doc.data() });
              });
              cleanupOldCompletedTasks(tasks);
              renderTasks(tasks);
          }, (err) => {
              console.error("Firestore sync error:", err);
              cleanupOldCompletedTasks(localTasks);
              renderTasks(localTasks);
          });
    } else {
        cleanupOldCompletedTasks(localTasks);
        renderTasks(localTasks);
    }
}

// Auto-delete completed tasks after 48 hours
function cleanupOldCompletedTasks(tasks) {
    const limit48h = Date.now() - (48 * 60 * 60 * 1000); // 48 hours ago
    tasks.forEach(task => {
        if (task.completed && task.completedAt && task.completedAt < limit48h) {
            if (useFirebase) {
                db.collection('tasks').doc(task.id).delete().catch(err => console.error("Auto-delete task failed: ", err));
            } else {
                localTasks = localTasks.filter(t => t.id !== task.id);
                localStorage.setItem('family_sync_tasks', JSON.stringify(localTasks));
            }
        }
    });
}

function renderTasks(tasks) {
    for (const [role, data] of Object.entries(customProfiles)) {
        const listEl = document.getElementById(`list-${getShortKey(role)}`);
        if (listEl) listEl.innerHTML = '';
        const countEl = document.getElementById(`count-${getShortKey(role)}`);
        if (countEl) countEl.textContent = '0';
    }

    const completedGrid = document.getElementById('completedTasksGrid');
    completedGrid.innerHTML = '';

    let activeCountMap = {};
    for (const [role, data] of Object.entries(customProfiles)) {
        activeCountMap[data.member] = 0;
    }
    
    let completedListHtml = '';

    tasks.sort((a, b) => {
        const priorityOrder = { 'high-priority': 3, 'normal-priority': 2, 'low-priority': 1 };
        return (priorityOrder[b.priority] || 2) - (priorityOrder[a.priority] || 2);
    });

    tasks.forEach(task => {
        if (!task.completed) {
            let shortKey = null;
            for (const [role, data] of Object.entries(customProfiles)) {
                if (task.assignee === data.member || task.assignee === role) {
                    shortKey = getShortKey(role);
                    activeCountMap[data.member] = (activeCountMap[data.member] || 0) + 1;
                    break;
                }
            }
            if (shortKey) {
                const card = createTaskCard(task);
                const listEl = document.getElementById(`list-${shortKey}`);
                if (listEl) listEl.appendChild(card);
            }
        } else {
            completedListHtml += createCompletedCard(task);
        }
    });

    for (const [role, data] of Object.entries(customProfiles)) {
        const countEl = document.getElementById(`count-${getShortKey(role)}`);
        if (countEl) countEl.textContent = activeCountMap[data.member] || 0;
    }

    if (completedListHtml) {
        completedGrid.innerHTML = completedListHtml;
    } else {
        completedGrid.innerHTML = `
            <div class="completed-card" style="grid-column: 1 / -1; justify-content: center; border-left: none; border: 1px dashed rgba(255,255,255,0.05); background: transparent;">
                <span style="color: var(--text-secondary); font-size: 13px;">No tasks completed yet today. Let's get things done!</span>
            </div>
        `;
    }
}

function createTaskCard(task) {
    const isOwner = currentProfile && (currentProfile.member === task.assignedBy);
    const deleteBtnHtml = isOwner ? `<button class="btn-delete-task" onclick="deleteTask('${task.id}')" title="Delete Task"><i class="fa-solid fa-trash-can"></i></button>` : '';

    // Done button can only be visible/pressed if current user is the assignee
    const isAssignee = currentProfile && (currentProfile.member === task.assignee);
    const doneBtnHtml = isAssignee 
        ? `<button class="btn-complete" onclick="markTaskDone('${task.id}')">Done</button>` 
        : `<span style="font-size: 11px; color: var(--text-secondary); font-style: italic;">Assigned to ${escapeHtml(task.assignee)}</span>`;

    const div = document.createElement('div');
    div.className = `task-card ${task.priority}`;
    div.innerHTML = `
        <div class="task-header" style="display: flex; justify-content: space-between; align-items: flex-start; gap: 10px;">
            <div class="task-title" style="flex-grow: 1;">${escapeHtml(task.title)}</div>
            ${deleteBtnHtml}
        </div>
        ${task.desc ? `<div class="task-desc">${escapeHtml(task.desc)}</div>` : ''}
        <div class="task-footer">
            <div class="assigned-by">By: ${escapeHtml(task.assignedBy)}</div>
            ${doneBtnHtml}
        </div>
    `;
    return div;
}

function createCompletedCard(task) {
    const timeString = task.completedAt ? new Date(task.completedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Today';
    return `
        <div class="completed-card">
            <div class="completed-info">
                <div class="completed-title">${escapeHtml(task.title)}</div>
                <div class="completed-meta">
                    <span>Assignee: <strong>${escapeHtml(task.assignee)}</strong></span>
                    <span>By: ${escapeHtml(task.assignedBy)}</span>
                </div>
            </div>
            <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 6px;">
                <span class="completed-time">${timeString}</span>
                <div class="completed-avatar-badge">
                    <i class="fa-solid fa-circle-check"></i> Finished
                </div>
            </div>
        </div>
    `;
}

function handleAddTask(e) {
    e.preventDefault();
    if (!currentProfile) return showProfileSelector();

    const assignee = document.getElementById('taskAssignee').value;
    const title = document.getElementById('taskTitle').value.trim();
    const desc = document.getElementById('taskDesc').value.trim();
    const priority = document.getElementById('taskPriority').value;

    if (!assignee || !title) return;

    const newTask = {
        title,
        desc,
        assignee,
        priority,
        completed: false,
        assignedBy: currentProfile.member,
        timestamp: Date.now()
    };

    if (useFirebase) {
        db.collection('tasks').add(newTask)
          .then(() => {
              document.getElementById('taskForm').reset();
          })
          .catch(err => console.error("Error adding task:", err));
    } else {
        const id = 'task_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
        newTask.id = id;
        localTasks.push(newTask);
        localStorage.setItem('family_sync_tasks', JSON.stringify(localTasks));
        document.getElementById('taskForm').reset();
        loadTasks();
    }
}

// Mark Task Done (only by Assignee)
window.markTaskDone = function(taskId) {
    if (!currentProfile) return showProfileSelector();

    if (useFirebase) {
        db.collection('tasks').doc(taskId).get().then(doc => {
            if (doc.exists && doc.data().assignee === currentProfile.member) {
                db.collection('tasks').doc(taskId).update({
                    completed: true,
                    completedAt: Date.now(),
                    completedBy: currentProfile.member
                }).catch(err => console.error("Error updating task:", err));
            } else {
                alert("Only the assigned person can mark this task as done!");
            }
        });
    } else {
        const taskIdx = localTasks.findIndex(t => t.id === taskId);
        if (taskIdx !== -1) {
            if (localTasks[taskIdx].assignee === currentProfile.member) {
                localTasks[taskIdx].completed = true;
                localTasks[taskIdx].completedAt = Date.now();
                localTasks[taskIdx].completedBy = currentProfile.member;
                localStorage.setItem('family_sync_tasks', JSON.stringify(localTasks));
                loadTasks();
            } else {
                alert("Only the assigned person can mark this task as done!");
            }
        }
    }
};

// Delete Task (only by assigner)
window.deleteTask = function(taskId) {
    if (!currentProfile) return showProfileSelector();
    
    if (confirm("Are you sure you want to delete this task?")) {
        if (useFirebase) {
            db.collection('tasks').doc(taskId).get().then(doc => {
                if (doc.exists && doc.data().assignedBy === currentProfile.member) {
                    db.collection('tasks').doc(taskId).delete()
                      .catch(err => console.error("Error deleting task:", err));
                } else {
                    alert("Only the person who assigned this task can delete it!");
                }
            });
        } else {
            const taskIdx = localTasks.findIndex(t => t.id === taskId);
            if (taskIdx !== -1) {
                if (localTasks[taskIdx].assignedBy === currentProfile.member) {
                    localTasks = localTasks.filter(t => t.id !== taskId);
                    localStorage.setItem('family_sync_tasks', JSON.stringify(localTasks));
                    loadTasks();
                } else {
                    alert("Only the person who assigned this task can delete it!");
                }
            }
        }
    }
};

// Chat Messaging
function loadMessages() {
    if (useFirebase) {
        db.collection('chat').orderBy('timestamp', 'asc')
          .onSnapshot((snapshot) => {
              const messages = [];
              snapshot.forEach(doc => {
                  messages.push({ id: doc.id, ...doc.data() });
              });
              renderMessages(messages);
          }, (err) => {
              console.error("Firestore chat error:", err);
              renderMessages(localMessages);
          });
    } else {
        renderMessages(localMessages);
    }
}

function renderMessages(messages) {
    const container = document.getElementById('chatMessages');
    container.innerHTML = '';

    messages.forEach(msg => {
        const isOutgoing = currentProfile && msg.sender === currentProfile.member;
        const msgDiv = document.createElement('div');
        msgDiv.className = `message ${isOutgoing ? 'outgoing' : 'incoming'}`;
        
        const timeString = msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';

        // Option to delete chats you sent
        const deleteMsgHtml = isOutgoing 
            ? `<button onclick="deleteMessage('${msg.id}')" title="Delete Message" style="background:none; border:none; color:rgba(255,255,255,0.4); cursor:pointer; margin-left:8px; font-size:11px; transition:color 0.2s;"><i class="fa-solid fa-trash-can"></i></button>`
            : '';

        msgDiv.innerHTML = `
            <img src="${msg.avatar}" alt="${msg.sender}" class="avatar" style="align-self: flex-end;">
            <div class="msg-bubble">
                <div style="display:flex; justify-content:space-between; align-items:center; gap:10px;">
                    <span class="msg-sender">${escapeHtml(msg.sender)} (${escapeHtml(msg.role)})</span>
                    ${deleteMsgHtml}
                </div>
                <span class="msg-text">${escapeHtml(msg.text)}</span>
                <span class="msg-time">${timeString}</span>
            </div>
        `;
        container.appendChild(msgDiv);
    });

    scrollToBottom();
}

function handleSendMessage(e) {
    e.preventDefault();
    if (!currentProfile) return showProfileSelector();

    const input = document.getElementById('chatInput');
    const text = input.value.trim();
    if (!text) return;

    const activeData = customProfiles[currentProfile.role];
    const newMsg = {
        text,
        sender: activeData.member,
        role: currentProfile.role,
        avatar: activeData.avatar,
        timestamp: Date.now()
    };

    if (useFirebase) {
        db.collection('chat').add(newMsg)
          .then(() => {
              input.value = '';
          })
          .catch(err => console.error("Error sending message:", err));
    } else {
        const id = 'msg_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
        newMsg.id = id;
        localMessages.push(newMsg);
        localStorage.setItem('family_sync_messages', JSON.stringify(localMessages));
        input.value = '';
        loadMessages();
    }
}

// Delete Chat Message
window.deleteMessage = function(msgId) {
    if (!currentProfile) return showProfileSelector();
    
    if (confirm("Delete this message?")) {
        if (useFirebase) {
            db.collection('chat').doc(msgId).get().then(doc => {
                if (doc.exists && doc.data().sender === currentProfile.member) {
                    db.collection('chat').doc(msgId).delete()
                      .catch(err => console.error("Error deleting message:", err));
                } else {
                    alert("You can only delete your own messages!");
                }
            });
        } else {
            const msgIdx = localMessages.findIndex(m => m.id === msgId);
            if (msgIdx !== -1) {
                if (localMessages[msgIdx].sender === currentProfile.member) {
                    localMessages = localMessages.filter(m => m.id !== msgId);
                    localStorage.setItem('family_sync_messages', JSON.stringify(localMessages));
                    loadMessages();
                } else {
                    alert("You can only delete your own messages!");
                }
            }
        }
    }
};

// Helpers
function scrollToBottom() {
    const container = document.getElementById('chatMessages');
    container.scrollTop = container.scrollHeight;
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, "&amp;")
              .replace(/</g, "&lt;")
              .replace(/>/g, "&gt;")
              .replace(/"/g, "&quot;")
              .replace(/'/g, "&#039;");
}
