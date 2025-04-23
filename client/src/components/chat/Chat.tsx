import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { AlertCircle, PaperclipIcon, X, Send } from "lucide-react";
import { MessageList } from "./MessageList";

interface Message {
  id: number;
  userId: number;
  username: string;
  content: string | null;
  createdAt: string;
  hasMedia: boolean;
  isDeleted: boolean;
  media?: {
    id: number;
    mediaType: string;
    mediaPath: string;
    thumbnailPath: string | null;
  };
}

export function Chat() {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState("");
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const socketRef = useRef<WebSocket | null>(null);
  const [mediaUpload, setMediaUpload] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadedMediaId, setUploadedMediaId] = useState<number | null>(null);
  const [uploadedMediaPreview, setUploadedMediaPreview] = useState<string | null>(null);
  const { toast } = useToast();
  
  // Connect to WebSocket when component mounts
  useEffect(() => {
    if (!user) return;
    
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    
    const socket = new WebSocket(wsUrl);
    socketRef.current = socket;
    
    socket.addEventListener("open", () => {
      console.log("WebSocket connection established");
      setIsConnected(true);
      setError(null);
      
      // Authenticate with the server
      socket.send(JSON.stringify({
        type: "auth",
        userId: user.id,
        isAdmin: user.isEngineer || user.isRoot
      }));
    });
    
    socket.addEventListener("message", (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log("Received message:", data);
        
        switch (data.type) {
          case "recent_messages":
            setMessages(data.messages);
            setIsLoading(false);
            break;
            
          case "new_message":
            setMessages(prevMessages => [data.message, ...prevMessages]);
            break;
            
          case "moderation":
            if (data.action === "delete") {
              setMessages(prevMessages => 
                prevMessages.map(msg => 
                  msg.id === data.messageId 
                    ? { ...msg, isDeleted: true, content: null } 
                    : msg
                )
              );
            } else if (data.action === "restore") {
              // Refresh messages after restoration
              fetchMessages();
            }
            break;
            
          case "error":
            setError(data.error);
            toast({
              title: "Error",
              description: data.error,
              variant: "destructive"
            });
            break;
        }
      } catch (error) {
        console.error("Error parsing message:", error);
      }
    });
    
    socket.addEventListener("close", () => {
      console.log("WebSocket connection closed");
      setIsConnected(false);
      setError("Connection lost. Please refresh the page.");
    });
    
    socket.addEventListener("error", () => {
      console.error("WebSocket error");
      setError("Connection error. Please try again later.");
      setIsConnected(false);
    });
    
    return () => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.close();
      }
    };
  }, [user]);
  
  // Fetch initial messages
  const fetchMessages = async () => {
    try {
      const response = await fetch("/api/chat/messages");
      if (!response.ok) throw new Error("Failed to fetch messages");
      const data = await response.json();
      setMessages(data);
      setIsLoading(false);
    } catch (error) {
      console.error("Error fetching messages:", error);
      setError("Failed to load messages. Please try again.");
      setIsLoading(false);
    }
  };
  
  // Send message
  const sendMessage = () => {
    if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
      setError("Not connected to server");
      return;
    }
    
    if (!inputMessage.trim() && !uploadedMediaId) {
      toast({
        title: "Cannot send empty message",
        description: "Please type a message or attach media",
        variant: "destructive"
      });
      return;
    }
    
    const messageData = {
      type: "chat_message",
      content: inputMessage.trim(),
      hasMedia: !!uploadedMediaId,
      mediaId: uploadedMediaId
    };
    
    socketRef.current.send(JSON.stringify(messageData));
    setInputMessage("");
    setUploadedMediaId(null);
    setUploadedMediaPreview(null);
    setMediaUpload(null);
  };
  
  // Upload media
  const uploadMedia = async (file: File) => {
    setIsUploading(true);
    setError(null);
    
    try {
      const formData = new FormData();
      formData.append("file", file);
      
      const response = await fetch("/api/chat/upload", {
        method: "POST",
        body: formData
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Upload failed");
      }
      
      const data = await response.json();
      setUploadedMediaId(data.id);
      
      // Create preview URL
      if (file.type.startsWith("image/")) {
        const reader = new FileReader();
        reader.onload = (e) => {
          setUploadedMediaPreview(e.target?.result as string);
        };
        reader.readAsDataURL(file);
      } else if (file.type.startsWith("video/")) {
        // For video, we'll use the thumbnailPath if available, otherwise just show a placeholder
        setUploadedMediaPreview(data.thumbnailPath || "/video-placeholder.png");
      }
      
      toast({
        title: "Media uploaded",
        description: "Your media is ready to send"
      });
    } catch (error) {
      console.error("Error uploading media:", error);
      setError(`Failed to upload media: ${error instanceof Error ? error.message : 'Unknown error'}`);
      toast({
        title: "Upload failed",
        description: error instanceof Error ? error.message : "Failed to upload media",
        variant: "destructive"
      });
    } finally {
      setIsUploading(false);
    }
  };
  
  // Handle media file change
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    // Check file type
    if (!file.type.startsWith("image/") && !file.type.startsWith("video/")) {
      toast({
        title: "Unsupported file type",
        description: "Please upload an image or video file",
        variant: "destructive"
      });
      return;
    }
    
    // Check file size (10MB limit)
    if (file.size > 10 * 1024 * 1024) {
      toast({
        title: "File too large",
        description: "Please upload a file smaller than 10MB",
        variant: "destructive"
      });
      return;
    }
    
    setMediaUpload(file);
    uploadMedia(file);
  };
  
  // Handle media removal before sending
  const handleRemoveMedia = () => {
    setUploadedMediaId(null);
    setUploadedMediaPreview(null);
    setMediaUpload(null);
  };
  
  // Handle message moderation (for engineers and root users)
  const handleModerateMessage = (messageId: number, action: string) => {
    if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
      setError("Not connected to server");
      return;
    }
    
    socketRef.current.send(JSON.stringify({
      type: "moderate",
      messageId,
      action,
      notes: `Moderated by ${user?.username}`
    }));
  };
  
  // Handle message restoration (root users only)
  const handleRestoreMessage = (messageId: number) => {
    if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
      setError("Not connected to server");
      return;
    }
    
    socketRef.current.send(JSON.stringify({
      type: "restore",
      messageId
    }));
  };
  
  // If not authenticated, show a message
  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh]">
        <h2 className="text-2xl font-semibold mb-4">Chat Access Restricted</h2>
        <p className="text-muted-foreground">Please log in to use the chat</p>
      </div>
    );
  }
  
  return (
    <div className="flex flex-col h-[80vh] mx-auto max-w-3xl border border-border rounded-md bg-black">
      {/* Connection status */}
      {!isConnected && (
        <Alert variant="destructive" className="m-2">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Connection Error</AlertTitle>
          <AlertDescription>
            {error || "Not connected to chat server. Please refresh the page."}
          </AlertDescription>
        </Alert>
      )}
      
      {/* Main chat container */}
      <div className="flex-1 overflow-hidden flex flex-col">
        <div className="p-4 bg-gray-900">
          <h2 className="text-xl font-bold">Scoot(1995) Chat</h2>
          <p className="text-sm text-gray-400">
            {isConnected 
              ? "Connected to server" 
              : "Connecting to server..."}
          </p>
        </div>
        
        <Separator />
        
        {/* Message list */}
        <div className="flex-1 overflow-y-auto p-4 bg-black">
          {isLoading ? (
            <div className="flex justify-center items-center h-full">
              <p>Loading messages...</p>
            </div>
          ) : messages.length > 0 ? (
            <MessageList 
              messages={messages} 
              currentUser={user}
              onModerate={handleModerateMessage}
              onRestore={handleRestoreMessage}
            />
          ) : (
            <div className="flex justify-center items-center h-full">
              <p className="text-gray-400">No messages yet. Start the conversation!</p>
            </div>
          )}
        </div>
        
        <Separator />
        
        {/* Media preview */}
        {uploadedMediaPreview && (
          <div className="p-2 bg-gray-900 flex items-center">
            <div className="w-16 h-16 mr-2 relative">
              <img 
                src={uploadedMediaPreview} 
                alt="Upload preview" 
                className="w-full h-full object-cover rounded-md"
              />
              <button 
                onClick={handleRemoveMedia}
                className="absolute -top-2 -right-2 bg-black text-white rounded-full w-5 h-5 flex items-center justify-center"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
            <p className="text-sm text-gray-400">Media ready to send</p>
          </div>
        )}
        
        {/* Message input */}
        <div className="p-4 bg-gray-900">
          <div className="flex">
            <Textarea
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              placeholder="Type a message..."
              className="flex-1 mr-2 resize-none bg-black"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage();
                }
              }}
            />
            <div className="flex flex-col space-y-2">
              <label className="cursor-pointer">
                <Button 
                  variant="outline"
                  size="icon"
                  disabled={isUploading}
                  className="relative"
                  type="button"
                >
                  {isUploading ? (
                    <span className="animate-pulse">⏳</span>
                  ) : (
                    <PaperclipIcon className="h-4 w-4" />
                  )}
                  <input
                    type="file"
                    accept="image/*,video/*"
                    onChange={handleFileChange}
                    className="sr-only"
                    disabled={isUploading || !!uploadedMediaId}
                  />
                </Button>
              </label>
              <Button
                onClick={sendMessage}
                disabled={(!inputMessage.trim() && !uploadedMediaId) || !isConnected}
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}