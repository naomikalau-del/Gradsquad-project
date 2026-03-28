const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const path = require('path');
const multer = require('multer');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// --- Middleware ---
app.use(express.static(__dirname));
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// --- Multer setup ---
const upload = multer({ dest: path.join(__dirname, 'uploads') });

// --- Files and storage ---
const historyFile = 'chatHistory.json';
const usersFile = 'users.json';
const colorsFile = 'colors.json';
const eventsFile = 'events.json';
const placesFile = 'places.json';
const timesFile = 'times.json';
const photosFile = 'photos.json';

// --- Track online users ---
const onlineUsers = new Set();

// --- Load chat history ---
let messages = [];
if (fs.existsSync(historyFile)) {
  try { messages = JSON.parse(fs.readFileSync(historyFile)); } catch { messages = []; }
}

// --- Load users ---
let users = {};
if (fs.existsSync(usersFile)) {
  try { users = JSON.parse(fs.readFileSync(usersFile)); } catch { users = {}; }
}

// Ensure there is at least one admin. If no admin exists, assign the first user.
if (!Object.values(users).some(u => u.admin)) {
  const firstUser = Object.keys(users)[0];
  if (firstUser) {
    users[firstUser].admin = true;
    fs.writeFileSync(usersFile, JSON.stringify(users, null, 2));
  }
}

// --- Load invites ---
const invitesFile = 'invites.json';
let invites = {};
if (fs.existsSync(invitesFile)) {
  try { invites = JSON.parse(fs.readFileSync(invitesFile)); } catch { invites = {}; }
}

function saveInvites() {
  fs.writeFileSync(invitesFile, JSON.stringify(invites, null, 2));
}

// --- Load events ---
let events = [];
if (fs.existsSync(eventsFile)) {
  try { events = JSON.parse(fs.readFileSync(eventsFile)); } catch { events = []; }
}
function saveEvents() {
  fs.writeFileSync(eventsFile, JSON.stringify(events, null, 2));
}

// --- Load places ---
let places = [];
if (fs.existsSync(placesFile)) {
  try { places = JSON.parse(fs.readFileSync(placesFile)); } catch { places = []; }
}
function savePlaces() {
  fs.writeFileSync(placesFile, JSON.stringify(places, null, 2));
}

// --- Load times ---
let times = [];
if (fs.existsSync(timesFile)) {
  try { times = JSON.parse(fs.readFileSync(timesFile)); } catch { times = []; }
}
function saveTimes() {
  fs.writeFileSync(timesFile, JSON.stringify(times, null, 2));
}

// --- Load photos ---
let photos = [];
if (fs.existsSync(photosFile)) {
  try { photos = JSON.parse(fs.readFileSync(photosFile)); } catch { photos = []; }
}
function savePhotos() {
  fs.writeFileSync(photosFile, JSON.stringify(photos, null, 2));
}

// --- Color pool management ---
const defaultColors = [
  { name: 'Teal', hex: '#2a9d8f' },
  { name: 'Blue', hex: '#3b82f6' },
  { name: 'Purple', hex: '#8b5cf6' },
  { name: 'Orange', hex: '#f97316' },
  { name: 'Green', hex: '#10b981' },
  { name: 'Pink', hex: '#ec4899' },
  { name: 'Red', hex: '#ef4444' },
  { name: 'Yellow', hex: '#f59e0b' },
  { name: 'Indigo', hex: '#6366f1' },
  { name: 'Cyan', hex: '#06b6d4' },
  { name: 'Lime', hex: '#84cc16' },
  { name: 'Rose', hex: '#fb7185' },
  { name: 'Amber', hex: '#f59e0b' },
  { name: 'Slate', hex: '#64748b' }
];

let availableColors = [];
if (fs.existsSync(colorsFile)) {
  try { availableColors = JSON.parse(fs.readFileSync(colorsFile)); } catch { availableColors = [...defaultColors]; }
} else {
  availableColors = [...defaultColors];
  fs.writeFileSync(colorsFile, JSON.stringify(availableColors, null, 2));
}

