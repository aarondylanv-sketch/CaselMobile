// ============ STATE ============
let currentUser = null;
let userProfile = null;
let activeChatId = null;
let activeChatData = null;
let unsubscribeMessages = null;
let unsubscribeChats = null;
let selectedMessageId = null;
let selectedMessageData = null;
let isOnline = navigator.onLine;
let confirmCallback = null;
let promptCallback = null;
let currentPermMemberId = null;
let appLockPin = null;
let isUnlocked = true;

const memberColors = [
    '#58a6ff','#3fb950','#d2991d','#da3633','#a371f7',
    '#79c0ff','#56d364','#e3b341','#f85149','#bf8700',
    '#7ee787','#ff7b72','#ffa657','#db6d28','#f778ba',
    '#c297ff','#9ecbff','#a5d6ff','#d2a8ff','#ffc2c2'
];

// ============ SPLASH ============
setTimeout(() => {
    const splash = document.getElementById('splashScreen');
    if (splash) splash.style.display = 'none';
}, 2000);

// ============ CUSTOM DIALOGS ============
function showCustomAlert(message, icon = '⚠️') {
    document.getElementById('alertIcon').textContent = icon;
    document.getElementById('alertMessage').textContent = message;
    document.getElementById('customAlert').style.display = 'flex';
}
function closeCustomAlert() {
    document.getElementById('customAlert').style.display = 'none';
}
function showCustomConfirm(message, callback) {
    document.getElementById('confirmMessage').textContent = message;
    document.getElementById('customConfirm').style.display = 'flex';
    confirmCallback = callback;
}
function confirmAction(result) {
    document.getElementById('customConfirm').style.display = 'none';
    if (confirmCallback) confirmCallback(result);
    confirmCallback = null;
}
function showCustomPrompt(message, callback) {
    document.getElementById('promptMessage').textContent = message;
    document.getElementById('promptInput').value = '';
    document.getElementById('customPrompt').style.display = 'flex';
    promptCallback = callback;
    setTimeout(() => document.getElementById('promptInput').focus(), 300);
}
function promptAction(result) {
    const value = document.getElementById('promptInput').value;
    document.getElementById('customPrompt').style.display = 'none';
    if (promptCallback) promptCallback(result ? value : null);
    promptCallback = null;
}

// ============ ONLINE/OFFLINE ============
window.addEventListener('online', () => { isOnline = true; if (currentUser) loadChats(); });
window.addEventListener('offline', () => { isOnline = false; });

// ============ FORM NAVIGATION ============
function showSignup() {
    document.getElementById('loginForm').style.display = 'none';
    document.getElementById('signupForm').style.display = 'block';
    document.getElementById('forgotForm').style.display = 'none';
    document.getElementById('resetForm').style.display = 'none';
}
function showLogin() {
    document.getElementById('loginForm').style.display = 'block';
    document.getElementById('signupForm').style.display = 'none';
    document.getElementById('forgotForm').style.display = 'none';
    document.getElementById('resetForm').style.display = 'none';
}
function showForgotPassword() {
    document.getElementById('loginForm').style.display = 'none';
    document.getElementById('forgotForm').style.display = 'block';
    document.getElementById('resetForm').style.display = 'none';
}

// ============ AUTH ============
async function signupUser() {
    const nickname = document.getElementById('signupNickname').value.trim();
    const email = document.getElementById('signupEmail').value.trim();
    const password = document.getElementById('signupPassword').value;
    const agreed = document.getElementById('agreeTerms').checked;
    const errorEl = document.getElementById('signupError');
    if (!agreed) { errorEl.textContent = 'Agree to Terms'; errorEl.style.display = 'block'; return; }
    if (!nickname || nickname.length > 20 || !/^[a-zA-Z]+$/.test(nickname)) {
        errorEl.textContent = 'Letters only, max 20'; errorEl.style.display = 'block'; return;
    }
    if (!email || password.length < 6) {
        errorEl.textContent = 'Valid email + 6 char password'; errorEl.style.display = 'block'; return;
    }
    try {
        const cred = await auth.createUserWithEmailAndPassword(email, password);
        await db.collection('users').doc(cred.user.uid).set({
            nickname, email,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            lastSeen: firebase.firestore.FieldValue.serverTimestamp(),
            profilePic: null, hidePfp: false, pfpExceptions: [], appLockPin: null
        });
        errorEl.style.display = 'none';
    } catch (e) {
        errorEl.textContent = e.message.replace('Firebase: ','');
        errorEl.style.display = 'block';
    }
}

