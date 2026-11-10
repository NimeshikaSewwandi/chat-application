
const express = require("express");
const bcrypt = require("bcryptjs");
const db = require("../db");
const jwt = require("jsonwebtoken");
const verifyToken = require("../middleware/authMiddleware");

const router = express.Router();

// User Registration API
router.post("/register", async (req, res) => {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
        return res.status(400).json({
            message: "Please fill all fields"
        });
    }

    try {
        const hashedPassword = await bcrypt.hash(password, 10);

        const sql = `
            INSERT INTO users (username, email, password_hash)
            VALUES (?, ?, ?)
        `;

        db.query(sql, [username, email, hashedPassword], (err, result) => {
            if (err) {
                if (err.code === "ER_DUP_ENTRY") {
                    return res.status(409).json({
                        message: "Email already exists"
                    });
                }

                return res.status(500).json({
                    message: "Registration failed"
                });
            }

            res.status(201).json({
                message: "User registered successfully!",
                userId: result.insertId
            });
        });

    } catch (error) {
        res.status(500).json({
            message: "Server error"
        });
    }
});


// User Login API
router.post("/login", (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({
            message: "Please enter email and password"
        });
    }

    const sql = "SELECT * FROM users WHERE email = ?";

    db.query(sql, [email], async (err, results) => {
        if (err) {
            return res.status(500).json({
                message: "Database error"
            });
        }

        if (results.length === 0) {
            return res.status(401).json({
                message: "Invalid email or password"
            });
        }

        const user = results[0];

        try {
            const isMatch = await bcrypt.compare(
                password,
                user.password_hash
            );

            if (!isMatch) {
                return res.status(401).json({
                    message: "Invalid email or password"
                });
            }

            if (!process.env.JWT_SECRET) {
                return res.status(500).json({
                    message: "JWT secret is not configured"
                });
            }

            const token = jwt.sign(
                { id: user.id, email: user.email },
                process.env.JWT_SECRET,
                { expiresIn: "1h" }
            );

            res.json({
                message: "Login successful!",
                token: token,
                user: {
                    id: user.id,
                    username: user.username,
                    email: user.email
                }
            });

        } catch (error) {
            res.status(500).json({
                message: "Login failed"
            });
        }
    });
});


// Get All Users API
router.get("/users", verifyToken, (req, res) => {

    const sql = `
        SELECT id, username, email
        FROM users
        ORDER BY username ASC
    `;

    db.query(sql, (err, results) => {

        if (err) {
            console.log("Get users error:", err.message);

            return res.status(500).json({
                message: "Failed to load users"
            });
        }

        res.json(results);
    });
});

module.exports = router;