function saveColors() {
  fs.writeFileSync(colorsFile, JSON.stringify(availableColors, null, 2));
}
function reserveColor(hex) {
  const idx = availableColors.findIndex(c => c.hex.toLowerCase() === hex.toLowerCase());
  if (idx !== -1) {
    availableColors.splice(idx, 1);
    saveColors();
    io.emit('available colors', availableColors);
    return true;
  }
  return false;
}
function freeColor(hex, name = null) {
  const exists = availableColors.some(c => c.hex.toLowerCase() === hex.toLowerCase());
  if (!exists) {
    availableColors.push({ name: name || hex, hex });
    saveColors();
    io.emit('available colors', availableColors);
  }
}

// --- Serve pages ---
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'home.html')));
app.get('/dashboard', (req, res) => res.sendFile(path.join(__dirname, 'dashboard.html')));
app.get('/profile', (req, res) => res.sendFile(path.join(__dirname, 'profile.html')));
app.get('/chat', (req, res) => res.sendFile(path.join(__dirname, 'chat.html')));
app.get('/settings', (req, res) => res.sendFile(path.join(__dirname, 'settings.html')));
app.get('/calendar', (req, res) => res.sendFile(path.join(__dirname, 'calendar.html')));
app.get('/planning', (req, res) => res.sendFile(path.join(__dirname, 'planning.html')));
app.get('/photoalbum', (req, res) => res.sendFile(path.join(__dirname, 'photoalbum.html')));
app.get('/achievements', (req, res) => res.sendFile(path.join(__dirname, 'achievements.html')));
app.get('/users', (req, res) => res.json(users));
app.get('/online-users', (req, res) => {
  const onlineList = Array.from(onlineUsers).map(nickname => ({ nickname }));
  res.json(onlineList);
});

app.get('/invite/:code', (req, res) => {
  const code = req.params.code;
  const invite = invites[code];
  if (!invite || invite.used) {
    return res.json({ valid: false });
  }
  return res.json({ valid: true, invite });
});

app.get('/invites', (req, res) => {
  // Provide a list of active invites for admin dashboards (no passwords, only metadata)
  const filtered = Object.entries(invites).map(([code, info]) => ({ code, ...info }));
  res.json(filtered);
});

app.get('/birthdays', (req, res) => res.sendFile(path.join(__dirname, 'birthdays.html')));

// --- Avatar upload ---
app.post('/upload-avatar', upload.single('avatar'), (req, res) => {
  const nickname = req.body.nickname;
  if (!nickname || !req.file) return res.json({ success: false });
  const avatarPath = '/uploads/' + req.file.filename;
  if (users[nickname]) {
    users[nickname].avatar = avatarPath;
    // Track avatar changes for Chameleon achievement
    users[nickname].avatarChanges = (users[nickname].avatarChanges || 0) + 1;
    fs.writeFileSync(usersFile, JSON.stringify(users, null, 2));
  }
  res.json({ success: true, url: avatarPath });
});

// --- Update account ---
app.post('/update-account', (req, res) => {
  const { oldNickname, currentPassword, newNickname, newColor, newPassword } = req.body;
  const user = users[oldNickname];
  if (!user || user.password !== currentPassword) return res.json({ success: false, message: 'Invalid credentials.' });

  let resultNick = oldNickname;
  if (newNickname && newNickname !== oldNickname) {
    if (users[newNickname]) return res.json({ success: false, message: 'Nickname taken.' });
    users[newNickname] = { ...user };
    delete users[oldNickname];
    resultNick = newNickname;
  }

  if (newColor && newColor !== users[resultNick].color) {
    freeColor(users[resultNick].color);
    reserveColor(newColor);
    users[resultNick].color = newColor;
  }
  if (newPassword) users[resultNick].password = newPassword;

  fs.writeFileSync(usersFile, JSON.stringify(users, null, 2));
  io.emit('available colors', availableColors);
  res.json({ success: true, nickname: resultNick, color: users[resultNick].color });
});

// --- Events API ---
app.get('/events', (req, res) => res.json(events));
app.post('/events', (req, res) => {
  const { title, date, time, creator, type, attendees } = req.body;
  if (!title || !date) return res.json({ success: false, message: "Missing fields" });
  const newEvent = { title, date, time, creator, type, attendees: attendees || [], reminder: false };
  events.push(newEvent);
  saveEvents();
  io.emit('new event', newEvent);
  res.json({ success: true, event: newEvent });
});