async function loginUser() {
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    const errorEl = document.getElementById('loginError');
    if (!email || !password) { errorEl.textContent = 'Fill all fields'; errorEl.style.display = 'block'; return; }
    try {
        await auth.signInWithEmailAndPassword(email, password);
        errorEl.style.display = 'none';
    } catch (e) {
        errorEl.textContent = 'Invalid credentials';
        errorEl.style.display = 'block';
    }
}

// ============ FORGOT PASSWORD ============
let resetEmail = '';
async function sendResetCode() {
    const email = document.getElementById('forgotEmail').value.trim();
    const errorEl = document.getElementById('forgotError');
    if (!email) { errorEl.textContent = 'Enter email'; errorEl.style.display = 'block'; return; }
    try {
        const snap = await db.collection('users').where('email','==',email).get();
        if (snap.empty) { errorEl.textContent = 'No account'; errorEl.style.display = 'block'; return; }
        resetEmail = email;
        const code = Math.floor(1000000 + Math.random() * 9000000).toString();
        await db.collection('resetCodes').doc(email).set({
            code, createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            expiresAt: new Date(Date.now() + 15*60*1000)
        });
        await auth.sendPasswordResetEmail(email);
        showCustomAlert('Code sent to email!\nTesting: ' + code, '📧');
        document.getElementById('forgotForm').style.display = 'none';
        document.getElementById('resetForm').style.display = 'block';
    } catch (e) { errorEl.textContent = e.message; errorEl.style.display = 'block'; }
}

async function resetPassword() {
    const code = document.getElementById('resetCode').value.trim();
    const np = document.getElementById('newPassword').value;
    const cp = document.getElementById('confirmPassword').value;
    const errorEl = document.getElementById('resetError');
    if (code.length !== 7) { errorEl.textContent = 'Enter 7-digit code'; errorEl.style.display = 'block'; return; }
    if (np.length < 6) { errorEl.textContent = 'Too short'; errorEl.style.display = 'block'; return; }
    if (np !== cp) { errorEl.textContent = 'Mismatch'; errorEl.style.display = 'block'; return; }
    try {
        const doc = await db.collection('resetCodes').doc(resetEmail).get();
        if (!doc.exists || doc.data().code !== code) {
            errorEl.textContent = 'Invalid code'; errorEl.style.display = 'block'; return;
        }
        await db.collection('resetCodes').doc(resetEmail).delete();
        await auth.sendPasswordResetEmail(resetEmail);
        showCustomAlert('Check email to reset', '✅');
        showLogin();
    } catch (e) { errorEl.textContent = e.message; errorEl.style.display = 'block'; }
}

// ============ AUTH LISTENER ============
auth.onAuthStateChanged(async (user) => {
    if (user) {
        currentUser = user;
        const doc = await db.collection('users').doc(user.uid).get();
        if (doc.exists) {
            userProfile = doc.data();
            await db.collection('users').doc(user.uid).update({ lastSeen: firebase.firestore.FieldValue.serverTimestamp() });
            
            // Check app lock
            appLockPin = userProfile.appLockPin || null;
            
            document.getElementById('authScreen').classList.remove('active');
            document.getElementById('mainScreen').classList.add('active');
            
            updateProfilePicDisplay();
            loadChats();
        }
    } else {
        currentUser = null; userProfile = null; activeChatId = null;
        document.getElementById('mainScreen').classList.remove('active');
        document.getElementById('chatScreen').classList.remove('active');
        document.getElementById('authScreen').classList.add('active');
        showLogin();
        if (unsubscribeChats) unsubscribeChats();
    }
});

