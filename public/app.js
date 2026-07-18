let activeChannelId = null;
let sessionToken = localStorage.getItem('dmg_admin_token') || '';
let socket = null;

let isEmbedOpen = false;

function buildMessageHtml(m, channelId) {
  let embedHtml = '';
  if (m.embeds && m.embeds.length > 0) {
    const e = m.embeds[0];
    embedHtml = `
      <div style="border-left: 4px solid ${e.color || '#38bdf8'}; background:rgba(0,0,0,0.2); padding:10px; margin-top:8px; border-radius:4px;">
        ${e.title ? `<div style="font-weight:bold; margin-bottom:4px; color:#38bdf8;">${e.title}</div>` : ''}
        ${e.description ? `<div style="font-size:0.9rem; margin-bottom:4px; white-space:pre-wrap;">${e.description}</div>` : ''}
        ${e.footer ? `<div style="font-size:0.7rem; color:#64748b;">${e.footer}</div>` : ''}
      </div>
    `;
  }

  const isBot = m.bot;
  
  return `
    <div class="msg-box" id="msg-${m.id}">
      <img src="${m.avatar || 'https://cdn.discordapp.com/embed/avatars/0.png'}" class="msg-avatar">
      <div class="msg-content">
        <div class="msg-header">
          <span class="msg-author">${m.author}</span>
          ${m.bot ? '<span class="msg-bot-tag">BOT</span>' : ''}
          <span class="msg-time">${new Date(m.timestamp).toLocaleTimeString()}</span>
        </div>
        <div class="msg-text">${m.content}</div>
        ${embedHtml}
      </div>
      <div class="msg-actions">
        ${isBot ? `<button class="msg-btn" onclick="editMessage('${channelId}', '${m.id}')" title="Edit"><svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg></button>` : ''}
        <button class="msg-btn" onclick="deleteMessage('${channelId}', '${m.id}')" title="Delete"><svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button>
      </div>
    </div>
  `;
}

function initSocket() {
  if (socket) return;
  socket = io();
  
  socket.on('newMessage', (data) => {
    if (activeChannelId === data.channelId) {
      const chat = document.getElementById('sm-chat');
      const msgHtml = buildMessageHtml(data.message, data.channelId);
      chat.insertAdjacentHTML('beforeend', msgHtml);
      chat.scrollTop = chat.scrollHeight;
    }
  });

  socket.on('updateMessage', (data) => {
    if (activeChannelId === data.channelId) {
      const msgEl = document.getElementById('msg-' + data.message.id);
      if (msgEl) {
        msgEl.outerHTML = buildMessageHtml(data.message, data.channelId);
      }
    }
  });

  socket.on('deleteMessage', (data) => {
    if (activeChannelId === data.channelId) {
      const msgEl = document.getElementById('msg-' + data.messageId);
      if (msgEl) msgEl.remove();
    }
  });
}

function toggleEmbed() {
  isEmbedOpen = !isEmbedOpen;
  document.getElementById('embed-builder').style.display = isEmbedOpen ? 'flex' : 'none';
}

// --- AUTHENTICATION ---
async function attemptLogin() {
  const pwd = document.getElementById('login-pwd').value;
  try {
    const res = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: pwd })
    });
    const data = await res.json();
    if (res.ok && data.success) {
      sessionToken = data.token;
      localStorage.setItem('dmg_admin_token', sessionToken);
      document.getElementById('login-overlay').style.display = 'none';
      document.getElementById('main-app').style.display = 'flex';
      initSocket();
      loadOverview();
    } else {
      document.getElementById('login-err').style.display = 'block';
    }
  } catch (err) {
    console.error(err);
  }
}

async function logout() {
  await fetch('/api/logout', { method: 'POST', headers: { 'Authorization': sessionToken } });
  sessionToken = '';
  localStorage.removeItem('dmg_admin_token');
  location.reload();
}

// Wrapper for fetch to include auth token
async function apiFetch(url, options = {}) {
  if (!options.headers) options.headers = {};
  options.headers['Authorization'] = sessionToken;
  
  // Cache busting
  const separator = url.includes('?') ? '&' : '?';
  const noCacheUrl = url + separator + '_t=' + Date.now();
  
  const res = await fetch(noCacheUrl, options);
  if (res.status === 401) {
    document.getElementById('login-overlay').style.display = 'flex';
    document.getElementById('main-app').style.display = 'none';
    throw new Error('Unauthorized');
  }
  return res;
}

// Check initial auth state
if (!sessionToken) {
  document.getElementById('login-overlay').style.display = 'flex';
} else {
  apiFetch('/api/stats')
    .then(res => {
      if (res.ok) {
        document.getElementById('login-overlay').style.display = 'none';
        document.getElementById('main-app').style.display = 'flex';
        initSocket();
        loadOverview();
      }
    }).catch(() => {});
}


// View Switching
function switchTab(tabId) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('view-' + tabId).classList.add('active');
  document.getElementById('tab-' + tabId).classList.add('active');

  if (tabId === 'server') {
    loadServerData();
  } else if (tabId === 'members') {
    loadMembers();
  } else if (tabId === 'tickets') {
    loadTickets();
  } else if (tabId === 'applications') {
    loadApplications();
  } else if (tabId === 'memberlist') {
    loadInGameMembers();
    // Populate the channels dropdown for the memberlist setting
    apiFetch('/api/guild/channels').then(res => res.json()).then(channels => {
      const select = document.getElementById('set-memberlist-channel');
      select.innerHTML = '<option value="">None</option>' + channels.filter(c => c.type === 0).map(c => `<option value="${c.id}">#${c.name}</option>`).join('');
      apiFetch('/api/settings').then(r => r.json()).then(s => {
        if(s.memberlistChannel) select.value = s.memberlistChannel;
      });
    });
  } else if (tabId === 'settings') {
    loadSettings();
  }
}

