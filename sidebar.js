async function loadSidebar(showBackButton = true){

  const sidebar = document.createElement("aside");
  sidebar.className = "sidebar";

  sidebar.innerHTML = `
    <h2>All Users</h2>
    <div id="onlineList">Loading...</div>
    ${showBackButton ? `<button onclick="goDashboard()">Back to Dashboard</button>` : ""}
  `;

  document.body.prepend(sidebar);

  loadOnlineUsers();
  
  // Listen for real-time updates via socket
  const socket = io();
  
  // Re-authenticate the current user if they're logged in
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
    // Fetch all users and online users
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

    // If no users at all, show message
    if(Object.keys(allUsers).length === 0){
      list.textContent = "No accounts yet";
      return;
    }

    // Check if it's an array or object
    const onlineSet = Array.isArray(onlineNicknames) 
      ? new Set(onlineNicknames) 
      : new Set(typeof onlineNicknames === 'string' ? [onlineNicknames] : []);
    
    // Display all users with their online status
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