async function logoutUser() {
    await auth.signOut();
    closeModal('profileModal');
}

async function deleteAccount() {
    showCustomConfirm('⚠️ DELETE ACCOUNT?\nPermanent.', async (ok) => {
        if (!ok) return;
        showCustomPrompt('Enter password:', async (pw) => {
            if (!pw) return;
            try {
                const cred = firebase.auth.EmailAuthProvider.credential(currentUser.email, pw);
                await currentUser.reauthenticateWithCredential(cred);
                const chats = await db.collection('chats').where('members','array-contains',currentUser.uid).get();
                for (const c of chats.docs) {
                    const msgs = await c.ref.collection('messages').get();
                    for (const m of msgs.docs) await m.ref.delete();
                    if (c.data().createdBy === currentUser.uid) await c.ref.delete();
                    else await c.ref.update({ members: firebase.firestore.FieldValue.arrayRemove(currentUser.uid) });
                }
                if (userProfile.profilePic) {
                    try { await storage.ref('profilePics/'+currentUser.uid).delete(); } catch(e) {}
                }
                await db.collection('users').doc(currentUser.uid).delete();
                await currentUser.delete();
                showCustomAlert('Account deleted', '✅');
            } catch (e) { showCustomAlert('Wrong password', '❌'); }
        });
    });
}

// ============ PROFILE ============
function openProfile() {
    document.getElementById('profileNickname').value = userProfile.nickname || '';
    document.getElementById('profileEmail').textContent = '•••••••• (tap to view)';
    document.getElementById('profileEmail').onclick = showEmail;
    document.getElementById('hidePfp').checked = userProfile.hidePfp || false;
    document.getElementById('appLockToggle').checked = userProfile.appLockPin ? true : false;
    updateProfilePicDisplay();
    document.getElementById('profileModal').style.display = 'flex';
}

function showEmail() {
    showCustomPrompt('Enter password to view email:', (pw) => {
        if (!pw) return;
        const cred = firebase.auth.EmailAuthProvider.credential(currentUser.email, pw);
        currentUser.reauthenticateWithCredential(cred)
            .then(() => {
                document.getElementById('profileEmail').textContent = currentUser.email;
                document.getElementById('profileEmail').onclick = null;
            })
            .catch(() => showCustomAlert('Wrong password', '❌'));
    });
}

async function updateProfile() {
    const nn = document.getElementById('profileNickname').value.trim();
    if (!nn || nn.length > 20 || !/^[a-zA-Z]+$/.test(nn)) { showCustomAlert('Letters only, max 20'); return; }
    await db.collection('users').doc(currentUser.uid).update({ nickname: nn });
    const chats = await db.collection('chats').where('members','array-contains',currentUser.uid).get();
    for (const c of chats.docs) {
        await c.ref.update({ [`memberNicknames.${currentUser.uid}`]: nn });
    }
    userProfile.nickname = nn;
    closeModal('profileModal');
    showCustomAlert('Updated!', '✅');
    loadChats();
}

async function toggleHidePfp() {
    const hide = document.getElementById('hidePfp').checked;
    await db.collection('users').doc(currentUser.uid).update({ hidePfp: hide });
    userProfile.hidePfp = hide;
}