// --- Places API ---
app.get('/places', (req, res) => res.json(places));
app.post('/places', (req, res) => {
  const { name } = req.body;
  if (!name) return res.json({ success: false });
  const newPlace = { _id: Date.now().toString(), name, votes: 0 };
  places.push(newPlace);
  savePlaces();
  io.emit('places updated');
  res.json({ success: true, place: newPlace });
});

app.post('/places/:id/vote', (req, res) => {
  const placeId = req.params.id;
  const place = places.find(p => p._id === placeId);
  if (!place) return res.json({ success: false });
  place.votes = (place.votes || 0) + 1;
  savePlaces();
  io.emit('places updated');
  res.json({ success: true });
});

// --- Times API ---
app.get('/times', (req, res) => res.json(times));
app.post('/times', (req, res) => {
  const { time, nickname } = req.body;
  if (!time || !nickname) return res.json({ success: false });
  const newTimeVote = { _id: Date.now().toString(), time, nickname };
  times.push(newTimeVote);
  saveTimes();
  io.emit('times updated');
  res.json({ success: true });
});

// --- Photos API ---
app.get('/photos', (req, res) => res.json(photos));
app.post('/upload-photo', upload.single('photo'), (req, res) => {
  if (!req.file) return res.json({ success: false, message: 'No file uploaded' });
  
  const caption = req.body.caption || '';
  const uploader = req.body.uploader || 'Unknown';
  const photoPath = '/uploads/' + req.file.filename;
  
  const newPhoto = {
    _id: Date.now().toString(),
    url: photoPath,
    caption: caption.substring(0, 200), // Limit caption length
    uploader: uploader,
    date: new Date().toISOString()
  };
  
  photos.unshift(newPhoto); // Add to beginning (newest first)
  savePhotos();
  io.emit('photos updated');
  res.json({ success: true, photo: newPhoto });
});

// --- Achievement System ---
const achievementDefs = {
  'Photo Enthusiast': { emoji: '⭐', thresholds: [5, 10, 30], stat: 'photoCount' },
  'Social Butterfly': { emoji: '🦋', thresholds: [25, 75, 200], stat: 'messageCount' },
  'Planner': { emoji: '📋', thresholds: [3, 10, 25], stat: 'eventCount' },
  'Chameleon': { emoji: '🦎', thresholds: [7, 15, 30], stat: 'avatarChanges' }
};

function calculateAchievements(nickname) {
  const user = users[nickname];
  if (!user) return [];

  const achievements = [];

  // Count photos uploaded by this user
  const photoCount = photos.filter(p => p.uploader === nickname).length;
  
  // Count messages sent by this user
  const messageCount = messages.filter(m => m.nickname === nickname && !m.system).length;
  
  // Count events created by this user
  const eventCount = events.filter(e => e.creator === nickname).length;
  
  // Avatar changes count
  const avatarChanges = user.avatarChanges || 0;

  // Check Photo Enthusiast
  achievementDefs['Photo Enthusiast'].thresholds.forEach((threshold, level) => {
    if (photoCount >= threshold) {
      achievements.push({
        name: `Photo Enthusiast ${level + 1}`,
        emoji: '⭐',
        level: level + 1,
        progress: photoCount,
        threshold: threshold
      });
    }
  });

  // Check Social Butterfly
  achievementDefs['Social Butterfly'].thresholds.forEach((threshold, level) => {
    if (messageCount >= threshold) {
      achievements.push({
        name: `Social Butterfly ${level + 1}`,
        emoji: '🦋',
        level: level + 1,
        progress: messageCount,
        threshold: threshold
      });
    }
  });

  // Check Planner
  achievementDefs['Planner'].thresholds.forEach((threshold, level) => {
    if (eventCount >= threshold) {
      achievements.push({
        name: `Planner ${level + 1}`,
        emoji: '📋',
        level: level + 1,
        progress: eventCount,
        threshold: threshold
      });
    }
  });

  // Check Chameleon
  if (avatarChanges >= 7) {
    achievements.push({
      name: 'Chameleon 1',
      emoji: '🦎',
      level: 1,
      progress: avatarChanges,
      threshold: 7
    });
  }

  return achievements;
}

