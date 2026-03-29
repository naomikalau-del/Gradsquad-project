// sidebar.js

const API_BASE_URL = 'https://gradsquad-project.onrender.com';

async function loadSidebar(showBackButton = true){
  const sidebar = document.createElement("aside");
  sidebar.className = "sidebar";
  sidebar.style.position = "relative"; // needed for bottom-left icon

  sidebar.innerHTML = `
    <h2>All Users</h2>
    <div id="onlineList">Loading...</div>
    ${showBackButton ? `<button onclick="goDashboard()">Back to Dashboard</button>` : ""}
  `;

  document.body.prepend(sidebar);

  loadOnlineUsers();

  // Socket for online users
  const socket = io(API_BASE_URL);
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
    const allUsersRes = await fetch(`${API_BASE_URL}/users`);
    const allUsers = await allUsersRes.json();
    const onlineRes = await fetch(`${API_BASE_URL}/online-users`);
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
      const res = await fetch(`${API_BASE_URL}/users`);
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