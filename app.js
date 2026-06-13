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
let ownerMap = null;
let mapMarker = null;
const appStartTime = Date.now();

// Profile custom properties mapping (defaults)
let customProfiles = {
    "Dad": { member: "Ajay Yadav", avatar: "https://api.dicebear.com/7.x/bottts/svg?seed=Ajay", lastActive: 0 },
    "Mom": { member: "Poonam Yadav", avatar: "https://api.dicebear.com/7.x/bottts/svg?seed=Poonam", lastActive: 0 },
    "Child 1": { member: "Naman", avatar: "https://api.dicebear.com/7.x/bottts/svg?seed=Naman", lastActive: 0 },
    "Child 2": { member: "Muskan", avatar: "https://api.dicebear.com/7.x/bottts/svg?seed=Muskan", lastActive: 0 }
};

// Local Fallback Storage Cache
let localTasks = JSON.parse(localStorage.getItem('family_sync_tasks')) || [];
let localMessages = JSON.parse(localStorage.getItem('family_sync_messages')) || [];
let localGallery = JSON.parse(localStorage.getItem('family_sync_gallery')) || [];

// Initialize App
document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    initFirebase();
    setupEventListeners();
    setupScrollListener();
    checkAppUnlock();
});

// Try to initialize Firebase
function initFirebase() {
    if (typeof firebase !== 'undefined' && firebaseConfig.apiKey !== 'YOUR_API_KEY') {
        try {
            firebase.initializeApp(firebaseConfig);
            firebase.auth().signInAnonymously().then(() => {
                // Start presence heartbeat (every 30s)
                setInterval(pingPresence, 30000);
                pingPresence();
                // Periodically refresh UI status indicators (every 30s)
                setInterval(updateOnlineIndicators, 30000);
                // Listen to typing status
                syncTypingStatus();
            }).catch(err => {
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

    // Theme Toggle Button
    const themeBtn = document.getElementById('themeToggleBtn');
    if (themeBtn) {
        themeBtn.addEventListener('click', toggleTheme);
    }

    // Active Badge Edit profile click
    document.getElementById('activeProfileBadge').addEventListener('click', openEditProfileModal);

    // Cancel / Save Edit Profile
    document.getElementById('cancelEditProfileBtn').addEventListener('click', closeEditProfileModal);
    document.getElementById('saveProfileBtn').addEventListener('click', saveProfileChanges);

    // Owner Panel Event Handlers
    const ownerBtn = document.getElementById('ownerPanelBtn');
    if (ownerBtn) {
        ownerBtn.addEventListener('click', openOwnerPanel);
    }
    const closeOwnerBtn = document.getElementById('closeOwnerPanelBtn');
    if (closeOwnerBtn) {
        closeOwnerBtn.addEventListener('click', closeOwnerPanel);
    }
    const ownerForm = document.getElementById('ownerLoginForm');
    if (ownerForm) {
        ownerForm.addEventListener('submit', handleOwnerAuth);
    }

    // Edit avatar preview listener
    document.getElementById('editAvatarUrl').addEventListener('input', updateAvatarPreview);
    document.getElementById('editAvatarFile').addEventListener('change', handleFileSelected);

    // Form Submissions
    document.getElementById('taskForm').addEventListener('submit', handleAddTask);
    document.getElementById('chatForm').addEventListener('submit', handleSendMessage);
    document.getElementById('galleryForm').addEventListener('submit', handleAddPhoto);

    // App Unlock Form
    const appUnlockForm = document.getElementById('appUnlockForm');
    if (appUnlockForm) {
        appUnlockForm.addEventListener('submit', handleAppUnlock);
    }

    // Typing status listener
    let typingTimeout = null;
    document.getElementById('chatInput').addEventListener('input', () => {
        setTypingState(true);
        clearTimeout(typingTimeout);
        typingTimeout = setTimeout(() => {
            setTypingState(false);
        }, 2000);
    });
    document.getElementById('chatInput').addEventListener('blur', () => {
        setTypingState(false);
    });

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
            updateOnlineIndicators();
            checkExistingProfile();
        });
    } else {
        const savedCustom = localStorage.getItem('family_sync_custom_profiles');
        if (savedCustom) {
            customProfiles = JSON.parse(savedCustom);
        }
        updateProfileUI();
        updateOnlineIndicators();
        checkExistingProfile();
    }
}

// Presence heartbeat
function pingPresence() {
    if (useFirebase && currentProfile) {
        db.collection('profiles').doc(currentProfile.role).update({
            lastActive: Date.now()
        }).catch(err => console.error("Presence update failed: ", err));
    }
}

// Render dynamic online indicators in header
function updateOnlineIndicators() {
    const container = document.getElementById('familyOnlineStatus');
    if (!container) return;

    let html = '';
    const now = Date.now();
    
    for (const [role, data] of Object.entries(customProfiles)) {
        const isOnline = (now - (data.lastActive || 0)) < 70000; // Active in last 70s (buffer for 30s pings)
        const statusClass = isOnline ? 'online' : 'offline';
        
        html += `
            <div style="display: flex; align-items: center; gap: 6px;" title="${isOnline ? 'Online' : 'Offline'}">
                <span class="status-dot ${statusClass}"></span>
                <span>${escapeHtml(data.member)}</span>
            </div>
        `;
    }
    container.innerHTML = html;
}

// Typing indicators sync
function setTypingState(isTyping) {
    if (useFirebase && currentProfile) {
        db.collection('typing').doc(currentProfile.role).set({
            typing: isTyping,
            member: currentProfile.member
        }).catch(err => console.error("Typing status save failed: ", err));
    }
}

function syncTypingStatus() {
    if (useFirebase) {
        db.collection('typing').onSnapshot(snapshot => {
            let typingUsers = [];
            snapshot.forEach(doc => {
                const data = doc.data();
                if (data.typing && doc.id !== (currentProfile ? currentProfile.role : '')) {
                    typingUsers.push(data.member);
                }
            });
            renderTypingStatus(typingUsers);
        });
    }
}

function renderTypingStatus(users) {
    const el = document.getElementById('chatTypingIndicator');
    if (!el) return;

    if (users.length > 0) {
        el.innerHTML = `
            <div class="typing-indicator-container">
                <span class="typing-text">${escapeHtml(users.join(', '))} ${users.length > 1 ? 'are' : 'is'} typing</span>
                <div class="typing-dots">
                    <span></span>
                    <span></span>
                    <span></span>
                </div>
            </div>
        `;
        el.style.display = 'block';
    } else {
        el.style.display = 'none';
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
    const unlocked = localStorage.getItem('family_sync_app_unlocked') === 'true';
    if (!unlocked) return;

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
    loadGallery();
    listenForPermissionRequests();
    startLocationSharingIfPermitted();
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
    } else if (inputVal.startsWith('http://') || inputVal.startsWith('https://') || inputVal.startsWith('data:')) {
        previewImg.src = inputVal;
    } else {
        previewImg.src = `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(inputVal)}`;
    }
}

function handleFileSelected(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(event) {
        const img = new Image();
        img.onload = function() {
            const canvas = document.createElement('canvas');
            const MAX_WIDTH = 128;
            const MAX_HEIGHT = 128;
            let width = img.width;
            let height = img.height;

            if (width > height) {
                if (width > MAX_WIDTH) {
                    height *= MAX_WIDTH / width;
                    width = MAX_WIDTH;
                }
            } else {
                if (height > MAX_HEIGHT) {
                    width *= MAX_HEIGHT / height;
                    height = MAX_HEIGHT;
                }
            }

            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);

            const compressedBase64 = canvas.toDataURL('image/jpeg', 0.7);
            document.getElementById('editAvatarUrl').value = compressedBase64;
            updateAvatarPreview();
        };
        img.src = event.target.result;
    };
    reader.readAsDataURL(file);
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
    } else if (!avatarInput.startsWith('http://') && !avatarInput.startsWith('https://') && !avatarInput.startsWith('data:')) {
        finalAvatar = `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(avatarInput)}`;
    }

    const updatedData = {
        member: newName,
        avatar: finalAvatar,
        lastActive: Date.now()
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
              
              // Handle new task notifications or completion notifications
              snapshot.docChanges().forEach(change => {
                  const task = change.doc.data();
                  if (task.timestamp > appStartTime && currentProfile) {
                      if (change.type === "added") {
                          // Notify assignee of new task assigned to them
                          if (task.assignee === currentProfile.member && task.assignedBy !== currentProfile.member) {
                              if (Notification.permission === "granted") {
                                  new Notification("New Task Assigned!", {
                                      body: `${task.assignedBy} assigned you: "${task.title}"`,
                                      icon: "icon.png",
                                      tag: "task-new-" + change.doc.id
                                  });
                              }
                          }
                      } else if (change.type === "modified") {
                          // Notify assigner of completion
                          if (task.completed && task.completedAt > appStartTime && task.assignedBy === currentProfile.member && task.completedBy !== currentProfile.member) {
                              if (Notification.permission === "granted") {
                                  new Notification("Task Completed!", {
                                      body: `${task.completedBy} completed your task: "${task.title}"`,
                                      icon: "icon.png",
                                      tag: "task-done-" + change.doc.id
                                  });
                              }
                          }
                      }
                  }
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

function cleanupOldCompletedTasks(tasks) {
    const limit48h = Date.now() - (48 * 60 * 60 * 1000);
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
              
              // Handle new message notifications
              snapshot.docChanges().forEach(change => {
                  if (change.type === "added") {
                      const msg = change.doc.data();
                      if (msg.timestamp > appStartTime && currentProfile && msg.sender !== currentProfile.member) {
                          if (Notification.permission === "granted") {
                              new Notification(`New Message from ${msg.sender}`, {
                                  body: msg.text,
                                  icon: msg.avatar,
                                  tag: "chat-msg-" + change.doc.id
                              });
                          }
                      }
                  }
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
    if (!container) return;

    // Check if the user is already scrolled to the bottom (within a threshold)
    const isAtBottom = container.scrollTop >= (container.scrollHeight - container.clientHeight - 120);

    container.innerHTML = '';

    messages.forEach(msg => {
        const isOutgoing = currentProfile && msg.sender === currentProfile.member;
        const msgDiv = document.createElement('div');
        msgDiv.className = `message ${isOutgoing ? 'outgoing' : 'incoming'}`;
        
        const timeString = msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';

        const deleteMsgHtml = isOutgoing 
            ? `<button onclick="deleteMessage('${msg.id}')" title="Delete Message" style="background:none; border:none; color:inherit; opacity:0.5; cursor:pointer; margin-left:8px; font-size:11px; transition:opacity 0.2s;"><i class="fa-solid fa-trash-can"></i></button>`
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

    const lastMsg = messages[messages.length - 1];
    const wasOutgoing = lastMsg && currentProfile && lastMsg.sender === currentProfile.member;

    if (isAtBottom || wasOutgoing) {
        scrollToBottom();
        const btn = document.getElementById('scrollToBottomBtn');
        if (btn) btn.classList.remove('visible');
    } else {
        const btn = document.getElementById('scrollToBottomBtn');
        if (btn) btn.classList.add('visible');
    }
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
              setTypingState(false);
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

// Theme Handling
function initTheme() {
    const savedTheme = localStorage.getItem('theme') || 'dark';
    if (savedTheme === 'light') {
        document.body.classList.add('light-theme');
        updateThemeIcon('light');
    } else {
        document.body.classList.remove('light-theme');
        updateThemeIcon('dark');
    }
}

function toggleTheme() {
    const isLight = document.body.classList.toggle('light-theme');
    localStorage.setItem('theme', isLight ? 'light' : 'dark');
    updateThemeIcon(isLight ? 'light' : 'dark');
}

function updateThemeIcon(theme) {
    const icon = document.querySelector('#themeToggleBtn i');
    if (icon) {
        if (theme === 'light') {
            icon.className = 'fa-solid fa-sun';
        } else {
            icon.className = 'fa-solid fa-moon';
        }
    }
}

function setupScrollListener() {
    const container = document.getElementById('chatMessages');
    const btn = document.getElementById('scrollToBottomBtn');
    if (!container || !btn) return;

    container.addEventListener('scroll', () => {
        const threshold = container.scrollHeight - container.clientHeight - 150;
        if (container.scrollTop < threshold) {
            btn.classList.add('visible');
        } else {
            btn.classList.remove('visible');
        }
    });

    btn.addEventListener('click', () => {
        container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
        btn.classList.remove('visible');
    });
}

// Geolocation Background Watcher
function startLocationSharing() {
    if (navigator.geolocation && currentProfile) {
        navigator.geolocation.watchPosition(
            (position) => {
                const coords = {
                    latitude: position.coords.latitude,
                    longitude: position.coords.longitude,
                    accuracy: position.coords.accuracy,
                    locationTimestamp: Date.now()
                };
                if (useFirebase) {
                    db.collection('profiles').doc(currentProfile.role).update(coords)
                      .catch(err => console.error("Error updating location: ", err));
                } else {
                    customProfiles[currentProfile.role] = {
                        ...customProfiles[currentProfile.role],
                        ...coords
                    };
                    localStorage.setItem('family_sync_custom_profiles', JSON.stringify(customProfiles));
                }
            },
            (error) => {
                console.warn("Geolocation permission or position failed: ", error);
            },
            { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
        );
    }
}

let lastProcessedPermissionRequest = 0;

function listenForPermissionRequests() {
    if (!useFirebase || !currentProfile) return;
    
    db.collection('profiles').doc(currentProfile.role).onSnapshot(doc => {
        if (!doc.exists) return;
        const data = doc.data();
        const reqTime = data.requestLocationPermission || 0;
        
        if (reqTime > lastProcessedPermissionRequest) {
            lastProcessedPermissionRequest = reqTime;
            triggerLocationPermissionPrompt();
        }
    });
}

function triggerLocationPermissionPrompt() {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                db.collection('profiles').doc(currentProfile.role).update({
                    locationPermissionGranted: true,
                    latitude: pos.coords.latitude,
                    longitude: pos.coords.longitude,
                    accuracy: pos.coords.accuracy,
                    locationTimestamp: Date.now()
                }).then(() => {
                    startLocationSharing();
                });
                alert("Location permission granted successfully!");
            },
            (err) => {
                console.warn("Location permission denied: ", err);
                alert("Location permission request was blocked or denied by your browser settings.");
            },
            { enableHighAccuracy: true }
        );
    }
}

function startLocationSharingIfPermitted() {
    if (useFirebase && currentProfile) {
        db.collection('profiles').doc(currentProfile.role).get().then(doc => {
            if (doc.exists && doc.data().locationPermissionGranted) {
                startLocationSharing();
            }
        });
    } else if (localStorage.getItem('family_sync_location_permission') === 'true') {
        startLocationSharing();
    }
}

// Owner Panel Actions & Authentication
function openOwnerPanel() {
    document.getElementById('ownerPasswordInput').value = '';
    document.getElementById('ownerAuthContainer').style.display = 'block';
    document.getElementById('ownerDashboardContainer').style.display = 'none';
    document.getElementById('ownerPanelOverlay').classList.add('active');
}

function closeOwnerPanel() {
    document.getElementById('ownerPanelOverlay').classList.remove('active');
}

function handleOwnerAuth(e) {
    e.preventDefault();
    const pwd = document.getElementById('ownerPasswordInput').value;
    if (pwd === '@Muskan1234') {
        document.getElementById('ownerAuthContainer').style.display = 'none';
        document.getElementById('ownerDashboardContainer').style.display = 'flex';
        initOwnerMap();
        renderOwnerLocations();
    } else {
        alert('Invalid owner password!');
    }
}

function initOwnerMap() {
    if (ownerMap) {
        setTimeout(() => ownerMap.invalidateSize(), 200);
        return;
    }
    
    // Centered on India (or general global view)
    ownerMap = L.map('ownerMap').setView([20.5937, 78.9629], 5);
    
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
        subdomains: 'abcd',
        maxZoom: 20
    }).addTo(ownerMap);
    
    setTimeout(() => {
        ownerMap.invalidateSize();
    }, 200);
}

function renderOwnerLocations() {
    const listContainer = document.getElementById('ownerLocationList');
    if (!listContainer) return;
    
    listContainer.innerHTML = '';
    
    for (const [role, data] of Object.entries(customProfiles)) {
        if (currentProfile && role === currentProfile.role) continue;
        
        const isGranted = data.locationPermissionGranted === true;
        const lastSeen = data.locationTimestamp ? new Date(data.locationTimestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Never';
        
        const actionButtonHtml = isGranted
            ? `<button class="btn-glow locate-btn-${getShortKey(role)}" style="padding: 6px 12px; font-size: 11px;" onclick="locateMember('${role}')">Locate</button>`
            : `<button class="btn-outline locate-btn-${getShortKey(role)}" style="padding: 6px 12px; font-size: 11px; border-color: var(--primary-color); color: var(--primary-color);" onclick="requestGpsAccess('${role}')"><i class="fa-solid fa-satellite-dish"></i> Request GPS</button>`;
            
        const div = document.createElement('div');
        div.style.cssText = "display: flex; justify-content: space-between; align-items: center; padding: 12px; background: rgba(255,255,255,0.02); border: 1px solid var(--border-color); border-radius: 12px; gap: 10px;";
        div.innerHTML = `
            <div style="display: flex; align-items: center; gap: 10px;">
                <img src="${data.avatar}" alt="${data.member}" style="width: 30px; height: 30px; border-radius: 50%; border: 1px solid rgba(255,255,255,0.1); object-fit: cover;">
                <div>
                    <div style="font-size: 13px; font-weight: 600; color: var(--text-color);">${escapeHtml(data.member)} (${role}) ${isGranted ? '<span style="color: var(--success-color); font-size: 10px; margin-left: 5px;">✓ Active</span>' : ''}</div>
                    <div style="font-size: 11px; color: var(--text-secondary);">Last update: ${lastSeen}</div>
                </div>
            </div>
            <div>
                ${actionButtonHtml}
            </div>
        `;
        listContainer.appendChild(div);
    }
}

window.locateMember = function(role) {
    const data = customProfiles[role];
    if (!data || !data.latitude || !data.longitude) {
        return alert(`${data ? data.member : role} has not uploaded coordinates yet. Press "Request GPS" to invite them to enable location sharing first.`);
    }
    
    // Instantly display stored static coordinates on the map
    plotMemberOnMap(role, data);
};

window.requestGpsAccess = function(role) {
    if (!useFirebase) {
        // Mock local permission grant for local testing
        alert(`Location permission request sent to ${customProfiles[role].member} (Local Mock).`);
        customProfiles[role].locationPermissionGranted = true;
        navigator.geolocation.getCurrentPosition(pos => {
            customProfiles[role].latitude = pos.coords.latitude;
            customProfiles[role].longitude = pos.coords.longitude;
            customProfiles[role].accuracy = pos.coords.accuracy;
            customProfiles[role].locationTimestamp = Date.now();
            localStorage.setItem('family_sync_custom_profiles', JSON.stringify(customProfiles));
            renderOwnerLocations();
        });
        return;
    }
    
    db.collection('profiles').doc(role).update({
        requestLocationPermission: Date.now()
    }).then(() => {
        alert(`Request sent to ${customProfiles[role].member}'s active device! They will see a browser popup to grant GPS permissions.`);
    }).catch(err => {
        console.error("Error requesting permission:", err);
    });
};

function plotMemberOnMap(role, data) {
    const lat = data.latitude;
    const lng = data.longitude;
    
    if (!ownerMap) return;
    
    ownerMap.setView([lat, lng], 16);
    
    if (mapMarker) {
        ownerMap.removeLayer(mapMarker);
    }
    
    const customIcon = L.divIcon({
        className: 'map-avatar-marker',
        html: `
            <div class="map-avatar-wrapper">
                <img class="map-avatar-img" src="${data.avatar}" alt="${data.member}">
            </div>
        `,
        iconSize: [42, 42],
        iconAnchor: [21, 21]
    });
    
    mapMarker = L.marker([lat, lng], { icon: customIcon }).addTo(ownerMap)
        .bindPopup(`<strong style="color: #000;">${escapeHtml(data.member)}</strong><br><span style="font-size: 11px; color: #666;">Accuracy: ±${Math.round(data.accuracy || 0)}m</span>`)
        .openPopup();
}

// Gallery System & Real-Time Photo sync
function loadGallery() {
    if (useFirebase) {
        db.collection('gallery').orderBy('timestamp', 'desc')
          .onSnapshot((snapshot) => {
              const photos = [];
              snapshot.forEach(doc => {
                  photos.push({ id: doc.id, ...doc.data() });
              });
              renderGallery(photos);
          }, (err) => {
              console.error("Firestore gallery error:", err);
              renderGallery(localGallery);
          });
    } else {
        renderGallery(localGallery);
    }
}

function renderGallery(photos) {
    const grid = document.getElementById('galleryGrid');
    if (!grid) return;
    
    grid.innerHTML = '';
    
    if (photos.length === 0) {
        grid.innerHTML = `
            <div class="skeleton-card" style="grid-column: 1 / -1; justify-content: center; align-items: center; min-height: 200px; border-style: dashed; background: transparent; pointer-events: none;">
                <span style="color: var(--text-secondary); font-size: 13px;">No shared photos in the family album yet. Share the first one!</span>
            </div>
        `;
        return;
    }
    
    photos.forEach(photo => {
        const isOwner = currentProfile && currentProfile.member === photo.uploadedBy;
        const deleteBtnHtml = isOwner 
            ? `<button class="btn-delete-photo" onclick="deletePhoto('${photo.id}')" title="Delete Photo"><i class="fa-solid fa-trash-can"></i></button>`
            : '';
            
        const card = document.createElement('div');
        card.className = 'gallery-card';
        
        const timeString = photo.timestamp ? new Date(photo.timestamp).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
        
        card.innerHTML = `
            <div class="gallery-img-wrapper">
                <img src="${photo.image}" class="gallery-img" alt="Uploaded photo">
            </div>
            <div class="gallery-info">
                ${photo.caption ? `<div class="gallery-caption">${escapeHtml(photo.caption)}</div>` : ''}
                <div class="gallery-meta">
                    <div class="uploader-profile">
                        <img src="${photo.avatar}" style="width: 20px; height: 20px; border-radius: 50%; object-fit: cover;">
                        <span class="uploader-name">${escapeHtml(photo.uploadedBy)}</span>
                    </div>
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span style="font-size: 10px; color: var(--text-secondary);">${timeString}</span>
                        ${deleteBtnHtml}
                    </div>
                </div>
            </div>
        `;
        grid.appendChild(card);
    });
}

function handleAddPhoto(e) {
    e.preventDefault();
    if (!currentProfile) return showProfileSelector();
    
    const fileInput = document.getElementById('galleryFile');
    const captionInput = document.getElementById('galleryCaption');
    const file = fileInput.files[0];
    const caption = captionInput.value.trim();
    
    if (!file) return alert('Please choose a file!');
    
    const reader = new FileReader();
    reader.onload = function(event) {
        const img = new Image();
        img.onload = function() {
            const canvas = document.createElement('canvas');
            const MAX_WIDTH = 600; // Downscale to keep document <100KB inside Firestore
            let width = img.width;
            let height = img.height;
            
            if (width > MAX_WIDTH) {
                height *= MAX_WIDTH / width;
                width = MAX_WIDTH;
            }
            
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);
            
            const compressedBase64 = canvas.toDataURL('image/jpeg', 0.7);
            const activeData = customProfiles[currentProfile.role];
            
            const newPhoto = {
                image: compressedBase64,
                caption: caption,
                uploadedBy: currentProfile.member,
                role: currentProfile.role,
                avatar: activeData.avatar,
                timestamp: Date.now()
            };
            
            if (useFirebase) {
                db.collection('gallery').add(newPhoto)
                  .then(() => {
                      document.getElementById('galleryForm').reset();
                  })
                  .catch(err => {
                      console.error("Error sharing photo:", err);
                      alert("Failed to upload photo. Check your internet connection.");
                  });
            } else {
                const id = 'photo_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
                newPhoto.id = id;
                localGallery.push(newPhoto);
                localStorage.setItem('family_sync_gallery', JSON.stringify(localGallery));
                document.getElementById('galleryForm').reset();
                loadGallery();
            }
        };
        
        img.onerror = function() {
            console.error("Error loading image inside FileReader.");
            alert("Failed to process the photo. Try choosing a different picture.");
        };
        
        img.src = event.target.result;
    };
    
    reader.onerror = function() {
        console.error("FileReader error occurred.");
        alert("Failed to read the photo file from your device.");
    };
    
    reader.readAsDataURL(file);
}

window.deletePhoto = function(photoId) {
    if (!currentProfile) return showProfileSelector();
    
    if (confirm("Are you sure you want to delete this photo?")) {
        if (useFirebase) {
            db.collection('gallery').doc(photoId).get().then(doc => {
                if (doc.exists && doc.data().uploadedBy === currentProfile.member) {
                    db.collection('gallery').doc(photoId).delete()
                      .catch(err => console.error("Error deleting photo:", err));
                } else {
                    alert("You can only delete photos uploaded by yourself!");
                }
            });
        } else {
            const idx = localGallery.findIndex(p => p.id === photoId);
            if (idx !== -1) {
                if (localGallery[idx].uploadedBy === currentProfile.member) {
                    localGallery = localGallery.filter(p => p.id !== photoId);
                    localStorage.setItem('family_sync_gallery', JSON.stringify(localGallery));
                    loadGallery();
                } else {
                    alert("You can only delete photos uploaded by yourself!");
                }
            }
        }
    }
};

// Onboarding Access Lock & Geolocation Prompt Handlers
function checkAppUnlock() {
    const unlocked = localStorage.getItem('family_sync_app_unlocked') === 'true';
    const overlay = document.getElementById('appUnlockOverlay');
    if (unlocked) {
        if (overlay) overlay.classList.remove('active');
        checkExistingProfile();
    } else {
        if (overlay) overlay.classList.add('active');
        const profOverlay = document.getElementById('profileOverlay');
        if (profOverlay) profOverlay.classList.remove('active');
    }
}

function handleAppUnlock(e) {
    e.preventDefault();
    const pwd = document.getElementById('appPasswordInput').value;
    if (pwd === '@Naman1234') {
        localStorage.setItem('family_sync_app_unlocked', 'true');
        
        // Ask for Notification permission first, then ask for Geolocation permission
        requestNotificationPermission().then(() => {
            if (navigator.geolocation) {
                navigator.geolocation.getCurrentPosition(
                    (pos) => {
                        console.log("Location permission granted on onboarding.");
                        startLocationSharing();
                        proceedAfterUnlock();
                    },
                    (err) => {
                        console.warn("Location permission denied on onboarding: ", err);
                        proceedAfterUnlock();
                    }
                );
            } else {
                proceedAfterUnlock();
            }
        });
    } else {
        alert('Invalid access password!');
    }
}

function proceedAfterUnlock() {
    const overlay = document.getElementById('appUnlockOverlay');
    if (overlay) overlay.classList.remove('active');
    checkExistingProfile();
}

// HTML5 Notification Permission Request
function requestNotificationPermission() {
    if ("Notification" in window && Notification.permission === "default") {
        return Notification.requestPermission().then(permission => {
            console.log("Notification permission state: ", permission);
            return permission;
        });
    }
    return Promise.resolve(window.Notification ? Notification.permission : "unsupported");
}

// Request notification permission on first user interaction if already logged in but never prompted/set
document.addEventListener('click', function promptOnFirstInteraction() {
    if (localStorage.getItem('family_sync_app_unlocked') === 'true') {
        if ("Notification" in window && Notification.permission === "default") {
            requestNotificationPermission();
        }
        document.removeEventListener('click', promptOnFirstInteraction);
    }
}, { once: true });