function getAllAchievementProgress(nickname) {
  const user = users[nickname];
  if (!user) return [];

  const photoCount = photos.filter(p => p.uploader === nickname).length;
  const messageCount = messages.filter(m => m.nickname === nickname && !m.system).length;
  const eventCount = events.filter(e => e.creator === nickname).length;
  const avatarChanges = user.avatarChanges || 0;

  const statMap = {
    'Photo Enthusiast': photoCount,
    'Social Butterfly': messageCount,
    'Planner': eventCount,
    'Chameleon': avatarChanges
  };

  const progressList = [];

  Object.entries(achievementDefs).forEach(([name, def]) => {
    const current = statMap[name] || 0;
    def.thresholds.forEach((threshold, idx) => {
      progressList.push({
        name: `${name} ${idx + 1}`,
        emoji: def.emoji,
        level: idx + 1,
        progress: current,
        threshold,
        completed: current >= threshold
      });
    });
  });

  return progressList;
}

// --- Achievements API ---
app.get('/achievements/:nickname', (req, res) => {
  const nickname = req.params.nickname;
  const achievements = getAllAchievementProgress(nickname);
  res.json(achievements);
});

// --- Socket.io logic ---
io.on('connection', (socket) => {
  socket.isLoggedIn = false;

  socket.emit('chat history', messages);
  socket.emit('available colors', availableColors);
  socket.emit('events', events);
  socket.emit('places', places);
  socket.emit('times', times);
  socket.emit('photos', photos);

  socket.on('set nickname', (nickname) => {
    socket.nickname = nickname;
  });

  // Re-authenticate user on new socket connection (e.g., when navigating between pages)
  socket.on('set user', ({ nickname }) => {
    if (users[nickname]) {
      socket.nickname = nickname;
      socket.isLoggedIn = true;
      onlineUsers.add(nickname);
      io.emit('online users', Array.from(onlineUsers));
    }
  });

  // --- Signup ---
  socket.on('signup', ({ nickname, password, birthdate, color, inviteCode }) => {
    if (!inviteCode) return socket.emit('signup error', "Invite code is required.");
    const invite = invites[inviteCode];
    if (!invite || invite.used) return socket.emit('signup error', "Invalid or used invite code.");

    if (users[nickname]) return socket.emit('signup error', "Nickname taken!");
    if (!reserveColor(color)) return socket.emit('signup error', "Color not available.");

    users[nickname] = { password, birthdate, color, avatar: "default.png", admin: false };
    invites[inviteCode].used = true;
    invites[inviteCode].usedBy = nickname;
    invites[inviteCode].usedAt = new Date().toISOString();

    fs.writeFileSync(usersFile, JSON.stringify(users, null, 2));
    saveInvites();

    socket.nickname = nickname;
    socket.isLoggedIn = true;
    onlineUsers.add(nickname);
    io.emit('online users', Array.from(onlineUsers));

    socket.emit('signup success', { nickname, ...users[nickname] });

    // no system join message sent
  });

  // --- Login ---
  socket.on('login', ({ nickname, password }) => {
    if (!users[nickname] || users[nickname].password !== password) return socket.emit('login error', "Invalid login.");

    socket.nickname = nickname;
    socket.isLoggedIn = true;
    onlineUsers.add(nickname);
    io.emit('online users', Array.from(onlineUsers));
    socket.emit('login success', { nickname, ...users[nickname] });

    // no system join message sent
  });

  // --- Admin invite actions ---
  socket.on('generate invite', () => {
    const creator = socket.nickname;
    if (!creator || !users[creator]?.admin) return socket.emit('invite error', 'Unauthorized.');

    const code = Math.random().toString(36).slice(2, 10).toUpperCase() + Math.random().toString(36).slice(2, 6).toUpperCase();
    invites[code] = {
      createdBy: creator,
      createdAt: new Date().toISOString(),
      used: false
    };
    saveInvites();

    socket.emit('invite generated', { code, url: `/?invite=${code}` });
    io.emit('invites updated');
  });

  socket.on('get invites', () => {
    const requester = socket.nickname;
    if (!requester || !users[requester]?.admin) return socket.emit('invite error', 'Unauthorized.');
    socket.emit('invites list', Object.entries(invites).map(([code, info]) => ({ code, ...info })));
  });

  socket.on('set admin', (targetNickname) => {
    const requester = socket.nickname;
    if (!requester || !users[requester]?.admin) return socket.emit('admin error', 'Unauthorized.');
    if (!targetNickname || !users[targetNickname]) return socket.emit('admin error', 'User not found.');

    Object.keys(users).forEach((name) => { users[name].admin = false; });
    users[targetNickname].admin = true;
    fs.writeFileSync(usersFile, JSON.stringify(users, null, 2));

    socket.emit('admin updated', targetNickname);
    io.emit('admin changed', targetNickname);
  });

  // --- Chat messages ---
  socket.on('chat message', (msg) => {
    const sender = socket.nickname || msg.nickname || "Unknown";
    const userColor = users[sender]?.color || '#ffffff';
    const fullMsg = { nickname: sender, text: msg.text, color: userColor, system: false };
    messages.push(fullMsg);
    fs.writeFileSync(historyFile, JSON.stringify(messages, null, 2));
    io.emit('chat message', fullMsg);
  });

  socket.on('logout', () => {
    socket.isLoggedIn = false;
    if (socket.nickname) {
      onlineUsers.delete(socket.nickname);
      io.emit('online users', Array.from(onlineUsers));
    }
    try { socket.disconnect(true); } catch (e) { }
  });

  socket.on('disconnect', () => {
    socket.isLoggedIn = false;
    if (socket.nickname) {
      onlineUsers.delete(socket.nickname);
      io.emit('online users', Array.from(onlineUsers));
    }
  });

  // --- Chat page join/leave ---
  socket.on('join chat', ({ nickname }) => {
    if (users[nickname]) {
      const joinMsg = { text: `${nickname} joined the chat`, system: true };
      messages.push(joinMsg);
      fs.writeFileSync(historyFile, JSON.stringify(messages, null, 2));
      io.emit('chat message', joinMsg);
    }
  });

  socket.on('leave chat', ({ nickname }) => {
    if (users[nickname]) {
      const leaveMsg = { text: `${nickname} left the chat`, system: true };
      messages.push(leaveMsg);
      fs.writeFileSync(historyFile, JSON.stringify(messages, null, 2));
      io.emit('chat message', leaveMsg);
    }
  });

  // --- Planning page join/leave ---
  socket.on('join planning', ({ nickname }) => {
    // No visible message for planning join
  });

  socket.on('leave planning', ({ nickname }) => {
    // No visible message for planning leave
  });

  // --- Event deletion / update ---
  socket.on('delete event', (eventIndex) => {
    if (typeof eventIndex === 'number' && events[eventIndex]) {
      const removed = events.splice(eventIndex, 1)[0];
      saveEvents();
      io.emit('event deleted', { index: eventIndex, event: removed });
    }
  });
  socket.on('update event', ({ index, updated }) => {
    if (typeof index === 'number' && events[index]) {
      events[index] = { ...events[index], ...updated };
      saveEvents();
      io.emit('event updated', { index, event: events[index] });
    }
  });
});

// --- Start server ---
const PORT = process.env.PORT || 3000;

function checkBirthdaysToday() {
  const today = new Date();
  const todayMonth = today.getMonth();
  const todayDay = today.getDate();

  Object.entries(users).forEach(([name, user]) => {
    if (!user.birthdate) return;

    const birth = new Date(user.birthdate);
    if (birth.getMonth() === todayMonth && birth.getDate() === todayDay) {
      const message = { text: `🎉 Today is ${name}'s birthday! 🎂`, system: true };
      messages.push(message);
      fs.writeFileSync(historyFile, JSON.stringify(messages, null, 2));
      io.emit('chat message', message);
    }
  });
}

server.listen(PORT, () => {
  console.log(`Gradsquad server running on http://localhost:${PORT}`);
  checkBirthdaysToday();
});