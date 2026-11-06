import { useEffect, useState } from "react";
import socket from "../socket";

function Chat({ user }) {
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState([]);

  useEffect(() => {
    if (user?.id) socket.emit("join", user.id);

    const onReceive = (data) => {
      setMessages((prev) => [...prev, data]);
    };
    socket.on("receiveMessage", onReceive);

    return () => {
      socket.off("receiveMessage", onReceive);
    };
  }, [user?.id]);

  const sendMessage = () => {
    socket.emit("sendMessage", {
      sender_id: user.id,
      receiver_id: 2, // test user
      message
    });

    setMessage("");
  };

  return (
    <div>
      <h2>Chat</h2>

      <div>
        {messages.map((msg, i) => (
          <p key={i}>
            {msg.sender_id}: {msg.message}
          </p>
        ))}
      </div>

      <input
        value={message}
        onChange={(e) => setMessage(e.target.value)}
      />

      <button onClick={sendMessage}>Send</button>
    </div>
  );
}

export default Chat;