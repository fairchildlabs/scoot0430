import { useState, useEffect, useRef, FormEvent } from "react";
import { useAuth } from "@/hooks/use-auth";
import { 
  Card, 
  CardContent,
  CardFooter 
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { 
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { ImagePlus, Send, X, AlertCircle, FileImage, FileVideo } from "lucide-react";
import { MessageList } from "./MessageList";

interface Message {
  id: number;
  userId: number;
  username: string;
  content: string | null;
  createdAt: string;
  hasMedia: boolean;
  isDeleted: boolean;
  deletedBy?: number;
  deletedAt?: string;
  media?: {
    id: number;
    mediaType: string;
    mediaPath: string;
    thumbnailPath: string | null;
  };
  moderatorName?: string;
  bumps?: number;
  bumpedByCurrentUser?: boolean;
}

export function Chat() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [messages, setMessages] = useState<Message[]>([]);
  const [messageInput, setMessageInput] = useState("");
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [mediaUploadOpen, setMediaUploadOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  
  const socketRef = useRef<WebSocket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Fetch initial messages
  const fetchMessages = async () => {
    try {
      const response = await fetch("/api/chat/messages");
      if (!response.ok) {
        throw new Error("Failed to fetch messages");
      }
      
      const data = await response.json();
      setMessages(data);
      setIsLoading(false);
    } catch (error) {
      console.error("Error fetching messages:", error);
      toast({
        title: "Error",
        description: "Failed to load messages. Please try again.",
        variant: "destructive"
      });
      setIsLoading(false);
    }
  };
  
  // Handle incoming socket messages
  const handleSocketMessage = (event: MessageEvent) => {
    try {
      const data = JSON.parse(event.data);
      console.log("WebSocket received:", data.type);
      
      if (data.type === "message") {
        // New message received
        console.log("New message received:", data.message);
        setMessages(prevMessages => [...prevMessages, data.message]);
        
        // Scroll to bottom
        setTimeout(() => {
          messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
        }, 100);
      } 
      else if (data.type === "messages") {
        // Initial messages load
        console.log(`Received ${data.messages.length} messages from server`);
        setMessages(data.messages);
        setIsLoading(false);
        
        // Scroll to bottom
        setTimeout(() => {
          messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
        }, 100);
      } 
      else if (data.type === "auth_success") {
        // Authentication successful
        console.log("WebSocket authentication successful:", data.user);
        setIsConnected(true);
        setErrorMessage(null);
      } 
      else if (data.type === "moderation") {
        // Message moderation (delete/restore) - only admins receive this
        console.log(`Moderation action received: ${data.action} for message ${data.messageId}`);
        
        if (data.action === "delete") {
          // Update the message as deleted
          setMessages(prevMessages => 
            prevMessages.map(msg => 
              msg.id === data.messageId 
                ? { ...msg, isDeleted: true, deletedBy: data.moderatorId, moderatorName: data.moderatorName, deletedAt: data.timestamp } 
                : msg
            )
          );
        } else if (data.action === "restore") {
          // Update the message as restored
          setMessages(prevMessages => 
            prevMessages.map(msg => 
              msg.id === data.messageId 
                ? { ...msg, isDeleted: false, deletedBy: undefined, moderatorName: undefined, deletedAt: undefined } 
                : msg
            )
          );
        }
      }
      else if (data.type === "remove_message") {
        // For regular users, completely remove the deleted message from the UI
        console.log(`Remove message event received for message ${data.messageId}`);
        
        // Remove the message from the list
        setMessages(prevMessages => 
          prevMessages.filter(msg => msg.id !== data.messageId)
        );
      }
      else if (data.type === "bump_update") {
        // Update bump count for a message
        console.log(`Bump update received for message ${data.messageId}: ${data.bumps} bumps`);
        
        setMessages(prevMessages => 
          prevMessages.map(msg => 
            msg.id === data.messageId 
              ? { ...msg, bumps: data.bumps } 
              : msg
          )
        );
      } 
      else if (data.type === "error") {
        // Error from server
        console.error("WebSocket error received:", data.error);
        toast({
          title: "Chat Error",
          description: data.error,
          variant: "destructive"
        });
        
        // If authentication error, try to re-authenticate
        if (data.error.includes("Not authenticated") || data.error.includes("Authentication failed")) {
          const ws = socketRef.current;
          if (ws && ws.readyState === WebSocket.OPEN && user) {
            console.log("Attempting to re-authenticate WebSocket...");
            setTimeout(() => {
              ws.send(JSON.stringify({
                type: "auth",
                userId: user.id,
                isAdmin: user.isEngineer || user.isRoot
              }));
            }, 1000);
          }
        }
      }
    } catch (error) {
      console.error("Error parsing message:", error);
    }
  };
  
  // Initialize WebSocket connection with reconnection logic
  useEffect(() => {
    if (!user) return;
    
    let reconnectTimer: NodeJS.Timeout | null = null;
    let isComponentMounted = true;
    
    // Load initial messages
    fetchMessages();
    
    // Create WebSocket connection function
    const connectWebSocket = () => {
      if (!isComponentMounted) return;
      
      // Create WebSocket connection
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsUrl = `${protocol}//${window.location.host}/ws`;
      console.log(`Connecting to WebSocket at ${wsUrl}`);
      
      const ws = new WebSocket(wsUrl);
      socketRef.current = ws;
      
      // Connection opened
      ws.addEventListener("open", () => {
        console.log("WebSocket connection established");
        setIsConnected(true);
        setErrorMessage(null);
        
        // Authenticate with the server
        ws.send(JSON.stringify({
          type: "auth",
          userId: user.id,
          isAdmin: user.isEngineer || user.isRoot
        }));
      });
      
      // Listen for messages
      ws.addEventListener("message", handleSocketMessage);
      
      // Connection closed
      ws.addEventListener("close", (event) => {
        console.log(`WebSocket connection closed: ${event.code} ${event.reason}`);
        setIsConnected(false);
        
        // Attempt to reconnect after a delay
        if (isComponentMounted) {
          console.log("Scheduling reconnection...");
          reconnectTimer = setTimeout(() => {
            console.log("Attempting to reconnect...");
            connectWebSocket();
          }, 3000);
        }
      });
      
      // Connection error
      ws.addEventListener("error", (error) => {
        console.error("WebSocket error:", error);
        setIsConnected(false);
        setErrorMessage("Failed to connect to chat server. Retrying...");
      });
    };
    
    // Initial connection
    connectWebSocket();
    
    // Clean up on unmount
    return () => {
      isComponentMounted = false;
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
      }
      if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
        socketRef.current.close();
      }
    };
  }, [user]);
  
  // Scroll to bottom when messages change
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);
  
  // Reset preview when dialog closes
  useEffect(() => {
    if (!mediaUploadOpen) {
      setSelectedFile(null);
      setPreview(null);
      setUploadProgress(0);
      setErrorMessage(null);
    }
  }, [mediaUploadOpen]);
  
  // Create URL preview for selected file
  useEffect(() => {
    if (!selectedFile) {
      setPreview(null);
      return;
    }
    
    const objectUrl = URL.createObjectURL(selectedFile);
    setPreview(objectUrl);
    
    // Free memory when preview is no longer needed
    return () => URL.revokeObjectURL(objectUrl);
  }, [selectedFile]);
  

  
  // Handle message submission
  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    
    if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
      toast({
        title: "Connection Error",
        description: "Not connected to chat server. Please refresh the page.",
        variant: "destructive"
      });
      return;
    }
    
    // Trim message and check if it's empty
    const trimmedMessage = messageInput.trim();
    if (!trimmedMessage) {
      toast({
        title: "Error",
        description: "Please enter a message.",
        variant: "destructive"
      });
      return;
    }
    
    // Send message to server
    socketRef.current.send(JSON.stringify({
      type: "message",
      content: trimmedMessage
    }));
    
    // Clear input
    setMessageInput("");
  };
  
  // Open file picker
  const handleOpenFilePicker = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };
  
  // Handle file selection
  const handleFileSelected = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    // Check file type
    const fileType = file.type.split('/')[0];
    if (fileType !== 'image' && fileType !== 'video') {
      setErrorMessage("Only image and video files are supported.");
      return;
    }
    
    // Check file size (700MB limit as requested)
    const isDeployment = window.location.hostname.includes('.replit.app');
    const maxSize = 700 * 1024 * 1024; // 700MB limit for all environments
    
    if (file.size > maxSize) {
      const sizeInMB = Math.round(file.size / (1024 * 1024));
      const limitInMB = Math.round(maxSize / (1024 * 1024));
      setErrorMessage(
        `File size (${sizeInMB}MB) exceeds the ${limitInMB}MB limit for ${isDeployment ? 'deployment' : 'development'} environment.`
      );
      return;
    }
    
    // Log upload environment for debugging
    console.log("Upload environment:", {
      isDeployment,
      maxFileSize: `${Math.round(maxSize / (1024 * 1024))}MB`,
      hostname: window.location.hostname
    });
    
    setSelectedFile(file);
    setErrorMessage(null);
    setMediaUploadOpen(true);
  };
  
  // Upload selected file
  const handleUploadFile = async () => {
    if (!selectedFile) return;
    
    // Log file details
    console.log("Uploading file:", {
      name: selectedFile.name,
      type: selectedFile.type,
      size: `${(selectedFile.size / (1024 * 1024)).toFixed(2)} MB`,
      lastModified: new Date(selectedFile.lastModified).toISOString()
    });
    
    setIsUploading(true);
    setUploadProgress(0);
    
    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      
      const xhr = new XMLHttpRequest();
      
      // Track upload progress with more detailed logging
      xhr.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable) {
          const progress = Math.round((event.loaded / event.total) * 100);
          const loadedMB = (event.loaded / (1024 * 1024)).toFixed(2);
          const totalMB = (event.total / (1024 * 1024)).toFixed(2);
          
          console.log(`Upload progress: ${progress}% (${loadedMB}MB / ${totalMB}MB)`);
          setUploadProgress(progress);
        } else {
          console.log("Upload progress: Not computable");
        }
      });

      // Calculate timeout based on file size (longer timeout for larger files)
      const fileSizeMB = selectedFile.size / (1024 * 1024);
      // Base timeout is 5 minutes, but add more time for large files (1 min per 50MB)
      const timeoutMinutes = Math.max(5, Math.ceil(fileSizeMB / 50) + 5);
      console.log(`Setting upload timeout to ${timeoutMinutes} minutes for ${fileSizeMB.toFixed(2)}MB file`);
      
      // Add timeout tracking
      const uploadTimeout = setTimeout(() => {
        console.log(`Upload timed out after ${timeoutMinutes} minutes`);
        xhr.abort();
        setErrorMessage(`Upload timed out after ${timeoutMinutes} minutes. The file may be too large for the server to handle.`);
        setIsUploading(false);
      }, timeoutMinutes * 60 * 1000);
      
      // Handle completion
      xhr.addEventListener('load', () => {
        clearTimeout(uploadTimeout);
        
        console.log("Upload completed with status:", xhr.status, xhr.statusText);
        
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const response = JSON.parse(xhr.responseText);
            console.log("Upload successful, server response:", response);
            
            // Send message with media to server
            if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
              socketRef.current.send(JSON.stringify({
                type: "media_message",
                mediaId: response.mediaId
              }));
            }
            
            // Close dialog and reset
            setMediaUploadOpen(false);
            setSelectedFile(null);
            setPreview(null);
            setUploadProgress(0);
            
            toast({
              title: "Success",
              description: "Media uploaded successfully.",
            });
          } catch (parseError) {
            console.error("Error parsing server response:", parseError);
            setErrorMessage("Error processing server response");
          }
        } else {
          console.error("Upload failed with status:", xhr.status, xhr.statusText);
          console.error("Server response:", xhr.responseText);
          
          // Try to parse the error response
          let errorMessage = "Upload failed";
          try {
            const errorResponse = JSON.parse(xhr.responseText);
            if (errorResponse.error) {
              errorMessage = errorResponse.error;
            }
            if (errorResponse.details) {
              console.error("Error details:", errorResponse.details);
              errorMessage += `: ${errorResponse.details}`;
            }
          } catch (e) {
            // If we can't parse the error response, use the status text
            errorMessage = xhr.statusText || "Unknown error";
          }
          setErrorMessage(errorMessage);
        }
      });
      
      // Handle errors
      xhr.addEventListener('error', (event) => {
        clearTimeout(uploadTimeout);
        console.error("XHR error during upload:", event);
        setErrorMessage("Network error occurred during upload. Please check your connection and try again.");
      });

      // Handle aborted uploads
      xhr.addEventListener('abort', () => {
        clearTimeout(uploadTimeout);
        console.log("Upload aborted");
        setErrorMessage("Upload was cancelled.");
      });
      
      // Send request
      console.log("Opening XHR connection to /api/chat/upload");
      xhr.open('POST', '/api/chat/upload');
      xhr.withCredentials = true; // Include credentials (cookies) for authentication
      
      console.log("Sending form data...");
      xhr.send(formData);
      
    } catch (error) {
      console.error("Error uploading file:", error);
      setErrorMessage("Failed to upload file. Please try again.");
    } finally {
      setIsUploading(false);
    }
  };
  
  // Handle message moderation
  const handleModerateMessage = (messageId: number, action: string) => {
    if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
      toast({
        title: "Connection Error",
        description: "Not connected to chat server. Please refresh the page.",
        variant: "destructive"
      });
      return;
    }
    
    // Send moderation command to server
    socketRef.current.send(JSON.stringify({
      type: action,
      messageId
    }));
  };
  
  // Handle message restoration
  const handleRestoreMessage = (messageId: number) => {
    handleModerateMessage(messageId, "restore");
  };
  
  // Render connection status
  const renderConnectionStatus = () => {
    if (!user) return null;
    
    return (
      <div className={`flex items-center space-x-1 text-xs ${isConnected ? 'text-green-500' : 'text-red-500'}`}>
        <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
        <span>{isConnected ? 'Connected' : 'Disconnected'}</span>
      </div>
    );
  };
  
  // Render preview based on file type
  const renderPreview = () => {
    if (!preview || !selectedFile) return null;
    
    const fileType = selectedFile.type.split('/')[0];
    
    return (
      <div className="relative mt-4 max-w-lg mx-auto">
        {fileType === 'image' && (
          <img 
            src={preview} 
            alt="Upload preview" 
            className="max-h-96 max-w-full mx-auto rounded-md"
          />
        )}
        {fileType === 'video' && (
          <video 
            src={preview} 
            controls
            className="max-h-96 max-w-full mx-auto rounded-md"
          />
        )}
      </div>
    );
  };
  
  if (!user) {
    return (
      <div className="flex justify-center items-center h-64">
        <p className="text-gray-400">Please log in to view the chat.</p>
      </div>
    );
  }
  
  return (
    <Card className="bg-gray-900 border-gray-800 shadow-lg">
      <CardContent className="p-0">
        <div className="flex flex-col h-[70vh]">
          <div className="p-4 flex justify-between items-center border-b border-gray-800">
            <h2 className="text-lg font-semibold">The Dream's Team</h2>
            {renderConnectionStatus()}
          </div>
          
          <ScrollArea className="flex-1 p-4">
            {isLoading ? (
              <div className="flex justify-center items-center h-full">
                <p className="text-gray-400">Loading messages...</p>
              </div>
            ) : (
              <div className="space-y-4">
                <MessageList 
                  messages={messages} 
                  currentUser={user}
                  onModerate={handleModerateMessage}
                  onRestore={handleRestoreMessage}
                />
                <div ref={messagesEndRef} />
              </div>
            )}
          </ScrollArea>
          
          <CardFooter className="p-4 border-t border-gray-800">
            <form onSubmit={handleSubmit} className="flex items-end gap-2 w-full">
              <Dialog open={mediaUploadOpen} onOpenChange={setMediaUploadOpen}>
                <DialogTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={!isConnected}
                    className="h-10 w-10"
                    onClick={handleOpenFilePicker}
                  >
                    <ImagePlus className="h-5 w-5" />
                  </Button>
                </DialogTrigger>
                <DialogContent className="bg-gray-900 border-gray-800">
                  <DialogHeader>
                    <DialogTitle>Upload Media</DialogTitle>
                  </DialogHeader>
                  
                  {errorMessage && (
                    <div className="bg-red-900/30 border border-red-800 text-red-400 p-3 rounded-md flex items-start space-x-2">
                      <AlertCircle className="h-5 w-5 mt-0.5 flex-shrink-0" />
                      <p>{errorMessage}</p>
                    </div>
                  )}
                  
                  {!selectedFile ? (
                    <div className="flex flex-col items-center justify-center p-8 border-2 border-dashed border-gray-700 rounded-md">
                      <div className="flex flex-col items-center text-center space-y-2">
                        <div className="flex space-x-4">
                          <FileImage className="h-8 w-8 text-gray-400" />
                          <FileVideo className="h-8 w-8 text-gray-400" />
                        </div>
                        <h3 className="text-lg font-medium">No file selected</h3>
                        <p className="text-sm text-gray-400">
                          Click 'Browse' to select an image or video (max 700MB)
                        </p>
                        <Button 
                          onClick={handleOpenFilePicker}
                          variant="secondary"
                        >
                          Browse
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      {renderPreview()}
                      
                      {isUploading && (
                        <div className="mt-4">
                          <div className="w-full bg-gray-700 rounded-full h-2.5 mb-1">
                            <div 
                              className="bg-blue-600 h-2.5 rounded-full" 
                              style={{ width: `${uploadProgress}%` }}
                            />
                          </div>
                          <div className="flex justify-between text-xs text-gray-400">
                            <span>
                              {selectedFile && 
                                `${(selectedFile.size / (1024 * 1024)).toFixed(1)}MB file`}
                            </span>
                            <span className="font-medium">{uploadProgress}%</span>
                          </div>
                          {uploadProgress > 0 && uploadProgress < 100 && (
                            <p className="text-xs text-gray-500 mt-1">
                              Large files (over 100MB) may take several minutes to upload.
                              Please keep this window open until upload completes.
                            </p>
                          )}
                        </div>
                      )}
                      
                      <div className="flex justify-between items-center mt-4">
                        <div className="text-sm text-gray-400 truncate max-w-[70%]">
                          {selectedFile.name}
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-red-500 hover:text-red-400"
                          onClick={() => setSelectedFile(null)}
                        >
                          <X className="h-4 w-4 mr-1" />
                          Remove
                        </Button>
                      </div>
                    </>
                  )}
                  
                  <DialogFooter>
                    <Button
                      variant="ghost"
                      onClick={() => setMediaUploadOpen(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={handleUploadFile}
                      disabled={!selectedFile || isUploading}
                    >
                      Upload
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
              
              <input
                type="file"
                ref={fileInputRef}
                style={{ display: 'none' }}
                accept="image/*,video/*"
                onChange={handleFileSelected}
              />
              
              <div className="flex-1">
                <Textarea
                  value={messageInput}
                  onChange={(e) => setMessageInput(e.target.value)}
                  placeholder="Type a message..."
                  className="min-h-[44px] max-h-[120px] resize-none"
                  disabled={!isConnected}
                />
              </div>
              
              <Button 
                type="submit" 
                disabled={!isConnected || !messageInput.trim()}
              >
                <Send className="h-4 w-4 mr-1" />
                Send
              </Button>
            </form>
          </CardFooter>
        </div>
      </CardContent>
    </Card>
  );
}