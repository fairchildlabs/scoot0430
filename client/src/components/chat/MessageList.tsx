import { useState } from "react";
import { format } from "date-fns";
import { 
  Card, 
  CardContent,
  CardHeader,
  CardFooter
} from "@/components/ui/card";
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
import { Button } from "@/components/ui/button";
import { Trash2, RotateCcw } from "lucide-react";
import { User } from "@shared/schema";
import { MediaDisplay } from "./MediaDisplay";

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
}

interface MessageListProps {
  messages: Message[];
  currentUser: User;
  onModerate: (messageId: number, action: string) => void;
  onRestore: (messageId: number) => void;
}

export function MessageList({ messages, currentUser, onModerate, onRestore }: MessageListProps) {
  const [selectedMessageId, setSelectedMessageId] = useState<number | null>(null);
  
  const isModerator = currentUser.isEngineer || currentUser.isRoot;
  const isRoot = currentUser.isRoot;
  
  // Format date for display
  const formatMessageDate = (dateString: string) => {
    const date = new Date(dateString);
    return format(date, "MMM d, yyyy 'at' h:mm a");
  };
  
  // Handle message deletion (moderation)
  const handleDelete = (messageId: number) => {
    onModerate(messageId, "delete");
    setSelectedMessageId(null);
  };
  
  // Handle message restoration
  const handleRestore = (messageId: number) => {
    onRestore(messageId);
    setSelectedMessageId(null);
  };
  
  // Check if user can moderate a message
  const canModerateMessage = (message: Message) => {
    return isModerator && !message.isDeleted;
  };
  
  // Check if user can restore a message
  const canRestoreMessage = (message: Message) => {
    return isRoot && message.isDeleted;
  };
  
  if (messages.length === 0) {
    return (
      <div className="flex justify-center items-center h-full">
        <p className="text-gray-400">No messages yet.</p>
      </div>
    );
  }
  
  return (
    <div className="space-y-4">
      {messages.map((message) => (
        <Card 
          key={message.id} 
          className={`
            bg-gray-900
            ${message.userId === currentUser.id ? 'border-blue-800' : 'border-gray-800'}
          `}
        >
          <CardHeader className="py-2 px-4 flex flex-row justify-between items-center">
            <div>
              <span className="font-bold text-white">
                {message.username} 
                {message.userId === currentUser.id && " (You)"}
              </span>
              <span className="text-xs text-gray-400 ml-2">
                {formatMessageDate(message.createdAt)}
              </span>
            </div>
            
            <div className="flex space-x-2">
              {canModerateMessage(message) && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="ghost" 
                      size="icon" 
                      className="h-7 w-7 text-red-500 hover:text-red-400 hover:bg-gray-800"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent className="bg-gray-900 border-gray-800">
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete Message</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will remove the message from all users' view. This action can be undone by root users.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel className="bg-gray-800 hover:bg-gray-700">Cancel</AlertDialogCancel>
                      <AlertDialogAction 
                        className="bg-red-600 hover:bg-red-700"
                        onClick={() => handleDelete(message.id)}
                      >
                        Delete
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
              
              {canRestoreMessage(message) && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="ghost" 
                      size="icon" 
                      className="h-7 w-7 text-green-500 hover:text-green-400 hover:bg-gray-800"
                    >
                      <RotateCcw className="h-4 w-4" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent className="bg-gray-900 border-gray-800">
                    <AlertDialogHeader>
                      <AlertDialogTitle>Restore Message</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will restore the message and make it visible to all users again.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel className="bg-gray-800 hover:bg-gray-700">Cancel</AlertDialogCancel>
                      <AlertDialogAction 
                        className="bg-green-600 hover:bg-green-700"
                        onClick={() => handleRestore(message.id)}
                      >
                        Restore
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </div>
          </CardHeader>
          
          <CardContent className="py-2 px-4">
            <>
              {message.content && (
                <p className="text-white whitespace-pre-wrap">{message.content}</p>
              )}
              
              {message.hasMedia && message.media && (
                <div className="mt-2">
                  <MediaDisplay media={message.media} />
                </div>
              )}
            </>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}