let allApplications = [];
let appStatusFilter = 'all';

async function loadApplications() {
  const container = document.getElementById('applications-list');
  const loader = document.getElementById('loading-applications');
  loader.style.display = 'block';
  container.innerHTML = '';
  
  try {
    const res = await apiFetch('/api/applications');
    allApplications = await res.json();
    renderApplications();
  } catch(e) {
    console.error(e);
  } finally {
    loader.style.display = 'none';
  }
}

function renderApplications() {
  const container = document.getElementById('applications-list');
  const searchInput = document.getElementById('app-search').value.toLowerCase();
  container.innerHTML = '';
  
  const filteredApps = allApplications.filter(app => {
    const matchesSearch = (app.userTag && app.userTag.toLowerCase().includes(searchInput)) || 
                          (app.userId && app.userId.includes(searchInput));
    const matchesFilter = appStatusFilter === 'all' || app.status.toLowerCase() === appStatusFilter;
    return matchesSearch && matchesFilter;
  });
  
  if (filteredApps.length === 0) {
     container.innerHTML = '<div style="color: #64748b; padding: 20px;">No applications found matching your criteria.</div>';
     return;
  }
  
  filteredApps.forEach(app => {
     let color = '#38bdf8'; // Default pending
     if (app.status === 'ACCEPTED') color = '#10b981';
     if (app.status === 'DENIED') color = '#ef4444';
     if (app.status === 'BLACKLISTED') color = '#64748b';
     
     const div = document.createElement('div');
     div.className = 'dashboard-card';
     div.style.background = 'var(--bg-secondary)';
     div.style.padding = '20px';
     div.style.borderRadius = '12px';
     div.style.borderLeft = `4px solid ${color}`;
     div.style.position = 'relative';
     
     div.innerHTML = `
        <h3 style="margin: 0 0 10px 0; font-size: 1.1rem; color: #fff;">${app.userTag || 'Unknown User'}</h3>
        <p style="margin: 0 0 5px 0; font-size: 0.85rem; color: #94a3b8;">User ID: ${app.userId}</p>
        <div style="display: flex; gap: 10px; margin-bottom: 15px;">
           <span class="badge" style="background: ${color}20; color: ${color}; padding: 4px 8px; border-radius: 4px; font-size: 0.75rem; font-weight: bold;">${app.status}</span>
           ${app.plagiarism ? '<span class="badge" style="background: rgba(239, 68, 68, 0.2); color: #ef4444; padding: 4px 8px; border-radius: 4px; font-size: 0.75rem;">⚠️ PLAGIARISM FLAG</span>' : ''}
        </div>
        <div style="font-size: 0.85rem; color: #cbd5e1; margin-bottom: 15px;">
           <div><strong>AI Usage:</strong> ~${app.aiScore || 0}%</div>
           <div><strong>Time Taken:</strong> ${app.timeTaken || 'Unknown'}</div>
           ${app.reason ? `<div style="margin-top: 5px;"><strong>Reason:</strong> ${app.reason}</div>` : ''}
           ${app.processedBy ? `<div><strong>Processed By:</strong> ${app.processedBy}</div>` : ''}
        </div>
        <div style="font-size: 0.8rem; color: #64748b;">Submitted: ${new Date(app.timestamp).toLocaleString()}</div>
     `;
     container.appendChild(div);
  });
}

document.getElementById('app-search')?.addEventListener('input', renderApplications);

['all', 'pending', 'accepted', 'denied', 'blacklisted'].forEach(filter => {
  document.getElementById(`filter-${filter}-apps`)?.addEventListener('click', (e) => {
    appStatusFilter = filter;
    document.querySelectorAll('.filters .action-btn').forEach(b => b.style.opacity = '0.5');
    e.target.style.opacity = '1';
    renderApplications();
  });
});

// Load Overview Data
async function loadOverview() {
  try {
    const statsRes = await apiFetch('/api/stats');
    const stats = await statsRes.json();
    document.getElementById('sys-users').querySelector('p').innerText = `${stats.totalMembers || 'Unknown'} Members in Guild`;
    document.getElementById('stats').innerHTML = `
      <div class="stat-box" style="--clr: #f59e0b;"><div class="progress-circle" style="--p: ${stats.warnedPct || 0}%;"><span>${stats.warnedPct || 0}%</span></div><h3>Warned Members</h3></div>
      <div class="stat-box" style="--clr: #ef4444;"><div class="progress-circle" style="--p: ${stats.blacklistedPct || 0}%;"><span>${stats.blacklistedPct || 0}%</span></div><h3>Blacklisted</h3></div>
      <div class="stat-box" style="--clr: #3b82f6;"><div class="progress-circle" style="--p: ${stats.notAppliedPct || 0}%;"><span>${stats.notAppliedPct || 0}%</span></div><h3>Not Applied</h3></div>
    `;

    const warnRes = await apiFetch('/api/warnings');
    const warningsData = await warnRes.json();
    const dashboard = document.getElementById('dashboard');
    const loading = document.getElementById('loading-warnings');
    const userIds = Object.keys(warningsData);
    
    if (userIds.length === 0) { loading.innerText = 'No warnings found.'; return; }
    loading.style.display = 'none';

    for (const userId of userIds) {
      const userWarns = warningsData[userId];
      if (userWarns.length === 0) continue;
      let userData = { tag: userId, avatar: 'https://cdn.discordapp.com/embed/avatars/0.png' };
      try {
        const userRes = await apiFetch(`/api/users/${userId}`);
        if (userRes.ok) { userData = await userRes.json(); if (!userData.avatar) userData.avatar = 'https://cdn.discordapp.com/embed/avatars/0.png'; }
      } catch (e) {}

      const card = document.createElement('div'); card.className = 'card';
      const warningHtml = userWarns.map(w => `<li class="warning-item">${w.reason}<span class="warning-date">${new Date(w.timestamp).toLocaleString()}</span></li>`).join('');
      card.innerHTML = `<div class="user-info"><img src="${userData.avatar}" class="avatar"><div class="user-details"><h3>${userData.tag}</h3><span class="badge">${userWarns.length} Warning(s)</span></div></div><ul class="warning-list">${warningHtml}</ul>`;
      dashboard.appendChild(card);
    }
  } catch (e) { console.error(e); }
}

