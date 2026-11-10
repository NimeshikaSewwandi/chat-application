
const express = require("express");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");
require("dotenv").config();

const db = require("./db");
const authRoutes = require("./routes/authRoutes");
const verifyToken = require("./middleware/authMiddleware");

const app = express();
const server = http.createServer(app);

// CORS configuration
const allowedOrigins = [
    "http://localhost:5173",
    "http://localhost:5174"
];

app.use(cors({
    origin: allowedOrigins
}));

app.use(express.json());

// Socket.IO configuration
const io = new Server(server, {
    cors: {
        origin: allowedOrigins,
        methods: ["GET", "POST"]
    }
});

// Authentication routes
app.use("/api/auth", authRoutes);

// Backend test route
app.get("/", (req, res) => {
    res.send("Chat Application Backend is Running!");
});

// Get chat history between two users (Protected API)
app.get("/api/messages/:user1/:user2", verifyToken, (req, res) => {
    const user1 = Number(req.params.user1);
    const user2 = Number(req.params.user2);

    if (
        !Number.isInteger(user1) ||
        !Number.isInteger(user2) ||
        user1 <= 0 ||
        user2 <= 0
    ) {
        return res.status(400).json({
            message: "Invalid user IDs"
        });
    }

    if (
        Number(req.user.id) !== user1 &&
        Number(req.user.id) !== user2
    ) {
        return res.status(403).json({
            message: "You are not allowed to access this chat"
        });
    }

    const sql = `
        SELECT *
        FROM messages
        WHERE
            (sender_id = ? AND receiver_id = ?)
            OR
            (sender_id = ? AND receiver_id = ?)
        ORDER BY sent_at ASC
    `;

    db.query(
        sql,
        [user1, user2, user2, user1],
        (err, results) => {
            if (err) {
                console.log("Chat history error:", err.message);

                return res.status(500).json({
                    message: "Failed to load messages"
                });
            }

            res.json(results);
        }
    );
});

// Store connected users
const onlineUsers = new Map();

// Socket.IO JWT Authentication Middleware
io.use((socket, next) => {
    const token = socket.handshake.auth?.token;

    if (!token) {
        return next(new Error("Authentication error: Token missing"));
    }

    try {
        const decoded = jwt.verify(
            token,
            process.env.JWT_SECRET
        );

        socket.user = decoded;
        next();

    } catch (error) {
        next(new Error("Authentication error: Invalid token"));
    }
});

// Socket.IO Connection
io.on("connection", (socket) => {

    const userId = Number(socket.user.id);

    onlineUsers.set(userId, socket.id);

    console.log("Authenticated user connected:", userId);

    // Receive and save message securely
    socket.on("send_message", (data) => {

        const sender_id = Number(socket.user.id);
        const receiver_id = Number(data?.receiver_id);
        const message_text = data?.message_text;

        if (
            !Number.isInteger(receiver_id) ||
            receiver_id <= 0 ||
            receiver_id === sender_id
        ) {
            return;
        }

        if (
            typeof message_text !== "string" ||
            !message_text.trim() ||
            message_text.trim().length > 2000
        ) {
            return;
        }

        const cleanMessage = message_text.trim();
        const receiverSocket = onlineUsers.get(receiver_id);
        const messageStatus = receiverSocket ? "delivered" : "sent";

        const sql = `
            INSERT INTO messages
            (sender_id, receiver_id, message_text, status)
            VALUES (?, ?, ?, ?)
        `;

        db.query(
            sql,
            [sender_id, receiver_id, cleanMessage, messageStatus],
            (err, result) => {

                if (err) {
                    console.log("Message save error:", err.message);
                    return;
                }

                const newMessage = {
                    id: result.insertId,
                    sender_id,
                    receiver_id,
                    message_text: cleanMessage,
                    sent_at: new Date(),
                    status: messageStatus
                };

                if (receiverSocket) {
                    io.to(receiverSocket).emit(
                        "receive_message",
                        newMessage
                    );
                }

                socket.emit("receive_message", newMessage);

                console.log("Message saved:", newMessage);
            }
        );
    });

    // Mark received messages as seen
    socket.on("mark_messages_seen", (data) => {

        console.log("Mark seen event received:", data);

        const receiver_id = Number(socket.user.id);
        const sender_id = Number(data?.other_user_id);

        if (
            !Number.isInteger(sender_id) ||
            sender_id <= 0 ||
            sender_id === receiver_id
        ) {
            return;
        }

        const sql = `
            UPDATE messages
            SET status = 'seen'
            WHERE sender_id = ?
            AND receiver_id = ?
            AND status != 'seen'
        `;

        db.query(sql, [sender_id, receiver_id], (err, result) => {

            if (err) {
                console.log("Seen status error:", err.message);
                return;
            }

            if (result.affectedRows > 0) {

                const senderSocket = onlineUsers.get(sender_id);

                if (senderSocket) {
                    io.to(senderSocket).emit("messages_seen", {
                        other_user_id: receiver_id
                    });
                }

                console.log("Messages marked as seen");
            }
        });
    });

    // Disconnect user
    socket.on("disconnect", () => {

        for (const [userId, socketId] of onlineUsers.entries()) {
            if (socketId === socket.id) {
                onlineUsers.delete(userId);
            }
        }

        console.log("User disconnected:", socket.id);
    });
});

// Dynamic PORT for local and cloud deployment
const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
