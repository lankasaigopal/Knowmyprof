require("dotenv").config();
console.log("Google Client ID:", process.env.GOOGLE_CLIENT_ID ? "Loaded" : "Not Loaded");
console.log("Google Client Secret:", process.env.GOOGLE_CLIENT_SECRET ? "Loaded" : "Not Loaded");

const express = require("express");
const cors = require("cors");
const axios = require("axios");
const path = require("path");
const { OAuth2Client } = require("google-auth-library");
const otpStore = new Map(); // Temporary in-memory store for OTPs

const sgMail = require('@sendgrid/mail');
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

const mongoose = require("mongoose");

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
})
.then(() => console.log("✅ MongoDB Atlas connected successfully"))
.catch((err) => console.error("❌ MongoDB connection error:", err));

const User = require("./models/user");
const Professor = require("./models/professor");

const app = express();
app.use(cors({ origin: ["https://knowmyprof.netlify.app"], credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true })); 


// Serve static files (including mainpage.html)
app.use(express.static(path.join(__dirname)));

const GOOGLE_REDIRECT_URI = "https://knowmyprof.onrender.com/auth/google/callback";

const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);

const bcrypt = require("bcryptjs");

// Add this route explicitly above other routes
app.get("/signup", (req, res) => {
    res.sendFile(path.join(__dirname, "signup.html"));
  });  

app.get("/forgot-password", (req, res) => {
    res.sendFile(path.join(__dirname, "forgot-password.html"));
  });
  

// Manual Signup Route
app.post("/signup", async (req, res) => {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
        return res.status(400).json({ message: "All fields are required" });
    }

    try {
        const existingUser = await User.findOne({ email });

        if (existingUser) {
            return res.redirect("/error.html?type=exists");
        }

        // Hash password securely
        const hashedPassword = await bcrypt.hash(password, 10);

        const newUser = new User({
            name: username,
            email,
            password: hashedPassword,
            provider: "manual"
        });

        await newUser.save();

        console.log("✅ New user created manually:", email);
        res.redirect("/mainpage.html");

    } catch (error) {
        console.error("Signup Error:", error);
        res.status(500).json({ message: "Signup failed" });
    }
});

// 🔹 Step 1: Redirect User to Google OAuth Login
app.get("/auth/google", (req, res) => {
    const mode = req.query.mode || "login"; // login or signup

    const authUrl = `https://accounts.google.com/o/oauth2/auth?client_id=${GOOGLE_CLIENT_ID}&redirect_uri=${GOOGLE_REDIRECT_URI}&response_type=code&scope=email%20profile%20openid&access_type=offline&prompt=consent&state=${mode}`;
   
    res.redirect(authUrl);
});


// 🔹 Step 2: Handle Google OAuth Callback
app.get("/auth/google/callback", async (req, res) => {
    console.log("Inside Google Callback Route");

    const code = req.query.code;
    const mode = req.query.state || "login"; // 👈 get the mode (login or signup)

    if (!code) {
        return res.status(400).json({ success: false, message: "No code provided" });
    }

    try {
        const response = await axios.post("https://oauth2.googleapis.com/token", null, {
            params: {
                code,
                client_id: GOOGLE_CLIENT_ID,
                client_secret: GOOGLE_CLIENT_SECRET,
                redirect_uri: GOOGLE_REDIRECT_URI,
                grant_type: "authorization_code"
            }
        });

        const tokens = response.data;
        const ticket = await googleClient.verifyIdToken({
            idToken: tokens.id_token,
            audience: GOOGLE_CLIENT_ID
        });

        const payload = ticket.getPayload();
        const email = payload.email;

        const existingUser = await User.findOne({ email });

        if (mode === "login") {
            if (!existingUser) {
                return res.redirect("/error.html");


            }
        }

        if (mode === "signup") {
            if (existingUser) {
                return res.redirect("/error.html?type=exists");

            }

            const newUser = new User({
                name: payload.name,
                email: payload.email,
                picture: payload.picture,
                provider: "google"
            });

            await newUser.save();
            console.log("✅ New user created:", payload.email);
        }

        res.redirect("/mainpage.html");

    } catch (error) {
        console.error("Google Auth Error:", error);
        res.status(500).json({ success: false, message: "Google authentication failed", error: error.message });
    }
});

