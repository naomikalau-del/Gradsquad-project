// sidebar.js
if (!window.musicScriptLoaded) {
  const script = document.createElement("script");
  script.src = "/music.js";
  script.defer = true;
  document.head.appendChild(script);
  window.musicScriptLoaded = true;
}

async function loadSidebar(showBackButton = true){
  const sidebar = document.createElement("aside");
  sidebar.className = "sidebar";
  sidebar.style.position = "relative"; // needed for bottom-left icon

  sidebar.innerHTML = `
    <h2>All Users</h2>
    <div id="onlineList">Loading...</div>
    ${showBackButton ? `<button onclick="goDashboard()">Back to Dashboard</button>` : ""}
    <div id="musicToggleIcon" style="
        position: absolute;
        bottom: 10px;
        left: 10px;
        cursor: pointer;
        font-size: 24px;
    ">🔊</div>
  `;

  document.body.prepend(sidebar);

  loadOnlineUsers();

  // Wait until music.js is loaded
  const waitForMusic = setInterval(() => {
    if (typeof initMusic === "function" && !window.musicStarted) {
      initMusic();
      window.musicStarted = true;

      // Attach emoji toggle
      const toggleIcon = document.getElementById("musicToggleIcon");
let isMuted = false; // track mute state

if (toggleIcon) {
  toggleIcon.addEventListener("click", () => {
    if (!window.audio) return;

    if (isMuted) {
      window.audio.play();
      toggleIcon.textContent = "🔊";
      isMuted = false;
    } else {
      window.audio.pause();
      toggleIcon.textContent = "🔇";
      isMuted = true;
    }
  });
}

      clearInterval(waitForMusic);
    }
  }, 100);

  // Socket for online users
  const socket = io();
  const nickname = localStorage.getItem('nickname');
  if (nickname) {
    socket.emit('set user', { nickname });
  }
  socket.on('online users', (onlineList) => {
    updateUserList(onlineList);
  });
}

function goDashboard(){
  window.location.href="/dashboard";
}

async function loadOnlineUsers(){
  try{
    const allUsersRes = await fetch('/users');
    const allUsers = await allUsersRes.json();
    const onlineRes = await fetch('/online-users');
    const onlineUsers = await onlineRes.json();
    updateUserList(onlineUsers.map(u => u.nickname), allUsers);
  }catch(err){
    console.error("Sidebar load failed",err);
  }
}

function updateUserList(onlineNicknames = [], allUsers = null) {
  const list = document.getElementById("onlineList");
  if(!list) return;

  const showOffline = async () => {
    if (!allUsers) {
      const res = await fetch('/users');
      allUsers = await res.json();
    }

    list.innerHTML = "";
    if(Object.keys(allUsers).length === 0){
      list.textContent = "No accounts yet";
      return;
    }

    const onlineSet = Array.isArray(onlineNicknames) 
      ? new Set(onlineNicknames) 
      : new Set(typeof onlineNicknames === 'string' ? [onlineNicknames] : []);
    
    Object.keys(allUsers).forEach(nickname => {
      const div = document.createElement("div");
      div.className = "online-user";
      const dotColor = onlineSet.has(nickname) ? "#2a9d8f" : "#808080";
      div.innerHTML = `<div class="online-dot" style="background-color: ${dotColor}"></div>${nickname}`;
      list.appendChild(div);
    });
  };

  showOffline();
}