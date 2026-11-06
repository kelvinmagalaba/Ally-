let io = null;

function setIo(socketIo) {
  io = socketIo;
}

function getIo() {
  return io;
}

function emitToUser(userId, event, data) {
  if (io) {
    io.to(`user_${userId}`).emit(event, data);
  }
}

function emitToOrder(orderId, event, data) {
  if (io) {
    io.to(`order_${orderId}`).emit(event, data);
  }
}

function broadcastOrderStatus(orderId, payload) {
  if (io) {
    io.to(`order_${orderId}`).emit("orderStatusUpdate", payload);
  }
}

function emitToRoom(room, event, data) {
  if (io) {
    io.to(room).emit(event, data);
  }
}

module.exports = {
  setIo,
  getIo,
  emitToUser,
  emitToOrder,
  broadcastOrderStatus,
  emitToRoom
};