// IN-GAME MEMBERLIST MANAGEMENT
async function loadInGameMembers() {
  try {
    const list = document.getElementById('in-game-members-list');
    list.innerHTML = '<div style="color:#64748b;">Loading memberlist...</div>';
    const res = await apiFetch('/api/memberlist');
    const members = await res.json();
    
    if (members.length === 0) {
      list.innerHTML = '<div style="color:#64748b; padding:1rem; text-align:center;">The memberlist is empty.</div>';
      return;
    }
    
    list.innerHTML = members.map((m, index) => `
      <div style="display:flex; justify-content:space-between; align-items:center; background:rgba(30, 41, 59, 0.4); padding:12px 16px; border-radius:8px; border:1px solid rgba(255,255,255,0.05);">
        <div style="display:flex; align-items:center; gap:10px;">
          <span style="color:#94a3b8; font-weight:bold; width:24px;">${index + 1}.</span>
          <span style="font-weight:600; color:#f8fafc; font-size:1.05rem;">${m.inGameName}</span>
          <span style="color:#64748b; font-size:0.9rem;">— ${m.userTag} (${m.userId})</span>
        </div>
        <button onclick="removeMemberManual('${m.userId}')" class="btn-primary" style="background:#ef4444; padding:6px 12px; font-size:0.85rem;">Remove</button>
      </div>
    `).join('');
  } catch(e) {
    document.getElementById('in-game-members-list').innerHTML = `<div style="color:#ef4444;">Failed to load memberlist.</div>`;
  }
}

async function addMemberManual() {
  const userId = document.getElementById('add-member-id').value.trim();
  const userTag = document.getElementById('add-member-tag').value.trim();
  const inGameName = document.getElementById('add-member-ign').value.trim();
  
  if (!userId || !userTag || !inGameName) {
    alert('Please fill out all fields (User ID, Discord Tag, and In-Game Name).');
    return;
  }
  
  const res = await apiFetch('/api/memberlist', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, userTag, inGameName })
  });
  
  if (res.ok) {
    document.getElementById('add-member-id').value = '';
    document.getElementById('add-member-tag').value = '';
    document.getElementById('add-member-ign').value = '';
    loadInGameMembers();
  } else {
    alert('Failed to add member.');
  }
}

async function removeMemberManual(userId) {
  if (!confirm('Are you sure you want to remove this member from the in-game memberlist?')) return;
  const res = await apiFetch(`/api/memberlist/${userId}`, { method: 'DELETE' });
  if (res.ok) {
    loadInGameMembers();
  } else {
    alert('Failed to remove member.');
  }
}

async function saveMemberlistChannel() {
  const val = document.getElementById('set-memberlist-channel').value;
  await apiFetch('/api/settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ memberlistChannel: val || null })
  });
}

// SETTINGS MANAGEMENT FUNCTIONS
async function loadServerData() {
  loadChannels();
  loadRoles();
}

async function loadChannels() {
  const res = await apiFetch('/api/guild/channels');
  const channels = await res.json();
  const container = document.getElementById('sm-channels');
  container.innerHTML = '';
  
  channels.filter(c => c.type === 4).forEach(cat => {
    container.innerHTML += `<div style="font-size:0.75rem; font-weight:700; color:#64748b; margin-top:1rem; margin-bottom:4px; text-transform:uppercase;">${cat.name}</div>`;
    channels.filter(c => c.parentId === cat.id && c.type === 0).forEach(ch => {
      container.innerHTML += `<div class="chan-item" onclick="selectChannel('${ch.id}', '${ch.name}')" id="chan-${ch.id}" style="display:flex; justify-content:space-between; align-items:center;">
        <div><svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" style="margin-right:4px;"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg> ${ch.name}</div>
        <div style="display:flex; gap:6px; font-size:12px;">
          <span onclick="event.stopPropagation(); renameChannel('${ch.id}', '${ch.name}')" style="cursor:pointer; display:flex; align-items:center;" title="Rename"><svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg></span>
          <span onclick="event.stopPropagation(); deleteChannel('${ch.id}', '${ch.name}')" style="cursor:pointer; display:flex; align-items:center;" title="Delete"><svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></span>
        </div>
      </div>`;
    });
  });
  channels.filter(c => !c.parentId && c.type === 0).forEach(ch => {
    container.innerHTML += `<div class="chan-item" onclick="selectChannel('${ch.id}', '${ch.name}')" id="chan-${ch.id}" style="display:flex; justify-content:space-between; align-items:center;">
        <div><svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" style="margin-right:4px;"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg> ${ch.name}</div>
        <div style="display:flex; gap:6px; font-size:12px;">
          <span onclick="event.stopPropagation(); renameChannel('${ch.id}', '${ch.name}')" style="cursor:pointer; display:flex; align-items:center;" title="Rename"><svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg></span>
          <span onclick="event.stopPropagation(); deleteChannel('${ch.id}', '${ch.name}')" style="cursor:pointer; display:flex; align-items:center;" title="Delete"><svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></span>
        </div>
      </div>`;
  });
}

