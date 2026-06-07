const socket = io();

const serverStatus = document.getElementById('server-status');

socket.on('connect', () => {
  serverStatus.textContent = 'Server online';
  serverStatus.className = 'badge badge--online';
});

socket.on('disconnect', () => {
  serverStatus.textContent = 'Server offline';
  serverStatus.className = 'badge badge--offline';
});

socket.on('server:ready', () => {
  console.log('Server ready');
});
