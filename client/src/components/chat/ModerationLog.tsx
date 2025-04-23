import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { format } from "date-fns";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { Button } from "@/components/ui/button";
import { AlertCircle, RotateCcw } from "lucide-react";
import { MediaDisplay } from "./MediaDisplay";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";

interface DeletedMessage {
  id: number;
  content: string | null;
  createdAt: string;
  authorId: number;
  authorName: string;
  deletedBy: number;
  moderatorName: string;
  deletedAt: string;
  hasMedia: boolean;
  media?: {
    id: number;
    mediaType: string;
    mediaPath: string;
    thumbnailPath: string | null;
  };
}

interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  pages: number;
}

export function ModerationLog() {
  const { user } = useAuth();
  const [messages, setMessages] = useState<DeletedMessage[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta>({
    total: 0,
    page: 1,
    limit: 10,
    pages: 0
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();
  
  // Fetch deleted messages when page changes
  useEffect(() => {
    fetchDeletedMessages(pagination.page);
  }, [pagination.page]);
  
  // Format date for display
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return format(date, "MMM d, yyyy 'at' h:mm a");
  };
  
  // Fetch deleted messages from the API
  const fetchDeletedMessages = async (page: number) => {
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`/api/chat/moderation/deleted?page=${page}`);
      
      if (!response.ok) {
        if (response.status === 403) {
          setError("You don't have permission to access this page.");
          setIsLoading(false);
          return;
        }
        throw new Error("Failed to fetch deleted messages");
      }
      
      const data = await response.json();
      setMessages(data.messages);
      setPagination(data.pagination);
    } catch (error) {
      console.error("Error fetching deleted messages:", error);
      setError("Failed to load deleted messages. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };
  
  // Handle message restoration
  const handleRestore = async (messageId: number) => {
    try {
      const socket = new WebSocket(`${window.location.protocol === "https:" ? "wss:" : "ws:"}://${window.location.host}/ws`);
      
      socket.addEventListener("open", () => {
        // Authenticate with the server
        socket.send(JSON.stringify({
          type: "auth",
          userId: user!.id,
          isAdmin: true
        }));
        
        // Send restore command
        socket.send(JSON.stringify({
          type: "restore",
          messageId
        }));
      });
      
      socket.addEventListener("message", (event) => {
        try {
          const data = JSON.parse(event.data);
          
          if (data.type === "error") {
            toast({
              title: "Error",
              description: data.error,
              variant: "destructive"
            });
          } else {
            toast({
              title: "Success",
              description: "Message restored successfully",
            });
            // Refresh the list
            fetchDeletedMessages(pagination.page);
          }
          
          // Close the socket
          socket.close();
        } catch (error) {
          console.error("Error parsing message:", error);
        }
      });
    } catch (error) {
      console.error("Error restoring message:", error);
      toast({
        title: "Error",
        description: "Failed to restore message",
        variant: "destructive"
      });
    }
  };
  
  // If not root user, show access denied
  if (!user?.isRoot) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh]">
        <h2 className="text-2xl font-semibold mb-4">Access Denied</h2>
        <p className="text-muted-foreground">Only root users can access the moderation log.</p>
      </div>
    );
  }
  
  // Generate pagination items
  const renderPagination = () => {
    const items = [];
    
    // Maximum pages to show
    const maxPages = 5;
    let startPage = Math.max(1, pagination.page - Math.floor(maxPages / 2));
    let endPage = Math.min(pagination.pages, startPage + maxPages - 1);
    
    if (endPage - startPage + 1 < maxPages) {
      startPage = Math.max(1, endPage - maxPages + 1);
    }
    
    // Previous page
    items.push(
      <PaginationItem key="prev">
        <PaginationPrevious 
          href="#" 
          onClick={(e) => {
            e.preventDefault();
            if (pagination.page > 1) {
              setPagination(prev => ({ ...prev, page: prev.page - 1 }));
            }
          }}
          aria-disabled={pagination.page === 1}
          className={pagination.page === 1 ? "pointer-events-none opacity-50" : ""}
        />
      </PaginationItem>
    );
    
    // First page if not visible
    if (startPage > 1) {
      items.push(
        <PaginationItem key="page-1">
          <PaginationLink 
            href="#" 
            onClick={(e) => {
              e.preventDefault();
              setPagination(prev => ({ ...prev, page: 1 }));
            }}
            isActive={pagination.page === 1}
          >
            1
          </PaginationLink>
        </PaginationItem>
      );
      
      if (startPage > 2) {
        items.push(
          <PaginationItem key="ellipsis-1">
            <PaginationEllipsis />
          </PaginationItem>
        );
      }
    }
    
    // Page numbers
    for (let i = startPage; i <= endPage; i++) {
      items.push(
        <PaginationItem key={`page-${i}`}>
          <PaginationLink 
            href="#" 
            onClick={(e) => {
              e.preventDefault();
              setPagination(prev => ({ ...prev, page: i }));
            }}
            isActive={pagination.page === i}
          >
            {i}
          </PaginationLink>
        </PaginationItem>
      );
    }
    
    // Last page if not visible
    if (endPage < pagination.pages) {
      if (endPage < pagination.pages - 1) {
        items.push(
          <PaginationItem key="ellipsis-2">
            <PaginationEllipsis />
          </PaginationItem>
        );
      }
      
      items.push(
        <PaginationItem key={`page-${pagination.pages}`}>
          <PaginationLink 
            href="#" 
            onClick={(e) => {
              e.preventDefault();
              setPagination(prev => ({ ...prev, page: pagination.pages }));
            }}
            isActive={pagination.page === pagination.pages}
          >
            {pagination.pages}
          </PaginationLink>
        </PaginationItem>
      );
    }
    
    // Next page
    items.push(
      <PaginationItem key="next">
        <PaginationNext 
          href="#" 
          onClick={(e) => {
            e.preventDefault();
            if (pagination.page < pagination.pages) {
              setPagination(prev => ({ ...prev, page: prev.page + 1 }));
            }
          }}
          aria-disabled={pagination.page === pagination.pages}
          className={pagination.page === pagination.pages ? "pointer-events-none opacity-50" : ""}
        />
      </PaginationItem>
    );
    
    return (
      <PaginationContent>
        {items}
      </PaginationContent>
    );
  };
  
  return (
    <div className="container mx-auto my-8">
      <h1 className="text-2xl font-bold mb-6">Moderation Log</h1>
      
      {error && (
        <Alert variant="destructive" className="mb-4">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      
      {isLoading ? (
        <div className="flex justify-center py-8">
          <p>Loading moderation logs...</p>
        </div>
      ) : messages.length === 0 ? (
        <div className="text-center py-8 bg-gray-900 rounded-md">
          <p className="text-gray-400">No deleted messages found.</p>
        </div>
      ) : (
        <>
          <div className="rounded-md border">
            <Table>
              <TableCaption>
                Showing {messages.length} of {pagination.total} deleted messages
              </TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Content</TableHead>
                  <TableHead>Author</TableHead>
                  <TableHead>Deleted By</TableHead>
                  <TableHead>Deleted At</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {messages.map((message) => (
                  <TableRow key={message.id}>
                    <TableCell className="whitespace-nowrap">
                      {formatDate(message.createdAt)}
                    </TableCell>
                    <TableCell>
                      <div className="max-w-lg">
                        {message.content ? (
                          <span className="whitespace-pre-wrap">{message.content}</span>
                        ) : (
                          <span className="text-gray-400 italic">[No text content]</span>
                        )}
                        
                        {message.hasMedia && message.media && (
                          <div className="mt-2 max-w-xs">
                            <MediaDisplay media={message.media} />
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>{message.authorName}</TableCell>
                    <TableCell>{message.moderatorName}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      {formatDate(message.deletedAt)}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-green-500 hover:text-green-400"
                        onClick={() => handleRestore(message.id)}
                      >
                        <RotateCcw className="h-4 w-4 mr-1" />
                        Restore
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          
          {pagination.pages > 1 && (
            <div className="mt-4">
              <Pagination>
                {renderPagination()}
              </Pagination>
            </div>
          )}
        </>
      )}
    </div>
  );
}