require('dotenv').config();

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const cors = require("cors"); 
const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcrypt');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

supabase.from('users').select('nickname').limit(1)
  .then(({ error }) => {
    if (error) console.error('Supabase connection failed:', error.message);
    else console.log('Supabase connected successfully');
  })
  .catch((error) => console.error('Supabase connection failed:', error.message));

// --- App setup ---
const app = express();

// --- CORS setup for all routes ---
app.use(cors({
  origin: [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "https://gradsquad-project.onrender.com"
  ],
  methods: ["GET", "POST", "PUT", "DELETE"],
  credentials: true
}));

// --- Server setup ---
const server = http.createServer(app);

// --- Socket.io setup with CORS ---
const io = new Server(server, {
  cors: {
    origin: [
      "http://localhost:3000",
      "http://127.0.0.1:3000",
      "https://gradsquad-project.onrender.com"
    ],
    methods: ["GET", "POST"],
    credentials: true
  }
});
// --- Middleware ---
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  next();
});
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
const mediaBucket = 'gradsquad-media';

// --- Track online users ---
const onlineUsers = new Set();

// --- Load chat history ---
let messages = [];
if (fs.existsSync(historyFile)) {
  try {
    const parsedHistory = JSON.parse(fs.readFileSync(historyFile));
    messages = Array.isArray(parsedHistory)
      ? parsedHistory
      : Array.isArray(parsedHistory.messages) ? parsedHistory.messages : [];
  } catch { messages = []; }
}

async function loadMessagesFromSupabase() {
  const { data, error } = await supabase.from('chat_messages').select('*').order('created_at');
  if (error) throw error;
  messages = (data || []).map(({ id, created_at, ...message }) => ({ ...message, createdAt: created_at, _id: String(id) }));
}

async function saveMessageToSupabase(message) {
  const { error } = await supabase.from('chat_messages').insert({
    nickname: message.nickname || null,
    text: message.text,
    color: message.color || null,
    system: Boolean(message.system)
  });
  if (error) throw error;
}

// --- Load users ---
let users = {};
if (fs.existsSync(usersFile)) {
  try { users = JSON.parse(fs.readFileSync(usersFile)); } catch { users = {}; }
}

function usersFromRows(rows) {
  return Object.fromEntries(rows.map((user) => [user.nickname, {
    password: user.password,
    birthdate: user.birthdate,
    color: user.color,
    avatar: user.avatar || 'default.png',
    admin: Boolean(user.admin),
    avatarChanges: user.avatar_changes || 0
  }]));
}

function publicUser(nickname, user) {
  const { password, ...safeUser } = user;
  return { nickname, ...safeUser };
}

async function loadUsersFromSupabase() {
  const { data, error } = await supabase.from('users').select('*');
  if (error) throw error;
  if (Array.isArray(data) && data.length) users = usersFromRows(data);

  for (const [nickname, user] of Object.entries(users)) {
    if (!user.password.startsWith('$2')) {
      user.password = await bcrypt.hash(user.password, 12);
      await saveUserToSupabase(nickname, user);
    }
  }
}

