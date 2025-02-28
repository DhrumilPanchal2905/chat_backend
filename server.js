const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const { v4: uuidv4 } = require("uuid");
const mongoose = require("mongoose");
const multer = require("multer");
const { google } = require("googleapis");

// ✅ MongoDB Connection
const connectToDatabase = async () => {
  try {
    await mongoose.connect(
      process.env.MONGODB_URI || "mongodb://localhost:27017/chat-app",
      {
        dbName: "NewChatAppDB",
      }
    );
    console.log("✅ MongoDB connected successfully");
  } catch (error) {
    console.error("❌ MongoDB connection failed:", error);
  }
};
connectToDatabase();

// ✅ Define Message Schema
const messageSchema = new mongoose.Schema({
  sender: String,
  content: String,
  fileUrl: String,
  fileName: String,
  fileType: String,
  timestamp: { type: Date, default: Date.now },
});
const Message = mongoose.model("ChatMessages", messageSchema);

// ✅ Express & Socket.io Setup
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type"],
    credentials: true,
  },
});

app.use(cors());
app.use(express.json());

// ✅ Google Drive API Setup
const KEY_FILE_PATH = ".src/GConsole_json_key/private.json"; // 🔹 Ensure this file exists in your project
const SCOPES = ["https://www.googleapis.com/auth/drive.file"];

const auth = new google.auth.GoogleAuth({
  keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS || "./service-account.json",
  scopes: SCOPES,
});

const drive = google.drive({ version: "v3", auth });

// ✅ Multer Temporary Storage
const upload = multer({ dest: "temp_uploads/" });

// ✅ Function to Upload to Google Drive
const uploadToDrive = async (filePath, fileName, mimeType) => {
  try {
    const response = await drive.files.create({
      requestBody: {
        name: fileName,
        mimeType: mimeType,
      },
      media: {
        body: fs.createReadStream(filePath),
      },
    });

    // 🔹 Make file publicly accessible
    await drive.permissions.create({
      fileId: response.data.id,
      requestBody: {
        role: "reader",
        type: "anyone",
      },
    });

    const fileUrl = `https://drive.google.com/uc?id=${response.data.id}`;
    return fileUrl;
  } catch (error) {
    console.error("❌ Error uploading to Google Drive:", error);
    return null;
  }
};

// ✅ File Upload API (Saves to Google Drive & MongoDB)
app.post("/upload", upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });

  const fileUrl = await uploadToDrive(
    req.file.path,
    req.file.originalname,
    req.file.mimetype
  );
  fs.unlinkSync(req.file.path); // 🔹 Delete local temp file after upload

  if (fileUrl) {
    const newFileMessage = new Message({
      sender: req.body.sender || "Anonymous",
      content: req.body.content || "",
      fileUrl: fileUrl,
      fileName: req.file.originalname,
      fileType: req.file.mimetype,
    });

    try {
      const savedFile = await newFileMessage.save();
      io.emit("new-message", savedFile); // 🔹 Broadcast to clients
      res.json({
        success: true,
        fileUrl: savedFile.fileUrl,
        message: savedFile,
      });
    } catch (error) {
      console.error("❌ Error saving file message:", error);
      res.status(500).json({ error: "File saving failed" });
    }
  } else {
    res.status(500).json({ error: "Google Drive upload failed" });
  }
});

// ✅ WebSocket Connections (Chat Messages)
io.on("connection", async (socket) => {
  console.log("🟢 User connected:", socket.id);

  try {
    const previousMessages = await Message.find().sort({ timestamp: 1 });
    socket.emit("previous-messages", previousMessages);
  } catch (error) {
    console.error("❌ Error fetching messages from DB:", error);
  }

  socket.on("send-message", async (msg) => {
    try {
      const newMessage = new Message({
        sender: msg.sender,
        content: msg.content,
        fileUrl: msg.fileUrl || "",
        fileName: msg.fileName || "",
        fileType: msg.fileType || "",
      });
      await newMessage.save();
      io.emit("new-message", newMessage);
    } catch (error) {
      console.error("❌ Error saving message:", error);
    }
  });

  socket.on("disconnect", () => {
    console.log("🔴 User disconnected:", socket.id);
  });
});

// ✅ Start Server
const PORT = 3001;
server.listen(PORT, () => {
  console.log(`🚀 Server is running on http://localhost:${PORT}`);
});