async function toggleAppLock() {
    const toggle = document.getElementById('appLockToggle');
    if (toggle.checked) {
        showCustomPrompt('Create 4-digit PIN:', async (pin) => {
            if (!pin || pin.length !== 4 || !/^\d+$/.test(pin)) {
                showCustomAlert('Must be 4 digits', '❌');
                toggle.checked = false;
                return;
            }
            showCustomPrompt('Confirm PIN:', async (cpin) => {
                if (pin !== cpin) {
                    showCustomAlert('PINs dont match', '❌');
                    toggle.checked = false;
                    return;
                }
                appLockPin = pin;
                await db.collection('users').doc(currentUser.uid).update({ appLockPin: pin });
                showCustomAlert('App lock enabled! 🔒', '✅');
            });
        });
    } else {
        showCustomPrompt('Enter current PIN:', async (pin) => {
            if (pin === appLockPin) {
                appLockPin = null;
                await db.collection('users').doc(currentUser.uid).update({ appLockPin: null });
                showCustomAlert('App lock disabled', '✅');
            } else {
                showCustomAlert('Wrong PIN', '❌');
                toggle.checked = true;
            }
        });
    }
}

function updateProfilePicDisplay() {
    const textEl = document.getElementById('profilePicText');
    const imgEl = document.getElementById('profilePicImg');
    if (userProfile?.profilePic) {
        if (textEl) textEl.style.display = 'none';
        if (imgEl) { imgEl.style.display = 'block'; imgEl.src = userProfile.profilePic; }
    } else {
        if (textEl) textEl.style.display = 'block';
        if (imgEl) imgEl.style.display = 'none';
    }
}

async function uploadProfilePic(event) {
    const file = event.target.files[0];
    if (!file || !currentUser) return;
    try {
        const storageRef = storage.ref('profilePics/' + currentUser.uid);
        await storageRef.put(file);
        const url = await storageRef.getDownloadURL();
        await db.collection('users').doc(currentUser.uid).update({ profilePic: url });
        userProfile.profilePic = url;
        updateProfilePicDisplay();
        showCustomAlert('Photo updated!', '✅');
    } catch (e) {
        showCustomAlert('Upload failed', '❌');
    }
}

// ============ CHATS ============
async function loadChats() {
    if (!currentUser) return;
    if (unsubscribeChats) unsubscribeChats();
    const list = document.getElementById('chatList');
    unsubscribeChats = db.collection('chats').where('members','array-contains',currentUser.uid)
        .onSnapshot(snap => {
            list.innerHTML = '';
            if (snap.empty) { list.innerHTML = '<div class="empty-state">No chats<br><small>Tap + to start</small></div>'; return; }
            snap.forEach(doc => {
                const c = doc.data();
                if (c.kickedMembers?.includes(currentUser.uid)) return;
                const div = document.createElement('div');
                div.className = 'chat-item';
                div.onclick = () => openChatView(doc.id, c);
                div.innerHTML = `<div class="chat-avatar">${(c.title||'C')[0].toUpperCase()}</div><div class="chat-info"><div class="chat-name">${c.title||'Chat'}</div><div class="chat-preview">${c.members.length} members</div></div>`;
                list.appendChild(div);
            });
        });
}