async function loadRoles() {
  const res = await apiFetch('/api/guild/roles');
  const roles = await res.json();
  const container = document.getElementById('sm-roles');
  container.innerHTML = roles.filter(r => r.name !== '@everyone').map(r => 
    `<div class="role-badge" style="display:inline-flex; align-items:center;">
       <div class="role-color" style="background:${r.color==='#000000'?'#64748b':r.color}"></div>
       ${r.name}
       <span onclick="deleteRole('${r.id}', '${r.name}')" style="margin-left:6px; cursor:pointer; color:#ef4444;" title="Delete"><svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" stroke-width="2" fill="none"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></span>
     </div>`
  ).join('');
}

async function selectChannel(id, name) {
  document.querySelectorAll('.chan-item').forEach(e => e.classList.remove('active'));
  document.getElementById('chan-' + id).classList.add('active');
  activeChannelId = id;
  document.getElementById('chat-header').innerText = '#' + name;
  document.getElementById('chat-input').disabled = false;
  document.getElementById('chat-send-btn').disabled = false;
  
  const chat = document.getElementById('sm-chat');
  chat.innerHTML = `<div style="color:#64748b; text-align:center; margin-top:20px;">Loading messages...</div>`;
  
  try {
    const res = await apiFetch(`/api/guild/channels/${id}/messages`);
    const msgs = await res.json();
    chat.innerHTML = msgs.map(m => buildMessageHtml(m, id)).join('');
    chat.scrollTop = chat.scrollHeight;
  } catch (err) {
    chat.innerHTML = `<div style="color:#ef4444; text-align:center; margin-top:20px;">Failed to load messages</div>`;
  }
}

async function sendChatMessage() {
  if (!activeChannelId) return;
  const input = document.getElementById('chat-input');
  const content = input.value.trim();
  
  let embed = null;
  if (isEmbedOpen) {
    const title = document.getElementById('embed-title').value.trim();
    const desc = document.getElementById('embed-desc').value.trim();
    const color = document.getElementById('embed-color').value;
    const footer = document.getElementById('embed-footer').value.trim();
    if (title || desc) {
      embed = { title, description: desc, color, footer };
    }
  }

  if (!content && !embed) return;
  
  input.value = '';
  if (isEmbedOpen) {
    document.getElementById('embed-title').value = '';
    document.getElementById('embed-desc').value = '';
    document.getElementById('embed-footer').value = '';
  }

  await apiFetch(`/api/guild/channels/${activeChannelId}/messages`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content, embed })
  });
}

function handleEnter(e) { if (e.key === 'Enter') sendChatMessage(); }

async function editMessage(channelId, msgId) {
  const newContent = prompt("Edit message content:");
  if (newContent === null) return; // cancelled
  
  let embed = null;
  if (confirm("Attach an embed to this message? (OK to build, Cancel for text-only)")) {
      const title = prompt("Embed Title:");
      const desc = prompt("Embed Description:");
      const color = prompt("Embed Color (Hex, e.g. #38bdf8):", "#38bdf8");
      const footer = prompt("Embed Footer:");
      embed = { title, description: desc, color, footer };
  }

  await apiFetch(`/api/guild/messages/${channelId}/${msgId}`, { 
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: newContent, embed })
  });
}

async function deleteMessage(channelId, msgId) {
  if (!confirm("Delete this message?")) return;
  await apiFetch(`/api/guild/messages/${channelId}/${msgId}`, { method: 'DELETE' });
  document.getElementById('msg-' + msgId).remove();
}

async function createRole() {
  const name = document.getElementById('role-name').value.trim();
  if (!name) return alert('Enter a role name');
  
  const checks = document.querySelectorAll('.permissions-grid input:checked');
  const permissions = Array.from(checks).map(c => c.value);
  
  document.getElementById('role-name').value = '';
  
  await apiFetch('/api/guild/roles', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, color: '#38bdf8', permissions })
  });
  loadRoles();
}

async function createChannel() {
  const name = prompt("Enter new channel name:");
  if (!name) return;
  await apiFetch('/api/guild/channels', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, type: 0 })
  });
  loadChannels();
}

async function createCategory() {
  const name = prompt("Enter new category name:");
  if (!name) return;
  await apiFetch('/api/guild/channels', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, type: 4 })
  });
  loadChannels();
}