async function saveUserToSupabase(nickname, user) {
  const { error } = await supabase.from('users').upsert({
    nickname,
    password: user.password,
    birthdate: user.birthdate || null,
    color: user.color,
    avatar: user.avatar || 'default.png',
    admin: Boolean(user.admin),
    avatar_changes: user.avatarChanges || 0
  });
  if (error) throw error;
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

async function loadInvitesFromSupabase() {
  const { data, error } = await supabase.from('invites').select('*');
  if (error) throw error;
  if (Array.isArray(data)) {
    invites = Object.fromEntries(data.map((invite) => [invite.code, {
      createdBy: invite.created_by,
      createdAt: invite.created_at,
      used: Boolean(invite.used),
      ...(invite.used_by ? { usedBy: invite.used_by } : {}),
      ...(invite.used_at ? { usedAt: invite.used_at } : {})
    }]));
  }
}

async function saveInviteToSupabase(code, invite) {
  const { error } = await supabase.from('invites').upsert({
    code,
    created_by: invite.createdBy,
    created_at: invite.createdAt,
    used: Boolean(invite.used),
    used_by: invite.usedBy || null,
    used_at: invite.usedAt || null
  });
  if (error) throw error;
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

async function loadPlanningDataFromSupabase() {
  const [eventResult, placeResult, timeResult] = await Promise.all([
    supabase.from('events').select('*').order('id'),
    supabase.from('places').select('*').order('id'),
    supabase.from('times').select('*').order('id')
  ]);
  if (eventResult.error) throw eventResult.error;
  if (placeResult.error) throw placeResult.error;
  if (timeResult.error) throw timeResult.error;

  events = (eventResult.data || []).map(({ id, ...event }) => ({ _id: String(id), ...event }));
  places = (placeResult.data || []).map(({ id, ...place }) => ({ _id: String(id), ...place }));
  times = (timeResult.data || []).map(({ id, ...time }) => ({ _id: String(id), ...time }));
}

async function saveEventToSupabase(event) {
  const row = { ...event };
  delete row._id;
  const { data, error } = await supabase.from('events').insert(row).select().single();
  if (error) throw error;
  return { ...data, _id: String(data.id) };
}

async function savePlaceToSupabase(place) {
  const { data, error } = await supabase.from('places').insert({ name: place.name, votes: place.votes || 0 }).select().single();
  if (error) throw error;
  return { ...data, _id: String(data.id) };
}

async function saveTimeToSupabase(time) {
  const { data, error } = await supabase.from('times').insert({ time: time.time, nickname: time.nickname }).select().single();
  if (error) throw error;
  return { ...data, _id: String(data.id) };
}

// --- Load photos ---
let photos = [];
if (fs.existsSync(photosFile)) {
  try { photos = JSON.parse(fs.readFileSync(photosFile)); } catch { photos = []; }
}
function savePhotos() {
  fs.writeFileSync(photosFile, JSON.stringify(photos, null, 2));
}

async function loadPhotosFromSupabase() {
  const { data, error } = await supabase.from('photos').select('*').order('date', { ascending: false });
  if (error) throw error;
  photos = (data || []).map(({ id, storage_path, ...photo }) => ({
    ...photo,
    _id: String(id),
    url: storage_path ? supabase.storage.from(mediaBucket).getPublicUrl(storage_path).data.publicUrl : photo.url
  }));
}

async function savePhotoToSupabase(photo, storagePath) {
  const { data, error } = await supabase.from('photos').insert({
    url: photo.url,
    storage_path: storagePath,
    caption: photo.caption,
    uploader: photo.uploader,
    date: photo.date
  }).select().single();
  if (error) throw error;
  return { ...photo, _id: String(data.id) };
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

async function loadColorsFromSupabase() {
  const { data, error } = await supabase.from('colors').select('*').order('name');
  if (error) throw error;
  if (Array.isArray(data) && data.length) {
    availableColors = data.map(({ name, hex }) => ({ name, hex }));
    saveColors();
  }
}

async function saveColorsToSupabase() {
  const { error: deleteError } = await supabase.from('colors').delete().neq('hex', '');
  if (deleteError) throw deleteError;
  if (!availableColors.length) return;
  const { error } = await supabase.from('colors').insert(availableColors);
  if (error) throw error;
}

function saveColors() {
  fs.writeFileSync(colorsFile, JSON.stringify(availableColors, null, 2));
}
function reserveColor(hex) {
  const idx = availableColors.findIndex(c => c.hex.toLowerCase() === hex.toLowerCase());
  if (idx !== -1) {
    availableColors.splice(idx, 1);
    saveColors();
    saveColorsToSupabase().catch(error => console.error('Supabase colors save failed:', error.message));
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
    saveColorsToSupabase().catch(error => console.error('Supabase colors save failed:', error.message));
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
app.get('/users', (req, res) => {
  res.json(Object.fromEntries(Object.entries(users).map(([nickname, user]) => [nickname, publicUser(nickname, user)])));
});
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
app.post('/upload-avatar', upload.single('avatar'), async (req, res) => {
  const nickname = req.body.nickname;
  if (!nickname || !req.file) return res.json({ success: false });
  const avatarPath = '/uploads/' + req.file.filename;
  if (users[nickname]) {
    users[nickname].avatar = avatarPath;
    // Track avatar changes for Chameleon achievement
    users[nickname].avatarChanges = (users[nickname].avatarChanges || 0) + 1;
    try {
      await saveUserToSupabase(nickname, users[nickname]);
      fs.writeFileSync(usersFile, JSON.stringify(users, null, 2));
    } catch (error) {
      return res.json({ success: false, message: `Could not save avatar: ${error.message}` });
    }
  }
  res.json({ success: true, url: avatarPath });
});

// --- Update account ---
app.post('/update-account', async (req, res) => {
  const { oldNickname, currentPassword, newNickname, newColor, newPassword } = req.body;
  const user = users[oldNickname];
  if (!user || !(await bcrypt.compare(currentPassword, user.password))) return res.json({ success: false, message: 'Invalid credentials.' });

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
  if (newPassword) users[resultNick].password = await bcrypt.hash(newPassword, 12);

  try {
    if (resultNick !== oldNickname) {
      const { error: deleteError } = await supabase.from('users').delete().eq('nickname', oldNickname);
      if (deleteError) throw deleteError;
    }
    await saveUserToSupabase(resultNick, users[resultNick]);
    fs.writeFileSync(usersFile, JSON.stringify(users, null, 2));
  } catch (error) {
    return res.json({ success: false, message: `Could not save account: ${error.message}` });
  }
  io.emit('available colors', availableColors);
  res.json({ success: true, nickname: resultNick, color: users[resultNick].color });
});

// --- Events API ---
app.get('/events', (req, res) => res.json(events));
app.post('/events', async (req, res) => {
  const { title, date, time, creator, type, attendees } = req.body;
  if (!title || !date) return res.json({ success: false, message: "Missing fields" });
  const newEvent = { title, date, time, creator, type, attendees: attendees || [], reminder: false };
  try {
    const savedEvent = await saveEventToSupabase(newEvent);
    events.push(savedEvent);
    saveEvents();
  } catch (error) {
    return res.json({ success: false, message: `Could not save event: ${error.message}` });
  }
  io.emit('new event', newEvent);
  res.json({ success: true, event: newEvent });
});

// --- Places API ---
app.get('/places', (req, res) => res.json(places));
app.post('/places', async (req, res) => {
  const { name } = req.body;
  if (!name) return res.json({ success: false });
  const newPlace = { _id: Date.now().toString(), name, votes: 0 };
  try {
    const savedPlace = await savePlaceToSupabase(newPlace);
    places.push(savedPlace);
    savePlaces();
  } catch (error) {
    return res.json({ success: false, message: `Could not save place: ${error.message}` });
  }
  io.emit('places updated');
  res.json({ success: true, place: newPlace });
});

app.post('/places/:id/vote', async (req, res) => {
  const placeId = req.params.id;
  const place = places.find(p => p._id === placeId);
  if (!place) return res.json({ success: false });
  place.votes = (place.votes || 0) + 1;
  try {
    const { error } = await supabase.from('places').update({ votes: place.votes }).eq('id', placeId);
    if (error) throw error;
    savePlaces();
  } catch (error) {
    return res.json({ success: false, message: `Could not save vote: ${error.message}` });
  }
  io.emit('places updated');
  res.json({ success: true });
});

// --- Times API ---
app.get('/times', (req, res) => res.json(times));
app.post('/times', async (req, res) => {
  const { time, nickname } = req.body;
  if (!time || !nickname) return res.json({ success: false });
  const newTimeVote = { _id: Date.now().toString(), time, nickname };
  try {
    const savedTime = await saveTimeToSupabase(newTimeVote);
    times.push(savedTime);
    saveTimes();
  } catch (error) {
    return res.json({ success: false, message: `Could not save time vote: ${error.message}` });
  }
  io.emit('times updated');
  res.json({ success: true });
});

// --- Photos API ---
app.get('/photos', (req, res) => res.json(photos));
app.post('/upload-photo', upload.single('photo'), async (req, res) => {
  if (!req.file) return res.json({ success: false, message: 'No file uploaded' });
  
  const caption = req.body.caption || '';
  const uploader = req.body.uploader || 'Unknown';
  const storagePath = `photos/${Date.now()}-${req.file.filename}`;
  const photoUrl = supabase.storage.from(mediaBucket).getPublicUrl(storagePath).data.publicUrl;
  
  const newPhoto = {
    _id: Date.now().toString(),
    url: photoUrl,
    caption: caption.substring(0, 200), // Limit caption length
    uploader: uploader,
    date: new Date().toISOString()
  };
  
  try {
    const fileContents = fs.readFileSync(req.file.path);
    const { error: uploadError } = await supabase.storage.from(mediaBucket).upload(storagePath, fileContents, {
      contentType: req.file.mimetype,
      upsert: false
    });
    if (uploadError) throw uploadError;
    const savedPhoto = await savePhotoToSupabase(newPhoto, storagePath);
    photos.unshift(savedPhoto);
    savePhotos();
    fs.unlinkSync(req.file.path);
  } catch (error) {
    try { fs.unlinkSync(req.file.path); } catch (cleanupError) { }
    return res.json({ success: false, message: `Could not save photo: ${error.message}` });
  }
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
  socket.on('signup', async ({ nickname, password, birthdate, color, inviteCode }) => {
    if (!inviteCode) return socket.emit('signup error', "Invite code is required.");
    const invite = invites[inviteCode];
    if (!invite || invite.used) return socket.emit('signup error', "Invalid or used invite code.");

    if (users[nickname]) return socket.emit('signup error', "Nickname taken!");
    if (!reserveColor(color)) return socket.emit('signup error', "Color not available.");

    users[nickname] = { password: await bcrypt.hash(password, 12), birthdate, color, avatar: "default.png", admin: false };
    invites[inviteCode].used = true;
    invites[inviteCode].usedBy = nickname;
    invites[inviteCode].usedAt = new Date().toISOString();

    try {
      await saveUserToSupabase(nickname, users[nickname]);
      await saveInviteToSupabase(inviteCode, invites[inviteCode]);
    } catch (error) {
      delete users[nickname];
      invites[inviteCode].used = false;
      delete invites[inviteCode].usedBy;
      delete invites[inviteCode].usedAt;
      saveInvites();
      return socket.emit('signup error', `Could not save account: ${error.message}`);
    }
    fs.writeFileSync(usersFile, JSON.stringify(users, null, 2));
    saveInvites();

    socket.nickname = nickname;
    socket.isLoggedIn = true;
    onlineUsers.add(nickname);
    io.emit('online users', Array.from(onlineUsers));

    socket.emit('signup success', publicUser(nickname, users[nickname]));

    // no system join message sent
  });

  // --- Login ---
  socket.on('login', async ({ nickname, password }) => {
    const { data, error } = await supabase.from('users').select('*').eq('nickname', nickname).maybeSingle();
    if (error) return socket.emit('login error', 'Unable to reach account database.');
    if (!data || !(await bcrypt.compare(password, data.password))) return socket.emit('login error', "Invalid login.");

    users[nickname] = usersFromRows([data])[nickname];

    socket.nickname = nickname;
    socket.isLoggedIn = true;
    onlineUsers.add(nickname);
    io.emit('online users', Array.from(onlineUsers));
    socket.emit('login success', publicUser(nickname, users[nickname]));

    // no system join message sent
  });

  // --- Admin invite actions ---
  socket.on('generate invite', async () => {
    const creator = socket.nickname;
    if (!creator || !users[creator]?.admin) return socket.emit('invite error', 'Unauthorized.');

    const code = Math.random().toString(36).slice(2, 10).toUpperCase() + Math.random().toString(36).slice(2, 6).toUpperCase();
    invites[code] = {
      createdBy: creator,
      createdAt: new Date().toISOString(),
      used: false
    };
    try {
      await saveInviteToSupabase(code, invites[code]);
      saveInvites();
    } catch (error) {
      delete invites[code];
      return socket.emit('invite error', `Could not save invite: ${error.message}`);
    }

    socket.emit('invite generated', { code, url: `/?invite=${code}` });
    io.emit('invites updated');
  });

  socket.on('get invites', async () => {
    const requester = socket.nickname;
    if (!requester || !users[requester]?.admin) return socket.emit('invite error', 'Unauthorized.');
    try {
      const { data, error } = await supabase.from('invites').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      socket.emit('invites list', data.map((invite) => ({
        code: invite.code,
        createdBy: invite.created_by,
        createdAt: invite.created_at,
        used: Boolean(invite.used),
        usedBy: invite.used_by,
        usedAt: invite.used_at
      })));
    } catch (error) {
      socket.emit('invite error', `Could not load invites: ${error.message}`);
    }
  });

  socket.on('set admin', async (targetNickname) => {
    const requester = socket.nickname;
    if (!requester || !users[requester]?.admin) return socket.emit('admin error', 'Unauthorized.');
    if (!targetNickname || !users[targetNickname]) return socket.emit('admin error', 'User not found.');

    Object.keys(users).forEach((name) => { users[name].admin = false; });
    users[targetNickname].admin = true;
    try {
      await Promise.all(Object.entries(users).map(([name, user]) => saveUserToSupabase(name, user)));
      fs.writeFileSync(usersFile, JSON.stringify(users, null, 2));
    } catch (error) {
      return socket.emit('admin error', `Could not save admin change: ${error.message}`);
    }

    socket.emit('admin updated', targetNickname);
    io.emit('admin changed', targetNickname);
  });

  // --- Chat messages ---
  socket.on('chat message', async (msg) => {
    const sender = socket.nickname || msg.nickname || "Unknown";
    const userColor = users[sender]?.color || '#ffffff';
    const fullMsg = { nickname: sender, text: msg.text, color: userColor, system: false };
    try {
      await saveMessageToSupabase(fullMsg);
    } catch (error) {
      return socket.emit('chat error', `Could not save message: ${error.message}`);
    }
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
  socket.on('join chat', async ({ nickname }) => {
    if (users[nickname]) {
      const joinMsg = { text: `${nickname} joined the chat`, system: true };
      try { await saveMessageToSupabase(joinMsg); } catch (error) { return socket.emit('chat error', `Could not save message: ${error.message}`); }
      messages.push(joinMsg);
      fs.writeFileSync(historyFile, JSON.stringify(messages, null, 2));
      io.emit('chat message', joinMsg);
    }
  });

  socket.on('leave chat', async ({ nickname }) => {
    if (users[nickname]) {
      const leaveMsg = { text: `${nickname} left the chat`, system: true };
      try { await saveMessageToSupabase(leaveMsg); } catch (error) { return socket.emit('chat error', `Could not save message: ${error.message}`); }
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
  socket.on('delete event', async (eventIndex) => {
    if (typeof eventIndex === 'number' && events[eventIndex]) {
      const removed = events.splice(eventIndex, 1)[0];
      const { error } = await supabase.from('events').delete().eq('id', removed._id);
      if (error) return socket.emit('event error', `Could not delete event: ${error.message}`);
      saveEvents();
      io.emit('event deleted', { index: eventIndex, event: removed });
    }
  });
  socket.on('update event', async ({ index, updated }) => {
    if (typeof index === 'number' && events[index]) {
      events[index] = { ...events[index], ...updated };
      const event = { ...events[index] };
      delete event._id;
      const { error } = await supabase.from('events').update(event).eq('id', events[index]._id);
      if (error) return socket.emit('event error', `Could not update event: ${error.message}`);
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

server.listen(PORT, async () => {
  console.log(`Gradsquad server running on http://localhost:${PORT}`);
  try {
    await loadUsersFromSupabase();
    console.log('Users loaded from Supabase');
  } catch (error) {
    console.error('Supabase users load failed; using local users:', error.message);
  }
  try {
    await loadInvitesFromSupabase();
    console.log('Invites loaded from Supabase');
  } catch (error) {
    console.error('Supabase invites load failed; using local invites:', error.message);
  }
  try {
    await loadPlanningDataFromSupabase();
    console.log('Events and planning data loaded from Supabase');
  } catch (error) {
    console.error('Supabase planning data load failed; using local data:', error.message);
  }
  try {
    await loadMessagesFromSupabase();
    console.log('Chat messages loaded from Supabase');
  } catch (error) {
    console.error('Supabase chat load failed; using local messages:', error.message);
  }
  try {
    await loadPhotosFromSupabase();
    console.log('Photos loaded from Supabase');
  } catch (error) {
    console.error('Supabase photos load failed; using local photos:', error.message);
  }
  try {
    await loadColorsFromSupabase();
    console.log('Colors loaded from Supabase');
  } catch (error) {
    console.error('Supabase colors load failed; using local colors:', error.message);
  }
  checkBirthdaysToday();
});