function showNewChatModal() {
    document.getElementById('newChatModal').style.display = 'flex';
    document.getElementById('generatedCodeDisplay').style.display = 'none';
    document.getElementById('inviteCodeInput').value = '';
}
async function generateInviteCode() {
    const code = Math.random().toString(36).substring(2,8).toUpperCase();
    await db.collection('chats').add({
        title: userProfile.nickname + "'s Chat",
        members: [currentUser.uid],
        memberNicknames: {[currentUser.uid]: userProfile.nickname},
        memberColors: {[currentUser.uid]: 0},
        inviteCode: code, inviteUses: 0, maxInviteUses: 20,
        createdBy: currentUser.uid,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        kickedMembers: [],
        memberPermissions: {},
        defaultPermissions: {sendMessages:true, changeTitle:true, kickMembers:false, viewCode:true}
    });
    document.getElementById('generatedCode').textContent = code;
    document.getElementById('generatedCodeDisplay').style.display = 'block';
}
function copyGeneratedCode() {
    navigator.clipboard.writeText(document.getElementById('generatedCode').textContent);
    showCustomAlert('Copied!', '✅');
}
async function joinByInviteCode() {
    const code = document.getElementById('inviteCodeInput').value.trim().toUpperCase();
    const el = document.getElementById('inviteError');
    if (!code) { el.textContent = 'Enter code'; el.style.display = 'block'; return; }
    const snap = await db.collection('chats').where('inviteCode','==',code).get();
    if (snap.empty) { el.textContent = 'Invalid'; el.style.display = 'block'; return; }
    const d = snap.docs[0], c = d.data();
    if (c.kickedMembers?.includes(currentUser.uid)) { el.textContent = 'Removed'; el.style.display = 'block'; return; }
    if (c.members.includes(currentUser.uid)) { el.textContent = 'Already in'; el.style.display = 'block'; return; }
    if (c.inviteUses >= c.maxInviteUses) { el.textContent = 'Full'; el.style.display = 'block'; return; }
    const colorIndex = c.members.length % 20;
    await d.ref.update({
        members: firebase.firestore.FieldValue.arrayUnion(currentUser.uid),
        [`memberNicknames.${currentUser.uid}`]: userProfile.nickname,
        [`memberColors.${currentUser.uid}`]: colorIndex,
        inviteUses: c.inviteUses + 1
    });
    closeModal('newChatModal');
}

// ============ PERMISSIONS ============
function getMemberColorHex(index) { return memberColors[index % 20]; }

async function hasPermission(uid, perm) {
    if (!activeChatId) return false;
    const doc = await db.collection('chats').doc(activeChatId).get();
    const c = doc.data();
    if (c.createdBy === uid) return true;
    const perms = c.memberPermissions?.[uid] || c.defaultPermissions || {sendMessages:true, changeTitle:true, kickMembers:false, viewCode:true};
    return perms[perm] !== false;
}

async function openPermissions(uid, name) {
    if (!activeChatId) return;
    const doc = await db.collection('chats').doc(activeChatId).get();
    const c = doc.data();
    if (c.createdBy !== currentUser.uid) { showCustomAlert('Only owner can manage permissions','🔒'); return; }
    currentPermMemberId = uid;
    document.getElementById('permMemberName').textContent = 'Permissions: ' + name;
    const perms = c.memberPermissions?.[uid] || c.defaultPermissions || {sendMessages:true, changeTitle:true, kickMembers:false, viewCode:true};
    document.getElementById('permSendMsg').checked = perms.sendMessages !== false;
    document.getElementById('permChangeTitle').checked = perms.changeTitle === true;
    document.getElementById('permKick').checked = perms.kickMembers === true;
    document.getElementById('permViewCode').checked = perms.viewCode !== false;
    document.getElementById('permissionsModal').style.display = 'flex';
}
async function savePermissions() {
    if (!activeChatId || !currentPermMemberId) return;
    const perms = {
        sendMessages: document.getElementById('permSendMsg').checked,
        changeTitle: document.getElementById('permChangeTitle').checked,
        kickMembers: document.getElementById('permKick').checked,
        viewCode: document.getElementById('permViewCode').checked
    };
    await db.collection('chats').doc(activeChatId).update({ [`memberPermissions.${currentPermMemberId}`]: perms });
    closeModal('permissionsModal');
    showCustomAlert('Permissions updated!','✅');
}
async function kickMemberFromPerms() {
    if (!currentPermMemberId) return;
    showCustomConfirm('Kick this member?', async (ok) => {
        if (!ok) return;
        await db.collection('chats').doc(activeChatId).update({
            members: firebase.firestore.FieldValue.arrayRemove(currentPermMemberId),
            kickedMembers: firebase.firestore.FieldValue.arrayUnion(currentPermMemberId)
        });
        closeModal('permissionsModal');
        openChatSettings();
    });
}
async function updateDefaultPerms() {
    if (!activeChatId) return;
    const perms = {
        sendMessages: document.getElementById('defSendMsg').checked,
        changeTitle: document.getElementById('defChangeTitle').checked,
        kickMembers: document.getElementById('defKick').checked,
        viewCode: document.getElementById('defViewCode').checked
    };
    await db.collection('chats').doc(activeChatId).update({ defaultPermissions: perms });
}