async function renameChannel(id, oldName) {
  const name = prompt("Enter new name for channel:", oldName);
  if (!name || name === oldName) return;
  await apiFetch(`/api/guild/channels/${id}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name })
  });
  loadChannels();
}

async function deleteChannel(id, name) {
  if (!confirm(`Are you sure you want to delete the channel #${name}?`)) return;
  await apiFetch(`/api/guild/channels/${id}`, { method: 'DELETE' });
  loadChannels();
  if (activeChannelId === id) {
    document.getElementById('sm-chat').innerHTML = '';
    document.getElementById('chat-header').innerText = 'Select a channel';
    activeChannelId = null;
  }
}

async function deleteRole(id, name) {
  if (!confirm(`Are you sure you want to delete the role @${name}?`)) return;
  await apiFetch(`/api/guild/roles/${id}`, { method: 'DELETE' });
  loadRoles();
}

// MEMBERS MANAGEMENT
async function loadMembers() {
  const list = document.getElementById('members-list');
  list.innerHTML = `<div style="color: #64748b;">Loading members...</div>`;
  try {
    const res = await apiFetch('/api/guild/members');
    const members = await res.json();
    
    if (!Array.isArray(members)) {
      throw new Error(members.error || 'API returned non-array data');
    }
    
    list.innerHTML = members.map(m => `
      <div class="card" style="padding: 1.5rem;">
        <div class="user-info">
          <img src="${m.avatar || 'https://cdn.discordapp.com/embed/avatars/0.png'}" class="avatar">
          <div class="user-details">
            <h3>${m.tag}</h3>
            <div style="font-size:0.75rem; color:#64748b; margin-top:4px;">Joined: ${new Date(m.joinedAt).toLocaleDateString()}</div>
          </div>
        </div>
        <div style="margin-top:1rem; display:flex; flex-wrap:wrap; gap:6px;">
          ${m.roles.filter(r => r.name !== '@everyone').map(r => `<span class="role-badge" style="font-size:0.7rem;"><div class="role-color" style="background:${r.color==='#000000'?'#64748b':r.color}"></div>${r.name}</span>`).join('')}
        </div>
        <div style="margin-top:1.5rem; display:flex; gap:10px;">
          <button onclick="manageMemberRoles('${m.id}', '${m.tag}')" style="flex:1; background:rgba(56,189,248,0.1); color:#38bdf8; border:1px solid rgba(56,189,248,0.2); padding:0.5rem; border-radius:8px; cursor:pointer; font-weight:600;">Roles</button>
          <button onclick="kickMember('${m.id}', '${m.tag}')" style="flex:1; background:rgba(245,158,11,0.1); color:#f59e0b; border:1px solid rgba(245,158,11,0.2); padding:0.5rem; border-radius:8px; cursor:pointer; font-weight:600;">Kick</button>
          <button onclick="banMember('${m.id}', '${m.tag}')" style="flex:1; background:rgba(239,68,68,0.1); color:#ef4444; border:1px solid rgba(239,68,68,0.2); padding:0.5rem; border-radius:8px; cursor:pointer; font-weight:600;">Ban</button>
        </div>
      </div>
    `).join('');
  } catch (err) {
    list.innerHTML = `<div style="color: #ef4444;">Failed to load members: ${err.message}</div>`;
  }
}

async function kickMember(id, tag) {
  if (!confirm(`Are you sure you want to KICK ${tag}?`)) return;
  await apiFetch(`/api/guild/members/${id}/kick`, { method: 'POST' });
  loadMembers();
}

async function banMember(id, tag) {
  if (!confirm(`Are you absolutely sure you want to BAN ${tag}?`)) return;
  await apiFetch(`/api/guild/members/${id}/ban`, { method: 'POST' });
  loadMembers();
}

let allGuildRoles = [];
async function manageMemberRoles(memberId, tag) {
  if (allGuildRoles.length === 0) {
    const res = await apiFetch('/api/guild/roles');
    allGuildRoles = await res.json();
  }
  
  const mRes = await apiFetch('/api/guild/members');
  const members = await mRes.json();
  const member = members.find(m => m.id === memberId);
  if (!member) return alert('Member not found');

  const currentRoleIds = member.roles.map(r => r.id);
  
  const modal = document.createElement('div');
  modal.style.position = 'fixed';
  modal.style.top = '0'; modal.style.left = '0'; modal.style.width = '100vw'; modal.style.height = '100vh';
  modal.style.background = 'rgba(0,0,0,0.8)';
  modal.style.display = 'flex'; modal.style.alignItems = 'center'; modal.style.justifyContent = 'center';
  modal.style.zIndex = '9999';
  
  let rolesHtml = allGuildRoles.filter(r => r.name !== '@everyone').map(r => {
    const hasRole = currentRoleIds.includes(r.id);
    return `
      <label style="display:flex; align-items:center; gap:8px; background:rgba(255,255,255,0.05); padding:8px; border-radius:4px; cursor:pointer;">
        <input type="checkbox" value="${r.id}" ${hasRole ? 'checked' : ''}>
        <div class="role-color" style="background:${r.color==='#000000'?'#64748b':r.color}"></div>
        <span>${r.name}</span>
      </label>
    `;
  }).join('');
  
  modal.innerHTML = `
    <div style="background:#1e293b; padding:2rem; border-radius:12px; border:1px solid rgba(255,255,255,0.1); width:400px; max-width:90%;">
      <h3 style="margin-top:0;">Manage Roles for ${tag}</h3>
      <div style="display:flex; flex-direction:column; gap:8px; margin:20px 0; max-height:300px; overflow-y:auto;" id="role-checkboxes">
        ${rolesHtml}
      </div>
      <div style="display:flex; gap:10px; justify-content:flex-end;">
        <button id="cancel-roles" style="padding:8px 16px; background:none; border:none; color:#94a3b8; cursor:pointer;">Cancel</button>
        <button id="save-roles" style="padding:8px 16px; background:#38bdf8; color:#0f172a; border:none; border-radius:6px; font-weight:bold; cursor:pointer;">Save Roles</button>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  document.getElementById('cancel-roles').onclick = () => modal.remove();
  document.getElementById('save-roles').onclick = async () => {
    const checks = modal.querySelectorAll('#role-checkboxes input:checked');
    const roleIds = Array.from(checks).map(c => c.value);
    
    document.getElementById('save-roles').innerText = 'Saving...';
    await apiFetch(`/api/guild/members/${memberId}/roles`, {
      method: 'PATCH', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ roles: roleIds })
    });
    
    modal.remove();
    loadMembers();
  };
}

// SETTINGS & COMMANDS
async function loadSettings() {
  const [setRes, cmdRes, chRes, roleRes] = await Promise.all([
    apiFetch('/api/settings'),
    apiFetch('/api/commands'),
    apiFetch('/api/guild/channels'),
    apiFetch('/api/guild/roles')
  ]);
  
  const settings = await setRes.json();
  const cmds = await cmdRes.json();
  const channels = await chRes.json();
  const roles = await roleRes.json();

  const textChannels = channels.filter(c => c.type === 0);
  const guildRoles = roles.filter(r => r.name !== '@everyone');

  // Populate dropdowns
  const cOptions = '<option value="">None</option>' + textChannels.map(c => `<option value="${c.id}">#${c.name}</option>`).join('');
  const rOptions = '<option value="">None</option>' + guildRoles.map(r => `<option value="${r.id}">${r.name}</option>`).join('');
  
  document.getElementById('set-welcome-channel').innerHTML = cOptions;
  document.getElementById('set-log-channel').innerHTML = cOptions;
  document.getElementById('set-appreview-channel').innerHTML = cOptions;
  document.getElementById('set-autorole').innerHTML = rOptions;

  // Set values
  if (settings.welcomeChannel) document.getElementById('set-welcome-channel').value = settings.welcomeChannel;
  if (settings.welcomeMessage) document.getElementById('set-welcome-msg').value = settings.welcomeMessage;
  if (settings.autoRole) document.getElementById('set-autorole').value = settings.autoRole;
  if (settings.logChannel) document.getElementById('set-log-channel').value = settings.logChannel;
  if (settings.appReviewChannel) document.getElementById('set-appreview-channel').value = settings.appReviewChannel;

  renderCommands(cmds);
}

function renderCommands(cmds) {
  const list = document.getElementById('cmd-list');
  if (cmds.length === 0) {
    list.innerHTML = `<div style="color:#64748b;">No custom commands yet.</div>`;
    return;
  }
  
  list.innerHTML = cmds.map(c => `
    <div style="display:flex; justify-content:space-between; align-items:center; background:rgba(0,0,0,0.2); padding:10px; border-radius:6px; border:1px solid rgba(255,255,255,0.05);">
      <div>
        <div style="font-weight:bold; color:#38bdf8;">${c.name} <span style="font-size:0.7rem; color:#94a3b8; background:rgba(255,255,255,0.1); padding:2px 6px; border-radius:4px; margin-left:6px;">${c.type === 'anywhere' ? 'Anywhere' : 'Prefix'}</span></div>
        <div style="font-size:0.8rem; color:#94a3b8;">Replies: ${c.reply}</div>
      </div>
      <button onclick="deleteCommand('${c.name}')" style="background:none; border:none; color:#ef4444; cursor:pointer;" title="Delete Command"><svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button>
    </div>
  `).join('');
}

async function saveSettings() {
  const settings = {
    welcomeChannel: document.getElementById('set-welcome-channel').value,
    welcomeMessage: document.getElementById('set-welcome-msg').value.trim(),
    autoRole: document.getElementById('set-autorole').value,
    logChannel: document.getElementById('set-log-channel').value,
    appReviewChannel: document.getElementById('set-appreview-channel').value
  };
  
  await apiFetch('/api/settings', {
    method: 'POST', headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(settings)
  });
  alert('Settings Saved!');
}

async function createCommand() {
  const type = document.getElementById('cmd-type').value;
  let name = document.getElementById('cmd-name').value.trim();
  const reply = document.getElementById('cmd-reply').value.trim();
  
  if (!name || !reply) return alert('Fill in both trigger word and reply content.');
  if (type === 'prefix' && !name.startsWith('!')) name = '!' + name;
  
  await apiFetch('/api/commands', {
    method: 'POST', headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({ name, reply, type })
  });
  
  document.getElementById('cmd-name').value = '';
  document.getElementById('cmd-reply').value = '';
  
  const res = await apiFetch('/api/commands');
  renderCommands(await res.json());
}

async function deleteCommand(name) {
  if (!confirm(`Delete command ${name}?`)) return;
  await apiFetch(`/api/commands/${encodeURIComponent(name)}`, { method: 'DELETE' });
  const res = await apiFetch('/api/commands');
  renderCommands(await res.json());
}

// AUTOCOMPLETE LOGIC
let autocompleteMembers = [];
let autocompleteChannels = [];
let activeAutocompleteInput = null;

document.addEventListener('DOMContentLoaded', () => {
  // Create global autocomplete dropdown
  const dropdown = document.createElement('div');
  dropdown.id = 'global-autocomplete';
  dropdown.style.cssText = 'display:none; position:absolute; max-height:150px; overflow-y:auto; background:#1e293b; border:1px solid rgba(255,255,255,0.1); border-radius:6px; z-index:9999; box-shadow:0 4px 6px -1px rgba(0,0,0,0.5); min-width:250px;';
  document.body.appendChild(dropdown);

  document.addEventListener('input', (e) => {
    if (e.target.tagName === 'INPUT' && e.target.type === 'text' || e.target.tagName === 'TEXTAREA') {
      handleAutocomplete(e.target);
    }
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('#global-autocomplete')) {
      document.getElementById('global-autocomplete').style.display = 'none';
      activeAutocompleteInput = null;
    }
  });
});

