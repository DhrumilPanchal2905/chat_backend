"use client";

import { useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { BeatLoader } from "react-spinners";
import { IoIosAttach } from "react-icons/io";

interface Message {
  _id?: string;
  content: string;
  sender: string;
  timestamp: string;
  role: string;
  fileUrl?: string;
}

export default function ChatApp() {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [username, setUsername] = useState<string>("");
  const [role, setRole] = useState<string>("user");
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  // For local "pending" upload only
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  // Typing indicator
  const [typingUsers, setTypingUsers] = useState<string[]>([]);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  let typingTimeout: NodeJS.Timeout;

  // ===========================
  //   SET USERNAME & ROLE
  // ===========================
  useEffect(() => {
    const savedUsername = localStorage.getItem("username");
    const savedRole = localStorage.getItem("role");

    if (savedUsername && savedRole) {
      setUsername(savedUsername);
      setRole(savedRole);
      setIsLoggedIn(true);
    } else {
      alert("Welcome to DhrumiL Chat Bot!");
      const inputRole = prompt("Are you admin? (yes/no)")?.toLowerCase();
      if (inputRole === "yes") {
        const adminPassword = prompt("Enter admin password:");
        if (adminPassword === "DhrumiL") {
          setRole("admin");
          setUsername("Admin");
          localStorage.setItem("username", "Admin");
          localStorage.setItem("role", "admin");
          setIsLoggedIn(true);
        } else {
          alert("Incorrect admin password!");
        }
      } else {
        alert("You can chat as a user.");
        setUsername("User");
        setRole("user");
        localStorage.setItem("username", "User");
        localStorage.setItem("role", "user");
        setIsLoggedIn(true);
      }
    }
  }, []);

  // ===========================
  //   SOCKET SETUP & EVENTS
  // ===========================
  useEffect(() => {
    if (isLoggedIn) {
      const socketInstance = io("http://localhost:3001", {
        query: { username, role },
      });

      socketInstance.on("connect", () => {
        console.log("Connected to server");
        socketInstance.emit("load-messages");
      });

      // Load all previous messages
      socketInstance.on("previous-messages", (previousMessages: Message[]) => {
        setMessages(previousMessages);
      });

      // When the server broadcasts a new message, add it
      socketInstance.on("new-message", (message: Message) => {
        setMessages((prev) => [...prev, message]);
      });

      // Typing indicator events
      socketInstance.on("user-typing", (user: string) => {
        if (user !== username && !typingUsers.includes(user)) {
          setTypingUsers((prev) => [...prev, user]);
        }
      });
      socketInstance.on("user-stop-typing", (user: string) => {
        setTypingUsers((prev) => prev.filter((u) => u !== user));
      });

      setSocket(socketInstance);

      return () => {
        socketInstance.disconnect();
      };
    }
  }, [isLoggedIn, username, role, typingUsers]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, typingUsers]);

  // ===========================
  //   TYPING EVENTS
  // ===========================
  const handleTyping = () => {
    socket?.emit("typing", username);
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
      socket?.emit("stop-typing", username);
    }, 1000);
  };

  // ===========================
  //   SEND MESSAGE
  // ===========================
  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!socket) return;

    // If no text and no file, do nothing
    if (newMessage.trim() === "" && !file) return;

    // If there's a file, upload it first, then emit final message
    if (file) {
      setIsUploading(true);
      setUploadProgress(0);

      const formData = new FormData();
      formData.append("file", file);
      formData.append("sender", username);
      formData.append("role", role);

      const xhr = new XMLHttpRequest();
      xhr.upload.addEventListener("progress", (event) => {
        if (event.lengthComputable) {
          const progress = Math.round((event.loaded / event.total) * 100);
          setUploadProgress(progress);
        }
      });

      xhr.onreadystatechange = () => {
        if (xhr.readyState === XMLHttpRequest.DONE) {
          if (xhr.status === 200) {
            const data = JSON.parse(xhr.responseText);

            // Single final message with text + file
            const finalMessage: Message = {
              content: newMessage.trim(),
              sender: username,
              role,
              timestamp: new Date().toISOString(),
              fileUrl: data.fileUrl,
            };

            // Emit final message (server broadcasts "new-message")
            socket.emit("send-message", finalMessage);
          } else {
            alert("File upload failed!");
          }
          setIsUploading(false);
          setUploadProgress(0);
          setFile(null);
        }
      };

      xhr.open("POST", "http://localhost:3001/upload");
      xhr.send(formData);
    } else {
      // Text-only message
      const messageData: Message = {
        content: newMessage.trim(),
        sender: username,
        role,
        timestamp: new Date().toISOString(),
      };
      socket.emit("send-message", messageData);
    }

    // Clear input
    setNewMessage("");
  };

  // ===========================
  //   RENDER
  // ===========================
  if (!isLoggedIn) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        Loading...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 p-4 flex items-center justify-center">
      <Card className="w-full max-w-2xl">
        <CardHeader>
          <CardTitle>Chat ({role === "admin" ? "Admin" : "User"})</CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[60vh] w-full rounded-md border p-4">
            {/* Existing messages */}
            {messages.map((msg, index) => (
              <div
                key={msg._id || index}
                className={`mb-4 flex ${
                  msg.sender === username ? "justify-end" : "justify-start"
                }`}
              >
                <div
                  className={`max-w-[70%] rounded-lg px-4 py-2 ${
                    msg.sender === username
                      ? "bg-yellow-400 text-black"
                      : "bg-gray-200"
                  }`}
                >
                  <div className="text-sm font-semibold mb-1">{msg.sender}</div>
                  {msg.fileUrl ? (
                    <>
                      {msg.content && <div className="mb-1">{msg.content}</div>}
                      <a
                        href={msg.fileUrl}
                        target="_blank"
                        className="text-blue-500"
                      >
                        View File
                      </a>
                    </>
                  ) : (
                    <div className="w-full overflow-auto">{msg.content}</div>
                  )}
                  <div className="text-xs opacity-70 mt-1">
                    {new Date(msg.timestamp).toLocaleTimeString()}
                  </div>
                </div>
              </div>
            ))}

            {/* Typing indicator for other users */}
            {typingUsers.map((user, index) => (
              <div key={index} className="mb-4 flex justify-start">
                <div className="max-w-[70%] rounded-lg px-4 py-2 bg-gray-200 flex items-center">
                  <BeatLoader color="#000" size={8} />
                  <span className="ml-2 text-black">{user} is typing...</span>
                </div>
              </div>
            ))}

            {/* Local progress bubble (not broadcast to server) */}
            {isUploading && (
              <div className="mb-4 flex justify-end">
                <div className="max-w-[70%] rounded-lg px-4 py-2 bg-yellow-300 text-black">
                  Uploading... {uploadProgress}%
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </ScrollArea>
        </CardContent>
        <CardFooter>
          <form
            onSubmit={sendMessage}
            className="flex w-full items-center space-x-2"
          >
            {/* Single text input; file icon appended inside label */}
            <div className="relative flex-grow">
              <Input
                value={newMessage}
                onChange={(e) => {
                  setNewMessage(e.target.value);
                  handleTyping();
                }}
                placeholder="Type your message..."
                disabled={isUploading}
              />
              <label className="absolute right-2 top-1/2 transform -translate-y-1/2 cursor-pointer">
                <span className="text-xl"><IoIosAttach /></span>
                <input
                  type="file"
                  className="hidden"
                  onChange={(e) => {
                    const selected = e.target.files?.[0] || null;
                    setFile(selected);
                    // Optionally auto-fill text with filename if empty
                    if (selected && newMessage.trim() === "") {
                      setNewMessage(selected.name);
                    }
                  }}
                  disabled={isUploading}
                />
              </label>
            </div>

            <Button
              type="submit"
              disabled={isUploading || (newMessage.trim() === "" && !file)}
            >
              {isUploading ? "Uploading..." : "Send"}
            </Button>
          </form>
        </CardFooter>
      </Card>
    </div>
  );
}
