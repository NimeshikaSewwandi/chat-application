
import { useState, useEffect, useRef } from "react";
import "./App.css";
import socket from "./socket";
import Auth from "./Auth";

// Format message time
function formatTime(date) {
  if (!date) return "";

  const parsedDate = new Date(date);

  if (Number.isNaN(parsedDate.getTime())) {
    return "";
  }

  return parsedDate.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function App() {
  // Restore logged-in user
  const [currentUser, setCurrentUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("chatUser")) || null;
    } catch {
      return null;
    }
  });

  const [token, setToken] = useState(
    () => localStorage.getItem("chatToken") || ""
  );

  const currentUserId = currentUser
    ? Number(currentUser.id)
    : null;

  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState([]);
  const [users, setUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [connectionStatus, setConnectionStatus] =
    useState("Connecting...");
  const [searchTerm, setSearchTerm] = useState("");

  const selectedUserRef = useRef(null);
  const messagesEndRef = useRef(null);

  // Login success
  function handleLogin(user, jwtToken) {
    localStorage.setItem("chatUser", JSON.stringify(user));
    localStorage.setItem("chatToken", jwtToken);

    setCurrentUser(user);
    setToken(jwtToken);
  }

  // Logout
  function handleLogout() {
    socket.disconnect();

    localStorage.removeItem("chatUser");
    localStorage.removeItem("chatToken");

    setCurrentUser(null);
    setToken("");
    setUsers([]);
    setMessages([]);
    setSelectedUser(null);
    setConnectionStatus("Disconnected");
    setSearchTerm("");
  }

  // Load contacts
  useEffect(() => {
    if (!currentUserId || !token) {
      setUsers([]);
      setSelectedUser(null);
      return;
    }

    async function loadUsers() {
      try {
        const response = await fetch(
          "http://localhost:5000/api/auth/users",
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        if (!response.ok) {
          throw new Error("Failed to load users");
        }

        const data = await response.json();

        const otherUsers = data.filter(
          (user) => Number(user.id) !== currentUserId
        );

        setUsers(otherUsers);
        setSelectedUser(otherUsers[0] || null);

      } catch (error) {
        console.log("Users loading error:", error);
      }
    }

    loadUsers();
  }, [currentUserId, token]);

  // Keep selected contact updated
  useEffect(() => {
    selectedUserRef.current = selectedUser;
  }, [selectedUser]);

  // Load chat history
  useEffect(() => {
    if (!currentUserId || !selectedUser || !token) {
      setMessages([]);
      return;
    }

    let isActive = true;

    async function loadMessages() {
      try {
        const response = await fetch(
          `http://localhost:5000/api/messages/${currentUserId}/${selectedUser.id}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        if (!response.ok) {
          throw new Error("Failed to load messages");
        }

        const data = await response.json();

        if (!isActive) return;

        setMessages(
          data.map((msg) => ({
            id: msg.id,
            text: msg.message_text,
            sender:
              Number(msg.sender_id) === currentUserId
                ? "You"
                : "Other",
            senderId: Number(msg.sender_id),
            receiverId: Number(msg.receiver_id),
            sentAt: msg.sent_at,
            status: msg.status || "sent",
          }))
        );

        // Mark received messages as seen
        if (socket.connected) {
          socket.emit("mark_messages_seen", {
            other_user_id: Number(selectedUser.id),
          });
        }

      } catch (error) {
        console.log("Chat history error:", error);
      }
    }

    loadMessages();

    return () => {
      isActive = false;
    };
  }, [currentUserId, selectedUser, token]);

  // Automatically scroll to latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({
      behavior: "smooth",
    });
  }, [messages]);

  // Socket.IO connection with JWT authentication
  useEffect(() => {
    if (!currentUserId || !token) {
      return;
    }

    socket.auth = {
      token: token,
    };

    function handleConnect() {
      console.log("Connected to server:", socket.id);
      setConnectionStatus("Connected");

      // Mark messages as seen when connection is established
      const activeUser = selectedUserRef.current;

      if (activeUser) {
        socket.emit("mark_messages_seen", {
          other_user_id: Number(activeUser.id),
        });
      }
    }

    function handleDisconnect() {
      setConnectionStatus("Disconnected");
    }

    function handleConnectError(error) {
      console.log("Socket connection error:", error.message);
      setConnectionStatus("Connection error");
    }

    // Receive messages
    function handleReceiveMessage(data) {
      const activeUser = selectedUserRef.current;

      if (!activeUser) return;

      const senderId = Number(data.sender_id);
      const receiverId = Number(data.receiver_id);

      const belongsToCurrentChat =
        (senderId === currentUserId &&
          receiverId === Number(activeUser.id)) ||
        (senderId === Number(activeUser.id) &&
          receiverId === currentUserId);

      if (!belongsToCurrentChat) return;

      setMessages((previousMessages) => [
        ...previousMessages,
        {
          id: data.id,
          text: data.message_text,
          sender:
            senderId === currentUserId ? "You" : "Other",
          senderId: senderId,
          receiverId: receiverId,
          sentAt: data.sent_at || new Date().toISOString(),
          status: data.status || "sent",
        },
      ]);

      // If another user sends a message, mark it as seen
      if (senderId !== currentUserId && socket.connected) {
        socket.emit("mark_messages_seen", {
          other_user_id: senderId,
        });
      }
    }

    // Update sender's messages when receiver reads them
    function handleMessagesSeen(data) {
      const seenByUserId = Number(data.other_user_id);

      setMessages((previousMessages) =>
        previousMessages.map((msg) => {
          if (
            msg.sender === "You" &&
            Number(msg.receiverId) === seenByUserId
          ) {
            return {
              ...msg,
              status: "seen",
            };
          }

          return msg;
        })
      );
    }

    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on("connect_error", handleConnectError);
    socket.on("receive_message", handleReceiveMessage);
    socket.on("messages_seen", handleMessagesSeen);

    socket.connect();

    return () => {
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off("connect_error", handleConnectError);
      socket.off("receive_message", handleReceiveMessage);
      socket.off("messages_seen", handleMessagesSeen);

      socket.disconnect();
    };
  }, [currentUserId, token]);

  // Send message
  function sendMessage() {
    if (!message.trim() || !selectedUser) return;

    if (!socket.connected) {
      alert("Server is not connected!");
      return;
    }

    const newMessage = {
      receiver_id: Number(selectedUser.id),
      message_text: message.trim(),
    };

    socket.emit("send_message", newMessage);
    setMessage("");
  }

  // Search contacts
  const filteredUsers = users.filter((user) =>
    user.username
      .toLowerCase()
      .includes(searchTerm.toLowerCase().trim())
  );

  // Show Login / Register page
  if (!currentUser) {
    return <Auth onLogin={handleLogin} />;
  }

  // Chat application
  return (
    <div className="chat-app">

      {/* Sidebar */}
      <div className="sidebar">

        <h2>Chat App 💬</h2>

        <p>Welcome, {currentUser.username}!</p>

        <button
          className="logout-button"
          onClick={handleLogout}
        >
          Logout
        </button>

        <input
          className="search"
          type="text"
          placeholder="Search contacts..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />

        <h3>Contacts</h3>

        <div className="contacts-list">
          {filteredUsers.map((user) => (
            <div
              key={user.id}
              className={`contact ${
                Number(selectedUser?.id) === Number(user.id)
                  ? "active"
                  : ""
              }`}
              onClick={() => setSelectedUser(user)}
            >
              <span className="avatar">
                {user.username.charAt(0).toUpperCase()}
              </span>

              <span>{user.username}</span>
            </div>
          ))}
        </div>

        {filteredUsers.length === 0 && (
          <p className="empty-contacts">
            {users.length === 0
              ? "No other users found."
              : "No matching contacts found."}
          </p>
        )}

      </div>

      {/* Chat Area */}
      <div className="chat-area">

        {/* Chat Header */}
        <div className="chat-header">

          {selectedUser ? (
            <div className="chat-user-info">

              <span className="avatar chat-header-avatar">
                {selectedUser.username.charAt(0).toUpperCase()}
              </span>

              <div>
                <h3>{selectedUser.username}</h3>

                <p className="connection-status">
                  {connectionStatus}
                </p>
              </div>

            </div>
          ) : (
            <h3>Select a contact</h3>
          )}

        </div>

        {/* Messages */}
        <div className="messages">

          {selectedUser && messages.length === 0 && (
            <div className="welcome-message">
              No messages yet. Start chatting with{" "}
              {selectedUser.username}!
            </div>
          )}

          {messages.map((msg, index) => (
            <div
              className={`message ${
                msg.sender === "You" ? "sent" : "received"
              }`}
              key={msg.id || index}
            >
              <span className="message-text">
                {msg.text}
              </span>

              <span className="message-time">
                {formatTime(msg.sentAt)}
              </span>

              {msg.sender === "You" && msg.status && (
                <span className="message-status">
                  {msg.status === "seen"
                    ? "✓✓ Seen"
                    : msg.status === "delivered"
                    ? "✓✓ Delivered"
                    : "✓ Sent"}
                </span>
              )}
            </div>
          ))}

          <div ref={messagesEndRef} />

        </div>

        {/* Message Input */}
        <div className="message-input">

          <input
            type="text"
            placeholder={
              selectedUser
                ? "Type a message..."
                : "Select a contact first"
            }
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") sendMessage();
            }}
            disabled={!selectedUser}
          />

          <button
            onClick={sendMessage}
            disabled={!selectedUser || !message.trim()}
          >
            Send
          </button>

        </div>

      </div>
    </div>
  );
}

export default App;