// 🔹 Step 3: Verify Google Token (Existing Code)
app.post("/auth/google", async (req, res) => {
    const { token } = req.body;

    try {
        const ticket = await googleClient.verifyIdToken({
            idToken: token,
            audience: GOOGLE_CLIENT_ID
        });

        const payload = ticket.getPayload();
        console.log("User Info: ", payload);

        // Store user data in database (Example)
        const user = {
            name: payload.name,
            email: payload.email,
            picture: payload.picture
        };

        res.json({ success: true, user });
    } catch (error) {
        console.error("Error verifying token:", error);
        res.status(400).json({ success: false, message: "Invalid token" });
    }
});

// Manual Login Route (using email + password)
app.post("/login", async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ message: "Both fields are required" });
    }

    try {
        const user = await User.findOne({ email });

        if (!user) {
            return res.status(401).json({ message: "User not found" });
        }        

        // If the account was created using Google
        if (user.provider === "google") {
            console.log("🚫 Attempted manual login with Google account:", email);  // <-- ADD THIS
            return res.status(403).json({
                message: "This email is registered via Google. Please log in using the Google button."
            });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).json({ message: "Invalid password" });
        }        

        console.log("✅ Manual user logged in:", user.email);
        // ✅ Send redirect manually since this is an AJAX request
        return res.status(200).json({ redirect: "/mainpage.html" });

    } catch (error) {
        console.error("Login Error:", error);
        res.status(500).json({ message: "Login failed" });
    }
});


app.post("/forgot-password", async (req, res) => {
    const { email } = req.body;
    const user = await User.findOne({ email });

    if (!user) return res.redirect("/error.html?type=notfound");

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes

    otpStore.set(email, { otp, expiresAt });

    const msg = {
        to: email,
        from: process.env.SENDGRID_FROM,
        subject: "Your OTP for password reset",
        text: `Your OTP is: ${otp}. It expires in 5 minutes.`
    };

    try {
        await sgMail.send(msg);
        console.log("✅ OTP sent to", email);
        res.sendFile(path.join(__dirname, "verify-otp.html"));
    } catch (err) {
        console.error("❌ Error sending OTP:", err);
        res.status(500).send("Failed to send OTP");
    }
});

app.post("/verify-otp", (req, res) => {
    const { email, otp } = req.body;
    const stored = otpStore.get(email);

    if (!stored || stored.otp !== otp || Date.now() > stored.expiresAt) {
        return res.redirect("/error.html?type=invalidotp");
    }

    // OTP is valid
    console.log("✅ OTP verified for", email);
    res.redirect(`/reset-password.html?email=${encodeURIComponent(email)}`);
});

app.post("/reset-password", async (req, res) => {
    const { email, newPassword } = req.body;

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    const result = await User.updateOne(
        { email, provider: "manual" },
        { $set: { password: hashedPassword } }
    );

    if (result.modifiedCount === 0) {
        return res.redirect("/error.html?type=updatefail");
    }

    console.log("✅ Password reset for", email);
    otpStore.delete(email); // clean up OTP
    res.redirect("/index.html"); // login page
});

app.get("/api/ratings", async (req, res) => {
    try {
        const data = await Professor.find({}, "prof_id name average_rating"); // ✅ Include prof_id
        res.json(data);
    } catch (err) {
        console.error("Error fetching ratings:", err);
        res.status(500).json({ message: "Failed to fetch ratings" });
    }
});

// Start the Server
app.listen(3000, () => console.log("Server running on port 3000"));