// ============ CHAT VIEW ============
function openChatView(chatId, chatData) {
    if (unsubscribeMessages) unsubscribeMessages();
    activeChatId = chatId;
    activeChatData = chatData;
    document.getElementById('mainScreen').classList.remove('active');
    document.getElementById('chatScreen').classList.add('active');
    document.getElementById('chatTitle').textContent = chatData.title || 'Chat';
    document.getElementById('chatMeta').textContent = chatData.members.length + ' members';
    loadMessages();
}
function closeChatView() {
    document.getElementById('chatScreen').classList.remove('active');
    document.getElementById('mainScreen').classList.add('active');
    if (unsubscribeMessages) unsubscribeMessages();
    activeChatId = null;
}
function loadMessages() {
    if (!activeChatId) return;
    const area = document.getElementById('messagesContainer');
    unsubscribeMessages = db.collection('chats').doc(activeChatId).collection('messages')
        .orderBy('timestamp','asc').onSnapshot(snap => {
            area.innerHTML = '';
            snap.forEach(doc => {
                const m = doc.data();
                const isOut = m.senderId === currentUser.uid;
                const time = m.timestamp ? new Date(m.timestamp.toDate()).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}) : '';
                const ci = activeChatData?.memberColors?.[m.senderId] || 0;
                const color = getMemberColorHex(ci);
                const w = document.createElement('div');
                w.className = 'msg-wrapper ' + (isOut ? 'outgoing' : 'incoming');
                w.setAttribute('data-id', doc.id);
                w.addEventListener('dblclick', (e) => {
                    selectedMessageId = doc.id; selectedMessageData = m;
                    showContextMenu(e.clientX, e.clientY, m.senderId === currentUser.uid);
                });
                w.innerHTML = `${!isOut ? `<div class="msg-sender" style="color:${color}">${m.senderNickname||'?'}</div>` : ''}<div class="msg-bubble">${m.text}</div><div class="msg-time">${time}</div>`;
                area.appendChild(w);
            });
            area.scrollTop = area.scrollHeight;
        });
}
async function sendMessage() {
    if (!activeChatId) return;
    const canSend = await hasPermission(currentUser.uid, 'sendMessages');
    if (!canSend) { showCustomAlert('No permission to send messages','🔒'); return; }
    const input = document.getElementById('messageInput');
    const text = input.value.trim();
    if (!text) return;
    await db.collection('chats').doc(activeChatId).collection('messages').add({
        text, senderId: currentUser.uid, senderNickname: userProfile.nickname,
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
    });
    input.value = '';
}

// ============ CONTEXT MENU ============
function showContextMenu(x, y, isOwn) {
    const menu = document.getElementById('contextMenu');
    menu.style.display = 'block';
    menu.style.left = Math.min(x, window.innerWidth-160)+'px';
    menu.style.top = Math.min(y, window.innerHeight-150)+'px';
    const items = menu.querySelectorAll('.context-item');
    if (items.length>=3) { items[1].style.display=isOwn?'block':'none'; items[2].style.display=isOwn?'block':'none'; }
    setTimeout(() => document.addEventListener('click',()=>menu.style.display='none',{once:true}),100);
}
function copyMessage() {
    if (selectedMessageData) navigator.clipboard.writeText(selectedMessageData.text);
    document.getElementById('contextMenu').style.display='none';
}
function editMessage() {
    if (!selectedMessageData||selectedMessageData.senderId!==currentUser.uid) return;
    document.getElementById('editMessageInput').value=selectedMessageData.text;
    document.getElementById('editMessageModal').style.display='flex';
    document.getElementById('contextMenu').style.display='none';
}
async function saveEditedMessage() {
    const t=document.getElementById('editMessageInput').value.trim();
    if(!t||!selectedMessageId) return;
    await db.collection('chats').doc(activeChatId).collection('messages').doc(selectedMessageId).update({text:t});
    closeModal('editMessageModal');
}
async function deleteMessage() {
    if(!selectedMessageId||selectedMessageData?.senderId!==currentUser.uid) return;
    showCustomConfirm('Delete for everyone?',async(ok)=>{if(ok) await db.collection('chats').doc(activeChatId).collection('messages').doc(selectedMessageId).delete();});
    document.getElementById('contextMenu').style.display='none';
}