async function handleAutocomplete(input) {
  const val = input.value;
  const cursorPos = input.selectionStart;
  if (cursorPos === undefined) return;
  
  const textBeforeCursor = val.slice(0, cursorPos);
  const mentionMatch = textBeforeCursor.match(/@([a-zA-Z0-9_]*)$/);
  const channelMatch = textBeforeCursor.match(/#([a-zA-Z0-9_-]*)$/);
  const dropdown = document.getElementById('global-autocomplete');
  
  if (mentionMatch || channelMatch) {
    activeAutocompleteInput = input;
    const rect = input.getBoundingClientRect();
    dropdown.style.left = rect.left + 'px';
    const spaceBelow = window.innerHeight - rect.bottom;
    if (spaceBelow < 160) {
      dropdown.style.top = 'auto';
      dropdown.style.bottom = (window.innerHeight - rect.top + 4) + 'px';
    } else {
      dropdown.style.bottom = 'auto';
      dropdown.style.top = (rect.bottom + window.scrollY + 4) + 'px';
    }

    if (mentionMatch) {
      if (autocompleteMembers.length === 0) {
        const res = await apiFetch('/api/guild/members');
        autocompleteMembers = await res.json();
      }
      const query = mentionMatch[1].toLowerCase();
      const filtered = autocompleteMembers.filter(m => m.tag.toLowerCase().includes(query) || m.id.includes(query)).slice(0, 10);
      
      if (filtered.length > 0) {
        dropdown.style.display = 'block';
        dropdown.innerHTML = filtered.map(m => `
          <div style="padding:8px; cursor:pointer; display:flex; align-items:center; gap:8px;" 
               onmouseover="this.style.background='rgba(255,255,255,0.1)'" 
               onmouseout="this.style.background='none'"
               onclick="selectAutocomplete('${m.id}', '${m.tag.replace(/'/g, "\\'")}', 'user')">
            <img src="${m.avatar}" style="width:24px; height:24px; border-radius:50%; object-fit:cover;">
            <span>${m.tag}</span>
          </div>
        `).join('');
      } else {
        dropdown.style.display = 'none';
      }
    } else if (channelMatch) {
      if (autocompleteChannels.length === 0) {
        const res = await apiFetch('/api/guild/channels');
        const allChannels = await res.json();
        autocompleteChannels = allChannels.filter(c => c.type === 0);
      }
      const query = channelMatch[1].toLowerCase();
      const filtered = autocompleteChannels.filter(c => c.name.toLowerCase().includes(query)).slice(0, 10);
      
      if (filtered.length > 0) {
        dropdown.style.display = 'block';
        dropdown.innerHTML = filtered.map(c => `
          <div style="padding:8px; cursor:pointer; display:flex; align-items:center; gap:8px;" 
               onmouseover="this.style.background='rgba(255,255,255,0.1)'" 
               onmouseout="this.style.background='none'"
               onclick="selectAutocomplete('${c.id}', '${c.name.replace(/'/g, "\\'")}', 'channel')">
            <svg viewBox="0 0 24 24" width="16" height="16" stroke="#94a3b8" stroke-width="2" fill="none"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
            <span style="color:#e2e8f0; font-weight:500;">#${c.name}</span>
          </div>
        `).join('');
      } else {
        dropdown.style.display = 'none';
      }
    }
  } else {
    dropdown.style.display = 'none';
    activeAutocompleteInput = null;
  }
}

function selectAutocomplete(id, tag, type) {
  if (!activeAutocompleteInput) return;
  const input = activeAutocompleteInput;
  const val = input.value;
  const cursorPos = input.selectionStart;
  const textBeforeCursor = val.slice(0, cursorPos);
  const textAfterCursor = val.slice(cursorPos);
  
  let newTextBefore = '';
  if (type === 'user') {
    newTextBefore = textBeforeCursor.replace(/@[a-zA-Z0-9_]*$/, `<@${id}> `);
  } else if (type === 'channel') {
    newTextBefore = textBeforeCursor.replace(/#[a-zA-Z0-9_-]*$/, `<#${id}> `);
  }
  
  input.value = newTextBefore + textAfterCursor;
  document.getElementById('global-autocomplete').style.display = 'none';
  input.focus();
  
  // Set cursor position after the inserted tag
  const newCursorPos = newTextBefore.length;
  input.setSelectionRange(newCursorPos, newCursorPos);
}

// TICKETS
let currentTicketTab = 'active';

function setTicketTab(tab) {
  currentTicketTab = tab;
  
  if (tab === 'active') {
    document.getElementById('btn-tickets-active').style.background = 'rgba(56,189,248,0.2)';
    document.getElementById('btn-tickets-active').style.color = '#38bdf8';
    document.getElementById('btn-tickets-active').style.border = '1px solid rgba(56,189,248,0.4)';
    
    document.getElementById('btn-tickets-archived').style.background = 'rgba(255,255,255,0.05)';
    document.getElementById('btn-tickets-archived').style.color = '#94a3b8';
    document.getElementById('btn-tickets-archived').style.border = '1px solid transparent';
  } else {
    document.getElementById('btn-tickets-archived').style.background = 'rgba(192,132,252,0.2)';
    document.getElementById('btn-tickets-archived').style.color = '#c084fc';
    document.getElementById('btn-tickets-archived').style.border = '1px solid rgba(192,132,252,0.4)';
    
    document.getElementById('btn-tickets-active').style.background = 'rgba(255,255,255,0.05)';
    document.getElementById('btn-tickets-active').style.color = '#94a3b8';
    document.getElementById('btn-tickets-active').style.border = '1px solid transparent';
  }
  
  loadTickets();
}

async function loadTickets() {
  const listEl = document.getElementById('tickets-list');
  const searchQuery = document.getElementById('ticket-search').value.toLowerCase();
  
  listEl.innerHTML = '<div style="color:#64748b;">Loading transcripts...</div>';
  try {
    const isArchived = currentTicketTab === 'archived';
    const res = await apiFetch(`/api/tickets?archived=${isArchived}`);
    let tickets = await res.json();
    
    if (searchQuery) {
      tickets = tickets.filter(t => {
        if (t.closedBy.toLowerCase().includes(searchQuery)) return true;
        if (t.transcript && t.transcript.some(msg => msg.author.toLowerCase().includes(searchQuery))) return true;
        return false;
      });
    }
    
    if (!tickets || tickets.length === 0) {
      listEl.innerHTML = '<div style="color:#64748b;">No tickets found.</div>';
      return;
    }
    
    let html = '';
    tickets.forEach((t, i) => {
      const date = new Date(t.timestamp).toLocaleString();
      let transcriptHtml = '<div style="margin-top:1rem; padding:1rem; background:rgba(0,0,0,0.5); border-radius:8px; border:1px solid rgba(255,255,255,0.05); max-height:400px; overflow-y:auto;">';
      if (t.transcript && t.transcript.length > 0) {
        t.transcript.forEach(msg => {
          const time = new Date(msg.timestamp).toLocaleTimeString();
          transcriptHtml += `
            <div style="display:flex; margin-bottom:1rem; padding-bottom:1rem; border-bottom:1px solid rgba(255,255,255,0.02);">
              <img src="${msg.avatar || 'https://cdn.discordapp.com/embed/avatars/0.png'}" style="width:42px; height:42px; border-radius:50%; margin-right:1rem; background:#1e293b; object-fit:cover;" />
              <div>
                <div style="display:flex; align-items:baseline; margin-bottom:4px;">
                  <strong style="color:#f8fafc; font-size:1.05rem; margin-right:8px;">${msg.author}</strong>
                  <span style="color:#64748b; font-size:0.75rem;">${time}</span>
                </div>
                <div style="color:#cbd5e1; font-size:0.95rem;">${msg.content}</div>
              </div>
            </div>
          `;
        });
      } else {
        transcriptHtml += '<div style="color:#64748b;">No messages recorded.</div>';
      }
      transcriptHtml += '</div>';

      let actionButtons = '';
      if (!isArchived) {
        actionButtons = `<button onclick="archiveTicket('${t._id}', true)" style="background:#f59e0b; color:#fff; border:none; padding:6px 12px; border-radius:4px; font-weight:bold; cursor:pointer; margin-right:8px;">Archive</button>`;
      } else {
        actionButtons = `
          <button onclick="archiveTicket('${t._id}', false)" style="background:#10b981; color:#fff; border:none; padding:6px 12px; border-radius:4px; font-weight:bold; cursor:pointer; margin-right:8px;">Restore</button>
          <button onclick="deleteTicket('${t._id}')" style="background:#ef4444; color:#fff; border:none; padding:6px 12px; border-radius:4px; font-weight:bold; cursor:pointer; margin-right:8px;">Delete</button>
        `;
      }

      html += `
        <div style="background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.05); border-radius:8px; padding:1rem;">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <div>
              <h4 style="margin:0; color:#f8fafc; font-size:1.1rem;">${t.ticketName}</h4>
              <div style="color:#94a3b8; font-size:0.9rem; margin-top:4px;">Closed by <strong style="color:white;">${t.closedBy}</strong> on ${date}</div>
            </div>
            <div style="text-align:right;">
              <div style="color:#ef4444; font-size:0.9rem; margin-bottom:8px;"><strong>Reason:</strong> ${t.reason}</div>
              <div>
                ${actionButtons}
                <button onclick="document.getElementById('transcript-${i}').style.display = document.getElementById('transcript-${i}').style.display === 'none' ? 'block' : 'none'" style="background:#38bdf8; color:#0f172a; border:none; padding:6px 12px; border-radius:4px; font-weight:bold; cursor:pointer;">View</button>
              </div>
            </div>
          </div>
          <div id="transcript-${i}" style="display:none;">
            ${transcriptHtml}
          </div>
        </div>
      `;
    });
    
    listEl.innerHTML = html;
  } catch (err) {
    listEl.innerHTML = '<div style="color:#ef4444;">Error loading transcripts.</div>';
  }
}

async function archiveTicket(id, archived) {
  try {
    await apiFetch(`/api/tickets/${id}/archive`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ archived })
    });
    loadTickets();
  } catch (err) {
    alert('Failed to update ticket status');
  }
}

async function deleteTicket(id) {
  if (!confirm('Are you sure you want to PERMANENTLY delete this ticket? This cannot be undone.')) return;
  try {
    await apiFetch(`/api/tickets/${id}`, {
      method: 'DELETE'
    });
    loadTickets();
  } catch (err) {
    alert('Failed to delete ticket');
  }
}
