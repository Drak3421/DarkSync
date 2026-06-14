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
let pendingProfileRole = null;
let loadedTasks = [];
let activeChatRoom = 'main';
let chatListener = null;
let useFirebase = false;
let loadedGalleryPhotos = [];
let activePhotoIndex = -1;
let lightboxZoomLevel = 1;
let db = null;
let ownerMap = null;
let mapMarker = null;
let historyPolyline = null;
let historyMarkers = [];
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
            const firestoreDb = firebase.firestore();
            firestoreDb.settings({ cacheSizeBytes: firebase.firestore.CACHE_SIZE_UNLIMITED });
            firestoreDb.enablePersistence().catch(err => {
                if (err.code == 'failed-precondition') {
                    console.warn("Firestore persistence failed: Multiple tabs open");
                } else if (err.code == 'unimplemented') {
                    console.warn("Firestore persistence is not supported by this browser");
                } else {
                    console.warn("Firestore persistence initialization failed:", err);
                }
            });
            db = firestoreDb;
            useFirebase = true;
            console.log('Firebase Realtime Sync Activated!');

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
    // Profile Selection Event Delegation
    const profileContainer = document.getElementById('profileListContainer');
    if (profileContainer) {
        profileContainer.addEventListener('click', (e) => {
            const card = e.target.closest('.profile-card');
            if (card) {
                const role = card.dataset.role;
                handleProfileCardClick(role);
            }
        });
    }

    // PIN modal actions
    document.getElementById('cancelPinEntryBtn').addEventListener('click', () => {
        document.getElementById('profilePinEntryOverlay').classList.remove('active');
        document.getElementById('profilePinInput').value = '';
    });
    document.getElementById('cancelPinSetupBtn').addEventListener('click', () => {
        document.getElementById('profilePinSetupOverlay').classList.remove('active');
        document.getElementById('profilePinSetupInput').value = '';
        document.getElementById('profilePinConfirmInput').value = '';
    });

    // Form Submissions for PIN
    document.getElementById('profilePinEntryForm').addEventListener('submit', handlePinEntrySubmit);
    document.getElementById('profilePinSetupForm').addEventListener('submit', handlePinSetupSubmit);

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

    // Manage Family Buttons
    const manageFamilyBtn = document.getElementById('manageFamilyBtn');
    if (manageFamilyBtn) {
        manageFamilyBtn.addEventListener('click', () => {
            const pwd = prompt("Enter owner password to manage family:");
            if (pwd === '@Muskan1234') {
                openManageFamilyModal();
            } else if (pwd !== null) {
                alert("Incorrect password!");
            }
        });
    }

    const closeManageFamilyBtn = document.getElementById('closeManageFamilyBtn');
    if (closeManageFamilyBtn) {
        closeManageFamilyBtn.addEventListener('click', () => {
            document.getElementById('manageFamilyOverlay').classList.remove('active');
        });
    }

    const addMemberForm = document.getElementById('addMemberForm');
    if (addMemberForm) {
        addMemberForm.addEventListener('submit', handleAddMember);
    }

    // Task Board sorting & filtering changes
    const filterCat = document.getElementById('filterCategory');
    if (filterCat) {
        filterCat.addEventListener('change', () => renderTasks(loadedTasks));
    }
    const sortTasks = document.getElementById('sortTasks');
    if (sortTasks) {
        sortTasks.addEventListener('change', () => renderTasks(loadedTasks));
    }

    // Chat Sidebar switching
    const chatSidebar = document.querySelector('.chat-sidebar');
    if (chatSidebar) {
        chatSidebar.addEventListener('click', (e) => {
            const item = e.target.closest('.chat-room-item');
            if (item) {
                chatSidebar.querySelectorAll('.chat-room-item').forEach(el => {
                    el.classList.remove('active');
                    el.style.borderLeft = 'none';
                    el.style.background = 'transparent';
                });
                
                item.classList.add('active');
                item.style.borderLeft = '3px solid var(--primary-color)';
                item.style.background = 'rgba(255, 255, 255, 0.02)';
                
                const roomId = item.dataset.roomId;
                const roomName = item.dataset.roomName || 'Main Lounge';
                switchChatRoom(roomId, roomName);
            }
        });
    }

    // Image Attachment Button
    const attachBtn = document.getElementById('chatAttachBtn');
    const attachInput = document.getElementById('chatAttachInput');
    if (attachBtn && attachInput) {
        attachBtn.addEventListener('click', () => attachInput.click());
        attachInput.addEventListener('change', handleChatImageUpload);
    }

    // Lightbox Controls
    const closeLightboxBtn = document.getElementById('closeLightboxBtn');
    if (closeLightboxBtn) {
        closeLightboxBtn.addEventListener('click', closeLightbox);
    }
    const prevLightboxBtn = document.getElementById('prevLightboxBtn');
    if (prevLightboxBtn) {
        prevLightboxBtn.addEventListener('click', showPrevPhoto);
    }
    const nextLightboxBtn = document.getElementById('nextLightboxBtn');
    if (nextLightboxBtn) {
        nextLightboxBtn.addEventListener('click', showNextPhoto);
    }
    const zoomInBtn = document.getElementById('zoomInBtn');
    if (zoomInBtn) {
        zoomInBtn.addEventListener('click', () => {
            lightboxZoomLevel = Math.min(3, lightboxZoomLevel + 0.25);
            updateLightboxZoom();
        });
    }
    const zoomOutBtn = document.getElementById('zoomOutBtn');
    if (zoomOutBtn) {
        zoomOutBtn.addEventListener('click', () => {
            lightboxZoomLevel = Math.max(0.5, lightboxZoomLevel - 0.25);
            updateLightboxZoom();
        });
    }
    const lightboxImage = document.getElementById('lightboxImage');
    if (lightboxImage) {
        lightboxImage.addEventListener('click', () => {
            lightboxZoomLevel = lightboxZoomLevel > 1 ? 1 : 2;
            updateLightboxZoom();
        });
    }
    const lightboxLikeBtn = document.getElementById('lightboxLikeBtn');
    if (lightboxLikeBtn) {
        lightboxLikeBtn.addEventListener('click', toggleLightboxLike);
    }
    const lightboxCommentForm = document.getElementById('lightboxCommentForm');
    if (lightboxCommentForm) {
        lightboxCommentForm.addEventListener('submit', handleAddLightboxComment);
    }

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
            if (snapshot.empty) {
                seedDefaultProfiles();
                return;
            }
            customProfiles = {};
            snapshot.forEach(doc => {
                customProfiles[doc.id] = doc.data();
            });
            updateProfileUI();
            updateOnlineIndicators();
            checkExistingProfile();
        });
    } else {
        const savedCustom = localStorage.getItem('family_sync_custom_profiles');
        if (savedCustom) {
            customProfiles = JSON.parse(savedCustom);
        } else {
            localStorage.setItem('family_sync_custom_profiles', JSON.stringify(customProfiles));
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
    const listContainer = document.getElementById('profileListContainer');
    if (listContainer) {
        let listHtml = '';
        for (const [role, data] of Object.entries(customProfiles)) {
            listHtml += `
                <div class="profile-card" data-member="${escapeHtml(data.member)}" data-role="${escapeHtml(role)}" data-avatar="${escapeHtml(data.avatar)}">
                    <img src="${escapeHtml(data.avatar)}" alt="${escapeHtml(data.member)}" class="avatar-large profile-img-${getShortKey(role)}">
                    <div class="profile-name name-${getShortKey(role)}">${escapeHtml(data.member)}</div>
                    <div class="profile-role">${escapeHtml(role)}</div>
                </div>
            `;
        }
        listContainer.innerHTML = listHtml;
    }

    const assigneeSelect = document.getElementById('taskAssignee');
    if (assigneeSelect) {
        assigneeSelect.innerHTML = '<option value="" disabled selected>Select family member</option>';
        for (const [role, data] of Object.entries(customProfiles)) {
            assigneeSelect.innerHTML += `
                <option value="${escapeHtml(data.member)}">${escapeHtml(role)} (${escapeHtml(data.member)})</option>
            `;
        }
    }

    for (const [role, data] of Object.entries(customProfiles)) {
        const key = getShortKey(role);
        
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
    }
    updateChatSidebar();
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

// PIN Hashing and Handling
async function hashPin(pin) {
    const encoder = new TextEncoder();
    const data = encoder.encode(pin);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

function handleProfileCardClick(role) {
    pendingProfileRole = role;
    const profile = customProfiles[role];
    if (!profile) return;

    if (!profile.pinHash) {
        document.getElementById('pinSetupTitle').textContent = `Set PIN for ${profile.member}`;
        document.getElementById('profilePinSetupInput').value = '';
        document.getElementById('profilePinConfirmInput').value = '';
        document.getElementById('profilePinSetupOverlay').classList.add('active');
    } else {
        document.getElementById('pinEntryTitle').textContent = `Enter PIN for ${profile.member}`;
        document.getElementById('profilePinInput').value = '';
        document.getElementById('profilePinEntryOverlay').classList.add('active');
    }
}

async function handlePinEntrySubmit(e) {
    e.preventDefault();
    const pinVal = document.getElementById('profilePinInput').value;
    if (!pinVal || pinVal.length !== 4) return alert('Please enter a 4-digit PIN');

    const enteredHash = await hashPin(pinVal);
    const storedHash = customProfiles[pendingProfileRole].pinHash;

    if (enteredHash === storedHash) {
        document.getElementById('profilePinEntryOverlay').classList.remove('active');
        document.getElementById('profilePinInput').value = '';
        selectProfile(pendingProfileRole);
    } else {
        alert('Incorrect PIN! Please try again.');
        document.getElementById('profilePinInput').value = '';
    }
}

async function handlePinSetupSubmit(e) {
    e.preventDefault();
    const pinVal = document.getElementById('profilePinSetupInput').value;
    const confirmVal = document.getElementById('profilePinConfirmInput').value;

    if (!pinVal || pinVal.length !== 4) return alert('Please enter a 4-digit PIN');
    if (pinVal !== confirmVal) return alert('PINs do not match!');

    const hash = await hashPin(pinVal);
    
    if (useFirebase) {
        db.collection('profiles').doc(pendingProfileRole).update({
            pinHash: hash
        }).then(() => {
            document.getElementById('profilePinSetupOverlay').classList.remove('active');
            selectProfile(pendingProfileRole);
        }).catch(err => {
            console.error("Error setting PIN:", err);
            alert("Failed to save PIN in cloud. Check your connection.");
        });
    } else {
        customProfiles[pendingProfileRole].pinHash = hash;
        localStorage.setItem('family_sync_custom_profiles', JSON.stringify(customProfiles));
        document.getElementById('profilePinSetupOverlay').classList.remove('active');
        selectProfile(pendingProfileRole);
    }
}

function seedDefaultProfiles() {
    const defaults = {
        "Dad": { member: "Ajay Yadav", avatar: "https://api.dicebear.com/7.x/bottts/svg?seed=Ajay", lastActive: 0, locationPermissionGranted: false },
        "Mom": { member: "Poonam Yadav", avatar: "https://api.dicebear.com/7.x/bottts/svg?seed=Poonam", lastActive: 0, locationPermissionGranted: false },
        "Child 1": { member: "Naman", avatar: "https://api.dicebear.com/7.x/bottts/svg?seed=Naman", lastActive: 0, locationPermissionGranted: false },
        "Child 2": { member: "Muskan", avatar: "https://api.dicebear.com/7.x/bottts/svg?seed=Muskan", lastActive: 0, locationPermissionGranted: false }
    };
    
    const batch = db.batch();
    for (const [role, data] of Object.entries(defaults)) {
        const ref = db.collection('profiles').doc(role);
        batch.set(ref, data);
    }
    batch.commit().then(() => {
        console.log("Default profiles seeded to Firestore.");
    }).catch(err => {
        console.error("Error seeding default profiles:", err);
    });
}

function openManageFamilyModal() {
    renderManageFamilyList();
    document.getElementById('manageFamilyOverlay').classList.add('active');
}

function renderManageFamilyList() {
    const list = document.getElementById('manageFamilyList');
    if (!list) return;
    
    list.innerHTML = '';
    for (const [role, data] of Object.entries(customProfiles)) {
        const div = document.createElement('div');
        div.style.cssText = "display: flex; justify-content: space-between; align-items: center; padding: 10px 14px; background: rgba(255,255,255,0.02); border: 1px solid var(--border-color); border-radius: 10px; gap: 10px;";
        div.innerHTML = `
            <div style="display: flex; align-items: center; gap: 8px;">
                <img src="${escapeHtml(data.avatar)}" style="width: 28px; height: 28px; border-radius: 50%;">
                <span style="font-size: 13px; font-weight: 600; color: var(--text-color);">${escapeHtml(data.member)} (${escapeHtml(role)})</span>
            </div>
            <button class="btn-delete-task" onclick="deleteFamilyMember('${role}')" title="Delete Member" style="padding: 4px 8px; color: var(--accent-color);"><i class="fa-solid fa-user-minus"></i></button>
        `;
        list.appendChild(div);
    }
}

window.deleteFamilyMember = function(role) {
    if (Object.keys(customProfiles).length <= 1) {
        return alert("You must have at least one family member profile!");
    }
    
    if (confirm(`Are you sure you want to delete the profile "${customProfiles[role].member} (${role})"?`)) {
        if (currentProfile && currentProfile.role === role) {
            localStorage.removeItem('family_sync_profile_role');
            currentProfile = null;
        }
        
        if (useFirebase) {
            db.collection('profiles').doc(role).delete()
              .then(() => {
                  renderManageFamilyList();
                  if (!currentProfile) showProfileSelector();
              })
              .catch(err => console.error("Error deleting member:", err));
        } else {
            delete customProfiles[role];
            localStorage.setItem('family_sync_custom_profiles', JSON.stringify(customProfiles));
            updateProfileUI();
            renderManageFamilyList();
            if (!currentProfile) showProfileSelector();
        }
    }
};

function handleAddMember(e) {
    e.preventDefault();
    const name = document.getElementById('newMemberName').value.trim();
    const role = document.getElementById('newMemberRole').value.trim();
    let seed = document.getElementById('newMemberAvatar').value.trim();
    
    if (!name || !role) return;
    if (customProfiles[role]) {
        return alert("A family member with this Role/Column name already exists!");
    }
    
    if (!seed) seed = name;
    const avatar = `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(seed)}`;
    
    const newMember = {
        member: name,
        avatar: avatar,
        lastActive: 0,
        locationPermissionGranted: false
    };
    
    if (useFirebase) {
        db.collection('profiles').doc(role).set(newMember)
          .then(() => {
              document.getElementById('addMemberForm').reset();
              renderManageFamilyList();
          })
          .catch(err => console.error("Error adding member:", err));
    } else {
        customProfiles[role] = newMember;
        localStorage.setItem('family_sync_custom_profiles', JSON.stringify(customProfiles));
        updateProfileUI();
        document.getElementById('addMemberForm').reset();
        renderManageFamilyList();
    }
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

async function saveProfileChanges() {
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

    const newPin = document.getElementById('editProfilePin').value.trim();
    const confirmPin = document.getElementById('editProfilePinConfirm').value.trim();

    if (newPin || confirmPin) {
        if (newPin.length !== 4 || !/^[0-9]{4}$/.test(newPin)) {
            return alert('New PIN must be exactly 4 digits!');
        }
        if (newPin !== confirmPin) {
            return alert('New PIN and confirmation do not match!');
        }
        const hash = await hashPin(newPin);
        updatedData.pinHash = hash;
    }

    if (useFirebase) {
        db.collection('profiles').doc(role).update(updatedData)
          .then(() => {
              document.getElementById('editProfilePin').value = '';
              document.getElementById('editProfilePinConfirm').value = '';
              closeEditProfileModal();
          })
          .catch(err => {
              console.error("Error updating profile:", err);
              alert("Failed to save profile. Check connection.");
          });
    } else {
        customProfiles[role] = {
            ...customProfiles[role],
            ...updatedData
        };
        localStorage.setItem('family_sync_custom_profiles', JSON.stringify(customProfiles));
        document.getElementById('editProfilePin').value = '';
        document.getElementById('editProfilePinConfirm').value = '';
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
                               showLocalNotification("New Task Assigned!", {
                                   body: `${task.assignedBy} assigned you: "${task.title}"`,
                                   icon: "icon.jpg",
                                   tag: "task-new-" + change.doc.id
                               });
                           }
                      } else if (change.type === "modified") {
                          // Notify assigner of completion
                           if (task.completed && task.completedAt > appStartTime && task.assignedBy === currentProfile.member && task.completedBy !== currentProfile.member) {
                               showLocalNotification("Task Completed!", {
                                   body: `${task.completedBy} completed your task: "${task.title}"`,
                                   icon: "icon.jpg",
                                   tag: "task-done-" + change.doc.id
                               });
                           }
                      }
                  }
              });
              
              loadedTasks = tasks;
              cleanupOldCompletedTasks(tasks);
              renderTasks(tasks);
          }, (err) => {
              console.error("Firestore sync error:", err);
              loadedTasks = localTasks;
              cleanupOldCompletedTasks(localTasks);
              renderTasks(localTasks);
          });
    } else {
        loadedTasks = localTasks;
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
    const grid = document.getElementById('dynamicTasksGrid');
    if (!grid) return;

    grid.innerHTML = '';
    for (const [role, data] of Object.entries(customProfiles)) {
        const shortKey = getShortKey(role);
        grid.innerHTML += `
            <div class="task-column" data-role="${escapeHtml(role)}">
                <div class="column-header">
                    <div class="column-user-info">
                        <img src="${escapeHtml(data.avatar)}" alt="${escapeHtml(data.member)}" style="width: 24px; height: 24px; border-radius: 50%;">
                        <span class="column-title">${escapeHtml(data.member)} (${escapeHtml(role)})</span>
                    </div>
                    <span class="column-count" id="count-${shortKey}">0</span>
                </div>
                <div class="task-list" id="list-${shortKey}">
                    <!-- Tasks list -->
                </div>
            </div>
        `;
    }

    const completedGrid = document.getElementById('completedTasksGrid');
    completedGrid.innerHTML = '';

    let activeCountMap = {};
    for (const [role, data] of Object.entries(customProfiles)) {
        activeCountMap[data.member] = 0;
    }
    
    let completedListHtml = '';

    const filterCat = document.getElementById('filterCategory') ? document.getElementById('filterCategory').value : 'All';
    const sortBy = document.getElementById('sortTasks') ? document.getElementById('sortTasks').value : 'priority';

    let filteredTasks = tasks;
    if (filterCat !== 'All') {
        filteredTasks = tasks.filter(t => t.category === filterCat);
    }

    filteredTasks.sort((a, b) => {
        if (sortBy === 'priority') {
            const priorityOrder = { 'high-priority': 3, 'normal-priority': 2, 'low-priority': 1 };
            return (priorityOrder[b.priority] || 2) - (priorityOrder[a.priority] || 2);
        } else if (sortBy === 'dueDate') {
            const dateA = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
            const dateB = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
            return dateA - dateB;
        } else if (sortBy === 'dateCreated') {
            return (b.timestamp || 0) - (a.timestamp || 0);
        }
        return 0;
    });

    filteredTasks.forEach(task => {
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
                <span style="color: var(--text-secondary); font-size: 13px;">No tasks match the filters or completed today.</span>
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

    const catIcons = { Chores: '🧹', Grocery: '🛒', Study: '📚', Finance: '💳', Other: '✨' };
    const catText = task.category || 'Other';
    const catIcon = catIcons[catText] || '✨';

    let dueBadgeHtml = '';
    if (task.dueDate) {
        const today = new Date();
        today.setHours(0,0,0,0);
        const due = new Date(task.dueDate);
        due.setHours(0,0,0,0);
        
        const isOverdue = due < today;
        const isDueToday = due.getTime() === today.getTime();
        
        let badgeColor = 'rgba(255, 255, 255, 0.05)';
        let textColor = 'var(--text-secondary)';
        if (isOverdue) {
            badgeColor = 'rgba(255, 59, 48, 0.15)';
            textColor = 'var(--accent-color)';
        } else if (isDueToday) {
            badgeColor = 'rgba(255, 159, 10, 0.15)';
            textColor = '#ff9f0a';
        }
        
        dueBadgeHtml = `<span style="font-size: 10px; font-weight:600; padding: 2px 8px; border-radius: 4px; background: ${badgeColor}; color: ${textColor}; display: inline-flex; align-items: center; gap: 4px;">
            <i class="fa-regular fa-calendar"></i> Due: ${task.dueDate}
        </span>`;
    }

    const div = document.createElement('div');
    div.className = `task-card ${task.priority}`;
    div.innerHTML = `
        <div class="task-header" style="display: flex; justify-content: space-between; align-items: flex-start; gap: 10px;">
            <div class="task-title" style="flex-grow: 1;">${escapeHtml(task.title)}</div>
            ${deleteBtnHtml}
        </div>
        ${task.desc ? `<div class="task-desc">${escapeHtml(task.desc)}</div>` : ''}
        
        <div style="display: flex; gap: 8px; flex-wrap: wrap; margin-top: 5px;">
            <span style="font-size: 10px; font-weight:600; padding: 2px 8px; border-radius: 4px; background: rgba(255, 255, 255, 0.05); color: var(--text-color);">
                ${catIcon} ${catText}
            </span>
            ${dueBadgeHtml}
        </div>

        <div class="task-footer" style="margin-top: 10px;">
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
    const category = document.getElementById('taskCategory').value;
    const dueDate = document.getElementById('taskDueDate').value;

    if (!assignee || !title) return;

    const newTask = {
        title,
        desc,
        assignee,
        priority,
        category,
        dueDate,
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
function updateChatSidebar() {
    const dmList = document.getElementById('dmList');
    if (!dmList) return;
    
    dmList.innerHTML = '';
    for (const [role, data] of Object.entries(customProfiles)) {
        if (currentProfile && currentProfile.role === role) continue;
        
        const dmRoomId = `dm_${getDmRoomSuffix(currentProfile.role, role)}`;
        const isSelected = activeChatRoom === dmRoomId;
        
        const div = document.createElement('div');
        div.className = `chat-room-item ${isSelected ? 'active' : ''}`;
        div.dataset.roomId = dmRoomId;
        div.dataset.roomName = data.member;
        
        const now = Date.now();
        const isOnline = (now - (data.lastActive || 0)) < 70000;
        const statusClass = isOnline ? 'online' : 'offline';

        div.style.cssText = "padding: 10px 15px; cursor: pointer; display: flex; align-items: center; gap: 10px; font-size: 13px; transition: var(--transition); border-left: " + (isSelected ? "3px solid var(--primary-color)" : "none") + "; background: " + (isSelected ? "rgba(255, 255, 255, 0.02)" : "transparent") + ";";

        div.innerHTML = `
            <div style="position: relative; display: flex; align-items: center;">
                <img src="${escapeHtml(data.avatar)}" style="width: 24px; height: 24px; border-radius: 50%;">
                <span class="status-dot ${statusClass}" style="position: absolute; bottom: -2px; right: -2px; border: 2px solid #1c1c1e; width: 8px; height: 8px;"></span>
            </div>
            <span style="font-weight: 500; color: var(--text-color);">${escapeHtml(data.member)}</span>
        `;
        
        dmList.appendChild(div);
    }
}

function getDmRoomSuffix(roleA, roleB) {
    return [roleA || '', roleB || ''].sort().join('_').replace(/ /g, '_');
}

function switchChatRoom(roomId, roomName) {
    activeChatRoom = roomId;
    document.getElementById('activeChatRoomName').textContent = roomName;
    
    if (chatListener) {
        chatListener();
        chatListener = null;
    }
    
    // Clear list view first to show it's loading
    document.getElementById('chatMessages').innerHTML = '';
    loadMessages();
}

function handleChatImageUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    if (!currentProfile) return showProfileSelector();
    
    const reader = new FileReader();
    reader.onload = function(event) {
        const img = new Image();
        img.onload = function() {
            const canvas = document.createElement('canvas');
            const MAX_WIDTH = 500;
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
            
            const base64 = canvas.toDataURL('image/jpeg', 0.7);
            sendChatMessage(null, base64);
            document.getElementById('chatAttachInput').value = '';
        };
        img.src = event.target.result;
    };
    reader.readAsDataURL(file);
}

function sendChatMessage(text, imageData) {
    if (!currentProfile) return showProfileSelector();
    const activeData = customProfiles[currentProfile.role];
    
    const newMsg = {
        sender: activeData.member,
        role: currentProfile.role,
        avatar: activeData.avatar,
        roomId: activeChatRoom,
        timestamp: Date.now()
    };
    
    if (text) newMsg.text = text;
    if (imageData) newMsg.image = imageData;
    
    if (useFirebase) {
        db.collection('chat').add(newMsg)
          .catch(err => console.error("Error sending message:", err));
    } else {
        const id = 'msg_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
        newMsg.id = id;
        localMessages.push(newMsg);
        localStorage.setItem('family_sync_messages', JSON.stringify(localMessages));
        loadMessages();
    }
}

// Chat Messaging
function loadMessages() {
    if (useFirebase) {
        chatListener = db.collection('chat')
          .where('roomId', '==', activeChatRoom)
          .orderBy('timestamp', 'asc')
          .onSnapshot((snapshot) => {
              const messages = [];
              snapshot.forEach(doc => {
                  messages.push({ id: doc.id, ...doc.data() });
              });
              
              snapshot.docChanges().forEach(change => {
                  if (change.type === "added") {
                      const msg = change.doc.data();
                      if (msg.timestamp > appStartTime && currentProfile && msg.sender !== currentProfile.member) {
                          if (msg.roomId !== activeChatRoom) {
                              showLocalNotification(`New Message from ${msg.sender}`, {
                                  body: msg.text || "Sent a photo",
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
              const filtered = localMessages.filter(m => (m.roomId || 'main') === activeChatRoom);
              renderMessages(filtered);
          });
    } else {
        const filtered = localMessages.filter(m => (m.roomId || 'main') === activeChatRoom);
        renderMessages(filtered);
    }
}

function renderMessages(messages) {
    const container = document.getElementById('chatMessages');
    if (!container) return;

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

        const smileBtnHtml = `<button onclick="toggleReactionPicker(event, '${msg.id}')" title="React" style="background:none; border:none; color:inherit; opacity:0.5; cursor:pointer; margin-left:6px; font-size:11px; transition:opacity 0.2s;"><i class="fa-regular fa-face-smile"></i></button>`;

        let reactionsHtml = '';
        if (msg.reactions && Object.keys(msg.reactions).length > 0) {
            const counts = {};
            for (const [member, emoji] of Object.entries(msg.reactions)) {
                counts[emoji] = (counts[emoji] || 0) + 1;
            }
            reactionsHtml = `<div class="msg-reactions" style="display: flex; gap: 4px; margin-top: 6px; flex-wrap: wrap;">`;
            for (const [emoji, count] of Object.entries(counts)) {
                reactionsHtml += `
                    <span class="reaction-badge" onclick="toggleReaction('${msg.id}', '${emoji}')" style="display: inline-flex; align-items: center; gap: 4px; font-size: 10px; padding: 2px 6px; border-radius: 980px; background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.04); cursor: pointer; user-select: none;">
                        <span>${emoji}</span> <span style="color: var(--text-secondary); font-size: 9px;">${count}</span>
                    </span>
                `;
            }
            reactionsHtml += `</div>`;
        }

        let bodyContent = '';
        if (msg.image) {
            bodyContent = `<img src="${msg.image}" style="max-width: 100%; border-radius: 12px; margin-top: 4px; display: block; border: 1px solid rgba(255,255,255,0.08);">`;
        } else {
            bodyContent = `<span class="msg-text">${escapeHtml(msg.text)}</span>`;
        }

        msgDiv.innerHTML = `
            <img src="${msg.avatar}" alt="${msg.sender}" class="avatar" style="align-self: flex-end;">
            <div class="msg-bubble">
                <div style="display:flex; justify-content:space-between; align-items:center; gap:10px;">
                    <span class="msg-sender">${escapeHtml(msg.sender)} (${escapeHtml(msg.role)})</span>
                    <div style="display:flex; align-items:center;">
                        ${deleteMsgHtml}
                        ${smileBtnHtml}
                    </div>
                </div>
                ${bodyContent}
                ${reactionsHtml}
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
    const input = document.getElementById('chatInput');
    const text = input.value.trim();
    if (!text) return;
    
    sendChatMessage(text, null);
    input.value = '';
    setTypingState(false);
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

                    const historyEntry = {
                        latitude: position.coords.latitude,
                        longitude: position.coords.longitude,
                        accuracy: position.coords.accuracy,
                        timestamp: coords.locationTimestamp
                    };
                    db.collection('profiles').doc(currentProfile.role).collection('history').doc(String(coords.locationTimestamp)).set(historyEntry)
                      .catch(err => console.error("Error saving location history entry:", err));

                    // Prune history older than 12 hours (12 * 3600 * 1000 = 43200000 ms)
                    const cutoff = Date.now() - 43200000;
                    db.collection('profiles').doc(currentProfile.role).collection('history')
                      .where('timestamp', '<', cutoff).get().then(snapshot => {
                          const batch = db.batch();
                          snapshot.forEach(doc => {
                              batch.delete(doc.ref);
                          });
                          batch.commit().catch(err => console.error("Error pruning old history entries:", err));
                      }).catch(err => console.error("Error querying old history entries:", err));
                } else {
                    customProfiles[currentProfile.role] = {
                        ...customProfiles[currentProfile.role],
                        ...coords
                    };
                    localStorage.setItem('family_sync_custom_profiles', JSON.stringify(customProfiles));

                    const historyEntry = {
                        latitude: position.coords.latitude,
                        longitude: position.coords.longitude,
                        accuracy: position.coords.accuracy,
                        timestamp: coords.locationTimestamp
                    };
                    let localHistory = JSON.parse(localStorage.getItem('family_sync_history_' + currentProfile.role)) || [];
                    localHistory.push(historyEntry);
                    const cutoff = Date.now() - 43200000;
                    localHistory = localHistory.filter(h => h.timestamp >= cutoff);
                    localStorage.setItem('family_sync_history_' + currentProfile.role, JSON.stringify(localHistory));
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
    if (ownerMap) {
        if (mapMarker) {
            ownerMap.removeLayer(mapMarker);
            mapMarker = null;
        }
        if (historyPolyline) {
            ownerMap.removeLayer(historyPolyline);
            historyPolyline = null;
        }
        if (historyMarkers && historyMarkers.length > 0) {
            historyMarkers.forEach(m => ownerMap.removeLayer(m));
            historyMarkers = [];
        }
    }
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
    
    if (historyPolyline) {
        ownerMap.removeLayer(historyPolyline);
        historyPolyline = null;
    }
    if (historyMarkers && historyMarkers.length > 0) {
        historyMarkers.forEach(m => ownerMap.removeLayer(m));
        historyMarkers = [];
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

    // Fetch and plot 12-hour history trail (12 * 3600 * 1000 = 43200000 ms)
    const cutoff = Date.now() - 43200000;
    if (useFirebase) {
        db.collection('profiles').doc(role).collection('history')
          .where('timestamp', '>=', cutoff)
          .orderBy('timestamp', 'asc')
          .get()
          .then(snapshot => {
              const trail = [];
              snapshot.forEach(doc => {
                  trail.push(doc.data());
              });
              drawHistoryTrail(trail);
          })
          .catch(err => console.error("Error loading location history:", err));
    } else {
        let trail = JSON.parse(localStorage.getItem('family_sync_history_' + role)) || [];
        trail = trail.filter(h => h.timestamp >= cutoff);
        trail.sort((a, b) => a.timestamp - b.timestamp);
        drawHistoryTrail(trail);
    }
}

function drawHistoryTrail(trail) {
    if (!ownerMap || trail.length === 0) return;

    const latlngs = trail.map(h => [h.latitude, h.longitude]);

    historyPolyline = L.polyline(latlngs, {
        color: 'var(--primary-color)',
        dashArray: '5, 10',
        weight: 3,
        opacity: 0.8
    }).addTo(ownerMap);

    trail.forEach((h, index) => {
        const marker = L.circleMarker([h.latitude, h.longitude], {
            radius: 5,
            color: 'var(--primary-color)',
            fillColor: '#fff',
            weight: 2,
            opacity: 0.7,
            fillOpacity: 0.5
        }).addTo(ownerMap);

        const timeString = new Date(h.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        marker.bindPopup(`<strong>History Point ${index + 1}</strong><br>Time: ${timeString}<br>Accuracy: ±${Math.round(h.accuracy || 0)}m`);
        historyMarkers.push(marker);
    });
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
              loadedGalleryPhotos = photos;
              
              if (activePhotoIndex !== -1) {
                  renderLightboxPhoto();
              }
              renderGallery(photos);
          }, (err) => {
              console.error("Firestore gallery error:", err);
              loadedGalleryPhotos = localGallery;
              renderGallery(localGallery);
          });
    } else {
        loadedGalleryPhotos = localGallery;
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
        card.style.cursor = 'pointer';
        card.addEventListener('click', (e) => {
            if (e.target.closest('.btn-delete-photo')) return;
            openLightbox(photo.id);
        });
        
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
            const MAX_WIDTH = 600;
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
                likes: {},
                comments: [],
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

function openLightbox(photoId) {
    activePhotoIndex = loadedGalleryPhotos.findIndex(p => p.id === photoId);
    if (activePhotoIndex === -1) return;
    
    lightboxZoomLevel = 1;
    updateLightboxZoom();
    
    renderLightboxPhoto();
    document.getElementById('galleryLightboxModal').classList.add('active');
}

function closeLightbox() {
    document.getElementById('galleryLightboxModal').classList.remove('active');
    activePhotoIndex = -1;
}

function showPrevPhoto() {
    if (activePhotoIndex > 0) {
        activePhotoIndex--;
        lightboxZoomLevel = 1;
        updateLightboxZoom();
        renderLightboxPhoto();
    }
}

function showNextPhoto() {
    if (activePhotoIndex < loadedGalleryPhotos.length - 1) {
        activePhotoIndex++;
        lightboxZoomLevel = 1;
        updateLightboxZoom();
        renderLightboxPhoto();
    }
}

function updateLightboxZoom() {
    const img = document.getElementById('lightboxImage');
    if (img) {
        img.style.transform = `scale(${lightboxZoomLevel})`;
        img.style.cursor = lightboxZoomLevel > 1 ? 'zoom-out' : 'zoom-in';
    }
}

function renderLightboxPhoto() {
    const photo = loadedGalleryPhotos[activePhotoIndex];
    if (!photo) return;
    
    document.getElementById('lightboxImage').src = photo.image;
    document.getElementById('lightboxUploaderAvatar').src = photo.avatar;
    document.getElementById('lightboxUploaderName').textContent = `${photo.uploadedBy} (${photo.role || 'Member'})`;
    document.getElementById('lightboxTime').textContent = photo.timestamp ? new Date(photo.timestamp).toLocaleString() : '';
    document.getElementById('lightboxCaption').textContent = photo.caption || '';
    
    const likes = photo.likes || {};
    const likeCount = Object.keys(likes).length;
    document.getElementById('lightboxLikeCount').textContent = `${likeCount} ${likeCount === 1 ? 'like' : 'likes'}`;
    
    const likeBtn = document.getElementById('lightboxLikeBtn');
    const hasLiked = currentProfile && likes[currentProfile.member] === true;
    if (hasLiked) {
        likeBtn.innerHTML = `<i class="fa-solid fa-heart"></i> Liked`;
        likeBtn.style.background = 'var(--accent-color)';
        likeBtn.style.color = '#fff';
    } else {
        likeBtn.innerHTML = `<i class="fa-regular fa-heart"></i> Like`;
        likeBtn.style.background = 'rgba(255, 59, 48, 0.15)';
        likeBtn.style.color = 'var(--accent-color)';
    }
    
    const commentsList = document.getElementById('lightboxCommentsList');
    commentsList.innerHTML = '';
    const comments = photo.comments || [];
    if (comments.length === 0) {
        commentsList.innerHTML = `<div style="font-size: 12px; color: var(--text-secondary); font-style: italic; text-align: center; margin-top: 15px;">No comments yet. Be the first to comment!</div>`;
    } else {
        comments.forEach(c => {
            const timeStr = c.timestamp ? new Date(c.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : '';
            commentsList.innerHTML += `
                <div style="display: flex; gap: 8px; background: rgba(255,255,255,0.02); border: 1px solid var(--border-color); padding: 8px 10px; border-radius: 8px;">
                    <img src="${escapeHtml(c.avatar)}" style="width: 24px; height: 24px; border-radius: 50%; object-fit: cover;">
                    <div style="flex-grow: 1;">
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <span style="font-size: 11px; font-weight: 600; color: var(--text-color);">${escapeHtml(c.sender)}</span>
                            <span style="font-size: 9px; color: var(--text-secondary);">${timeStr}</span>
                        </div>
                        <div style="font-size: 12px; color: var(--text-color); margin-top: 3px; word-break: break-all;">${escapeHtml(c.text)}</div>
                    </div>
                </div>
            `;
        });
    }
}

function toggleLightboxLike() {
    if (!currentProfile) return showProfileSelector();
    const photo = loadedGalleryPhotos[activePhotoIndex];
    if (!photo) return;
    
    const member = currentProfile.member;
    const likes = photo.likes || {};
    
    if (likes[member]) {
        delete likes[member];
    } else {
        likes[member] = true;
    }
    
    if (useFirebase) {
        db.collection('gallery').doc(photo.id).update({ likes })
          .then(() => {
              photo.likes = likes;
              renderLightboxPhoto();
          })
          .catch(err => console.error("Error toggling like:", err));
    } else {
        photo.likes = likes;
        localStorage.setItem('family_sync_gallery', JSON.stringify(loadedGalleryPhotos));
        renderLightboxPhoto();
        renderGallery(loadedGalleryPhotos);
    }
}

function handleAddLightboxComment(e) {
    e.preventDefault();
    if (!currentProfile) return showProfileSelector();
    const photo = loadedGalleryPhotos[activePhotoIndex];
    if (!photo) return;
    
    const commentInput = document.getElementById('lightboxCommentInput');
    const text = commentInput.value.trim();
    if (!text) return;
    
    const newComment = {
        sender: currentProfile.member,
        avatar: currentProfile.avatar,
        text: text,
        timestamp: Date.now()
    };
    
    const comments = photo.comments || [];
    comments.push(newComment);
    
    if (useFirebase) {
        db.collection('gallery').doc(photo.id).update({ comments })
          .then(() => {
              photo.comments = comments;
              renderLightboxPhoto();
              commentInput.value = '';
          })
          .catch(err => console.error("Error adding comment:", err));
    } else {
        photo.comments = comments;
        localStorage.setItem('family_sync_gallery', JSON.stringify(loadedGalleryPhotos));
        renderLightboxPhoto();
        commentInput.value = '';
        renderGallery(loadedGalleryPhotos);
    }
}

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

// Show notification locally (using service worker if possible for mobile support)
function showLocalNotification(title, options) {
    if (Notification.permission === "granted") {
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.ready.then(registration => {
                registration.showNotification(title, options);
            }).catch(err => {
                console.warn("Service worker not ready, falling back to window.Notification", err);
                new Notification(title, options);
            });
        } else {
            new Notification(title, options);
        }
    }
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

window.toggleReactionPicker = function(e, msgId) {
    e.stopPropagation();
    
    const oldPicker = document.getElementById('emojiPickerEl');
    if (oldPicker) oldPicker.remove();

    const emojis = ['👍', '❤️', '😂', '😮', '😢', '🙏'];
    const picker = document.createElement('div');
    picker.id = 'emojiPickerEl';
    picker.style.cssText = "position: absolute; display: flex; gap: 8px; background: #1c1c1e; border: 1px solid var(--border-color); padding: 8px 12px; border-radius: 980px; box-shadow: 0 8px 24px rgba(0,0,0,0.5); z-index: 100;";
    
    emojis.forEach(emoji => {
        const btn = document.createElement('button');
        btn.textContent = emoji;
        btn.style.cssText = "background: none; border: none; font-size: 16px; cursor: pointer; transition: transform 0.2s;";
        btn.onmouseover = () => btn.style.transform = "scale(1.3)";
        btn.onmouseout = () => btn.style.transform = "scale(1)";
        btn.onclick = () => {
            toggleReaction(msgId, emoji);
            picker.remove();
        };
        picker.appendChild(btn);
    });
    
    const rect = e.currentTarget.getBoundingClientRect();
    document.body.appendChild(picker);
    
    picker.style.top = `${rect.top + window.scrollY - 45}px`;
    picker.style.left = `${Math.max(10, rect.left + window.scrollX - 90)}px`;
    
    document.addEventListener('click', function closePicker(event) {
        if (!picker.contains(event.target)) {
            picker.remove();
            document.removeEventListener('click', closePicker);
        }
    }, { capture: true });
};

window.toggleReaction = function(msgId, emoji) {
    if (!currentProfile) return showProfileSelector();
    const member = currentProfile.member;
    
    if (useFirebase) {
        const docRef = db.collection('chat').doc(msgId);
        docRef.get().then(doc => {
            if (doc.exists) {
                const data = doc.data();
                const reactions = data.reactions || {};
                if (reactions[member] === emoji) {
                    delete reactions[member];
                } else {
                    reactions[member] = emoji;
                }
                docRef.update({ reactions });
            }
        });
    } else {
        const msgIdx = localMessages.findIndex(m => m.id === msgId);
        if (msgIdx !== -1) {
            const reactions = localMessages[msgIdx].reactions || {};
            if (reactions[member] === emoji) {
                delete reactions[member];
            } else {
                reactions[member] = emoji;
            }
            localMessages[msgIdx].reactions = reactions;
            localStorage.setItem('family_sync_messages', JSON.stringify(localMessages));
            loadMessages();
        }
    }
};