// ============ CHAT SETTINGS ============
async function openChatSettings() {
    if (!activeChatId) return;
    const doc = await db.collection('chats').doc(activeChatId).get();
    const c = doc.data();
    activeChatData = c;
    document.getElementById('groupCodeDisplay').textContent = c.inviteCode || '---';
    document.getElementById('settingsTitle').value = c.title || '';
    document.getElementById('memberCount').textContent = c.members.length;
    
    const dp = c.defaultPermissions || {sendMessages:true, changeTitle:true, kickMembers:false, viewCode:true};
    document.getElementById('defSendMsg').checked = dp.sendMessages !== false;
    document.getElementById('defChangeTitle').checked = dp.changeTitle === true;
    document.getElementById('defKick').checked = dp.kickMembers === true;
    document.getElementById('defViewCode').checked = dp.viewCode !== false;
    
    const isOwner = c.createdBy === currentUser.uid;
    const ml = document.getElementById('memberList');
    ml.innerHTML = '';
    let idx = 0;
    for (const uid of c.members) {
        const ud = await db.collection('users').doc(uid).get();
        const u = ud.data();
        const online = u?.lastSeen ? (Date.now()-u.lastSeen.toDate())<5*60*1000 : false;
        const ci = c.memberColors?.[uid]||idx;
        const color = getMemberColorHex(ci);
        const div = document.createElement('div');
        div.className = 'member-item';
        div.style.cursor = isOwner && uid !== currentUser.uid ? 'pointer' : 'default';
        div.onclick = () => { if (isOwner && uid !== currentUser.uid) openPermissions(uid, c.memberNicknames?.[uid]||'?'); };
        div.innerHTML = `<span><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${color};margin-right:6px;"></span>${c.memberNicknames?.[uid]||'?'} ${uid===c.createdBy?'👑':''} ${uid===currentUser.uid?'(You)':''}</span><span class="member-status ${online?'online':''}">${online?'🟢':'⚫'}</span>`;
        ml.appendChild(div);
        idx++;
    }
    document.getElementById('chatSettingsModal').style.display = 'flex';
}
async function changeChatTitle() {
    const can = await hasPermission(currentUser.uid, 'changeTitle');
    if (!can) { showCustomAlert('No permission','🔒'); return; }
    const t = document.getElementById('settingsTitle').value.trim();
    if (!t) return;
    await db.collection('chats').doc(activeChatId).update({title:t});
    document.getElementById('chatTitle').textContent = t;
    closeModal('chatSettingsModal');
}
async function leaveChat() {
    showCustomConfirm('Leave chat?', async (ok) => {
        if (!ok) return;
        await db.collection('chats').doc(activeChatId).update({members: firebase.firestore.FieldValue.arrayRemove(currentUser.uid)});
        closeChatView();
        closeModal('chatSettingsModal');
    });
}

// ============ HELPERS ============
function closeModal(id) { document.getElementById(id).style.display = 'none'; }
document.addEventListener('click', (e) => { if (e.target.classList.contains('modal-overlay')) e.target.style.display = 'none'; });
function showTerms() { showCustomAlert('Terms: By using Casel you agree to our terms. No illegal activities.'); }
function showPrivacyPolicyText() { showCustomAlert('Privacy: We store email, nickname, messages. No data selling.'); }