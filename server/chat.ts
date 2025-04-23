import { WebSocketServer, WebSocket } from 'ws';
import { Request, Response } from 'express';
import fileUpload from 'express-fileupload';
import path from 'path';
import fs from 'fs';
import { promisify } from 'util';
import { db } from './db';
import { 
  messages, 
  mediaAttachments, 
  moderationLogs, 
  insertMessageSchema, 
  insertMediaAttachmentSchema, 
  insertModerationLogSchema,
  users
} from '@shared/schema';
import { eq, and, desc, sql, asc } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { User } from '@shared/schema';

const mkdirAsync = promisify(fs.mkdir);
const writeFileAsync = promisify(fs.writeFile);
const renameAsync = promisify(fs.rename);
const statAsync = promisify(fs.stat);
const unlinkAsync = promisify(fs.unlink);

interface FileUploadRequest extends Request {
  files?: fileUpload.FileArray;
}

// Make sure the uploads directory exists
async function ensureUploadDirExists() {
  const uploadsDir = path.join(process.cwd(), 'uploads');
  try {
    await statAsync(uploadsDir);
  } catch (error) {
    // If the directory doesn't exist, create it
    await mkdirAsync(uploadsDir, { recursive: true });
  }
  return uploadsDir;
}

// Define connected clients
type Client = {
  socket: WebSocket;
  userId: number;
  isAdmin: boolean;
};

// Initialize connected clients map
const clients = new Map<WebSocket, Client>();

// Set up WebSocket server for chat
export function setupChatWebSocket(wss: WebSocketServer) {
  console.log('Setting up chat WebSocket server...');
  
  wss.on('connection', (socket) => {
    console.log('Client connected to chat WebSocket');
    
    socket.on('message', async (message) => {
      try {
        const data = JSON.parse(message.toString());
        console.log('Received WebSocket message:', data.type);
        
        // Handle authentication
        if (data.type === 'auth') {
          const { userId, isAdmin } = data;
          
          if (!userId) {
            socket.send(JSON.stringify({
              type: 'error',
              error: 'Authentication failed: Missing user ID'
            }));
            return;
          }
          
          // Store client information
          clients.set(socket, { socket, userId, isAdmin: !!isAdmin });
          
          // Send recent messages to the new user
          const recentMessages = await getRecentMessages();
          socket.send(JSON.stringify({
            type: 'messages',
            messages: recentMessages
          }));
          
          console.log(`User ${userId} authenticated with WebSocket${isAdmin ? ' (admin)' : ''}`);
          return;
        }
        
        // Get client info
        const client = clients.get(socket);
        if (!client) {
          socket.send(JSON.stringify({
            type: 'error',
            error: 'Not authenticated'
          }));
          return;
        }
        
        // Handle text message
        if (data.type === 'message') {
          const { content } = data;
          if (!content || content.trim() === '') {
            socket.send(JSON.stringify({
              type: 'error',
              error: 'Message content cannot be empty'
            }));
            return;
          }
          
          // Create message in database
          const newMessage = await createMessage({ 
            userId: client.userId, 
            content: content.trim() 
          });
          
          // Get the user's username for the message
          const user = await db
            .select({ username: users.username })
            .from(users)
            .where(eq(users.id, client.userId))
            .then(rows => rows[0]);
          
          if (!user) {
            socket.send(JSON.stringify({
              type: 'error',
              error: 'User not found'
            }));
            return;
          }
          
          // Broadcast message to all clients
          broadcastMessage({
            type: 'message',
            message: {
              ...newMessage,
              username: user.username
            }
          });
        }
        
        // Handle media message
        else if (data.type === 'media_message') {
          const { mediaId } = data;
          if (!mediaId) {
            socket.send(JSON.stringify({
              type: 'error',
              error: 'Media ID is required'
            }));
            return;
          }
          
          // Get the media attachment
          const [media] = await db
            .select()
            .from(mediaAttachments)
            .where(eq(mediaAttachments.id, mediaId));
          
          if (!media) {
            socket.send(JSON.stringify({
              type: 'error',
              error: 'Media not found'
            }));
            return;
          }
          
          // Create a message with the media
          const newMessage = await createMessage({ 
            userId: client.userId, 
            content: null,
            hasMedia: true,
            mediaId: mediaId 
          });
          
          // Get the user's username for the message
          const user = await db
            .select({ username: users.username })
            .from(users)
            .where(eq(users.id, client.userId))
            .then(rows => rows[0]);
          
          if (!user) {
            socket.send(JSON.stringify({
              type: 'error',
              error: 'User not found'
            }));
            return;
          }
          
          // Broadcast message to all clients
          broadcastMessage({
            type: 'message',
            message: {
              ...newMessage,
              username: user.username,
              media: media
            }
          });
        }
        
        // Handle message deletion
        else if (data.type === 'delete') {
          const { messageId } = data;
          if (!messageId) {
            socket.send(JSON.stringify({
              type: 'error',
              error: 'Message ID is required for deletion'
            }));
            return;
          }
          
          // Check if user is an admin
          if (!client.isAdmin) {
            socket.send(JSON.stringify({
              type: 'error',
              error: 'Only moderators can delete messages'
            }));
            return;
          }
          
          // Get the message
          const [message] = await db
            .select()
            .from(messages)
            .where(eq(messages.id, messageId));
          
          if (!message) {
            socket.send(JSON.stringify({
              type: 'error',
              error: 'Message not found'
            }));
            return;
          }
          
          if (message.isDeleted) {
            socket.send(JSON.stringify({
              type: 'error',
              error: 'Message is already deleted'
            }));
            return;
          }
          
          // Delete the message
          await moderateMessage(messageId, client.userId);
          
          // Get moderator's username
          const moderator = await db
            .select({ username: users.username })
            .from(users)
            .where(eq(users.id, client.userId))
            .then(rows => rows[0]);
          
          // Broadcast deletion to all clients
          broadcastModeration(messageId, 'delete');
          
          // Send confirmation to the client
          socket.send(JSON.stringify({
            type: 'success',
            action: 'delete',
            messageId
          }));
        }
        
        // Handle message restoration
        else if (data.type === 'restore') {
          const { messageId } = data;
          if (!messageId) {
            socket.send(JSON.stringify({
              type: 'error',
              error: 'Message ID is required for restoration'
            }));
            return;
          }
          
          // Check if user is a root (only roots can restore)
          const isRoot = await isRootUser(client.userId);
          if (!isRoot) {
            socket.send(JSON.stringify({
              type: 'error',
              error: 'Only root users can restore messages'
            }));
            return;
          }
          
          // Get the message
          const [message] = await db
            .select()
            .from(messages)
            .where(eq(messages.id, messageId));
          
          if (!message) {
            socket.send(JSON.stringify({
              type: 'error',
              error: 'Message not found'
            }));
            return;
          }
          
          if (!message.isDeleted) {
            socket.send(JSON.stringify({
              type: 'error',
              error: 'Message is not deleted'
            }));
            return;
          }
          
          // Restore the message
          await restoreMessage(messageId, client.userId);
          
          // Broadcast restoration to all clients
          broadcastModeration(messageId, 'restore');
          
          // Send confirmation to the client
          socket.send(JSON.stringify({
            type: 'success',
            action: 'restore',
            messageId
          }));
        }
        
      } catch (error) {
        console.error('Error handling WebSocket message:', error);
        socket.send(JSON.stringify({
          type: 'error',
          error: 'Internal server error'
        }));
      }
    });
    
    // Handle disconnection
    socket.on('close', () => {
      console.log('Client disconnected from chat WebSocket');
      // Remove client from map
      clients.delete(socket);
    });
  });
}

// Check if a user is a root user
async function isRootUser(userId: number): Promise<boolean> {
  const [user] = await db
    .select({ isRoot: users.isRoot })
    .from(users)
    .where(eq(users.id, userId));
  
  return user?.isRoot === true;
}

// Broadcast a message to all connected clients
function broadcastMessage(message: any) {
  const messageStr = JSON.stringify(message);
  
  // Use Array.from to convert entries to an array for iteration
  Array.from(clients.entries()).forEach(([socket, client]) => {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(messageStr);
    }
  });
}

// Broadcast a moderation action to all connected clients
function broadcastModeration(messageId: number, action: string) {
  const now = new Date().toISOString();
  
  // Use Array.from to convert entries to an array for iteration
  Array.from(clients.entries()).forEach(([socket, client]) => {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({
        type: 'moderation',
        action: action,
        messageId: messageId,
        timestamp: now,
        moderatorId: client.userId,
        moderatorName: '' // Will be filled by the client
      }));
    }
  });
}

// Get recent messages
export async function getRecentMessages(limit = 50) {
  try {
    // Get messages
    const rawMessages = await db
      .select()
      .from(messages)
      .where(eq(messages.clubIndex, 1995))
      .orderBy(asc(messages.createdAt))
      .limit(limit);
    
    // Get user information for each message
    const messagesWithUserInfo = await Promise.all(
      rawMessages.map(async (message) => {
        // Get the username for the message
        const [user] = await db
          .select({ username: users.username })
          .from(users)
          .where(eq(users.id, message.userId));
        
        // Get media information if the message has media
        let media = null;
        if (message.hasMedia && message.mediaId) {
          const [mediaInfo] = await db
            .select()
            .from(mediaAttachments)
            .where(eq(mediaAttachments.id, message.mediaId));
          
          if (mediaInfo) {
            media = mediaInfo;
          }
        }
        
        // Get moderator name if the message is deleted
        let moderatorName = null;
        if (message.isDeleted && message.deletedBy) {
          const [moderator] = await db
            .select({ username: users.username })
            .from(users)
            .where(eq(users.id, message.deletedBy));
          
          if (moderator) {
            moderatorName = moderator.username;
          }
        }
        
        return {
          ...message,
          username: user?.username || 'Unknown User',
          moderatorName,
          media
        };
      })
    );
    
    return messagesWithUserInfo;
  } catch (error) {
    console.error('Error getting recent messages:', error);
    throw error;
  }
}

// Create a new message
export async function createMessage({ userId, content, hasMedia = false, mediaId = null }: { userId: number; content: string | null; hasMedia?: boolean; mediaId?: number | null; }) {
  try {
    // Insert the message
    const result = await db
      .insert(messages)
      .values({
        userId,
        content,
        clubIndex: 1995, // Hard-coded to Scoot(1995)
        hasMedia,
        mediaId,
        createdAt: new Date(),
        isDeleted: false
      })
      .returning();
    
    // Extract the first result
    const newMessage = Array.isArray(result) ? result[0] : result;
    
    return newMessage;
  } catch (error) {
    console.error('Error creating message:', error);
    throw error;
  }
}

// Upload media
export async function uploadMedia(req: FileUploadRequest, res: Response) {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  if (!req.files || Object.keys(req.files).length === 0) {
    return res.status(400).json({ error: 'No files were uploaded' });
  }
  
  try {
    // Make sure uploads directory exists
    const uploadsDir = await ensureUploadDirExists();
    
    // Get the file
    const file = req.files.file as fileUpload.UploadedFile;
    
    // Check file type
    const fileType = file.mimetype.split('/')[0];
    if (fileType !== 'image' && fileType !== 'video') {
      return res.status(400).json({ 
        error: 'Unsupported file type. Only images and videos are allowed.' 
      });
    }
    
    // Check file size (10MB limit)
    if (file.size > 10 * 1024 * 1024) {
      return res.status(400).json({ 
        error: 'File size exceeds the limit (10MB)' 
      });
    }
    
    // Generate a unique filename
    const fileExt = path.extname(file.name);
    const uniqueFileName = `${uuidv4()}${fileExt}`;
    const filePath = path.join(uploadsDir, uniqueFileName);
    
    // Move the file to the uploads directory
    await file.mv(filePath);
    
    // Create a thumbnail for videos (use placeholder for now)
    let thumbnailPath = null;
    if (fileType === 'video') {
      thumbnailPath = '/video-placeholder.png';
    }
    
    // Save media information to database
    const result = await db
      .insert(mediaAttachments)
      .values({
        userId: req.user!.id,
        mediaType: fileType,
        mediaPath: `/uploads/${uniqueFileName}`,
        thumbnailPath,
        createdAt: new Date()
      })
      .returning();
      
    // Extract the first result
    const media = Array.isArray(result) ? result[0] : result;
    
    res.json({ 
      mediaId: media.id,
      mediaPath: media.mediaPath
    });
  } catch (error) {
    console.error('Error uploading media:', error);
    res.status(500).json({ error: 'Failed to upload media' });
  }
}

// Get a specific message by ID
export async function getMessageById(req: Request, res: Response) {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  try {
    const messageId = parseInt(req.params.id);
    
    // Get the message
    const [message] = await db
      .select()
      .from(messages)
      .where(eq(messages.id, messageId));
    
    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }
    
    // If message is deleted and user isn't root, don't show content
    if (message.isDeleted && !req.user!.isRoot) {
      return res.json({
        ...message,
        content: null
      });
    }
    
    // Get username for the message
    const [user] = await db
      .select({ username: users.username })
      .from(users)
      .where(eq(users.id, message.userId));
    
    res.json({
      ...message,
      username: user?.username || 'Unknown User'
    });
  } catch (error) {
    console.error('Error getting message:', error);
    res.status(500).json({ error: 'Server error' });
  }
}

// Get media for a message
export async function getMediaByMessageId(req: Request, res: Response) {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  try {
    const messageId = parseInt(req.params.id);
    
    // Get the message
    const [message] = await db
      .select()
      .from(messages)
      .where(eq(messages.id, messageId));
    
    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }
    
    if (!message.hasMedia || !message.mediaId) {
      return res.status(404).json({ error: 'Message has no media' });
    }
    
    // Get the media
    const [media] = await db
      .select()
      .from(mediaAttachments)
      .where(eq(mediaAttachments.id, message.mediaId));
    
    if (!media) {
      return res.status(404).json({ error: 'Media not found' });
    }
    
    res.json(media);
  } catch (error) {
    console.error('Error getting media:', error);
    res.status(500).json({ error: 'Server error' });
  }
}

// Moderate (delete) a message
export async function moderateMessage(
  messageId: number,
  moderatorId: number
) {
  try {
    // Update the message
    const [updatedMessage] = await db
      .update(messages)
      .set({
        isDeleted: true,
        deletedBy: moderatorId,
        deletedAt: new Date()
      })
      .where(eq(messages.id, messageId))
      .returning();
    
    // Log the moderation action
    await db
      .insert(moderationLogs)
      .values({
        messageId: messageId,
        userId: moderatorId, // Using the column name from schema
        action: 'delete',
        timestamp: new Date() // Using the column name from schema
      });
    
    return updatedMessage;
  } catch (error) {
    console.error('Error moderating message:', error);
    throw error;
  }
}

// Restore a deleted message
export async function restoreMessage(
  messageId: number,
  moderatorId: number
) {
  try {
    // Update the message
    const [updatedMessage] = await db
      .update(messages)
      .set({
        isDeleted: false,
        deletedBy: null,
        deletedAt: null
      })
      .where(eq(messages.id, messageId))
      .returning();
    
    // Log the moderation action
    await db
      .insert(moderationLogs)
      .values({
        messageId: messageId,
        userId: moderatorId, // Using the column name from schema
        action: 'restore',
        timestamp: new Date() // Using the column name from schema
      });
    
    return updatedMessage;
  } catch (error) {
    console.error('Error restoring message:', error);
    throw error;
  }
}

// Get deleted messages (for root users)
export async function getDeletedMessages(req: Request, res: Response) {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  if (!req.user!.isRoot) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  
  try {
    // Get pagination parameters
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const offset = (page - 1) * limit;
    
    // Get deleted messages
    const deletedMessages = await db
      .select()
      .from(messages)
      .where(and(
        eq(messages.isDeleted, true),
        eq(messages.clubIndex, 1995)
      ))
      .orderBy(desc(messages.deletedAt))
      .limit(limit)
      .offset(offset);
    
    // Get additional information for each message
    const messagesWithModeratorInfo = await Promise.all(
      deletedMessages.map(async (message) => {
        // Get author information
        const [author] = await db
          .select({ username: users.username })
          .from(users)
          .where(eq(users.id, message.userId));
        
        // Get moderator information
        const [moderator] = await db
          .select({ username: users.username })
          .from(users)
          .where(eq(users.id, message.deletedBy || 0));
        
        // Get media information if message has media
        let media = null;
        if (message.hasMedia && message.mediaId) {
          const [mediaInfo] = await db
            .select()
            .from(mediaAttachments)
            .where(eq(mediaAttachments.id, message.mediaId));
          
          if (mediaInfo) {
            media = mediaInfo;
          }
        }
        
        return {
          id: message.id,
          content: message.content,
          createdAt: message.createdAt,
          authorId: message.userId,
          authorName: author?.username || 'Unknown User',
          deletedBy: message.deletedBy || 0,
          moderatorName: moderator?.username || 'Unknown Moderator',
          deletedAt: message.deletedAt || '',
          hasMedia: message.hasMedia,
          media
        };
      })
    );
    
    // Get total count for pagination
    const [countResult] = await db
      .select({ count: sql`count(*)::int` })
      .from(messages)
      .where(and(
        eq(messages.isDeleted, true),
        eq(messages.clubIndex, 1995)
      ));
    
    // Ensure count is properly handled as a number
    const totalCount = typeof countResult.count === 'number' 
      ? countResult.count 
      : parseInt(String(countResult.count), 10) || 0;
    
    return res.json({
      messages: messagesWithModeratorInfo,
      pagination: {
        total: totalCount,
        page,
        limit,
        pages: Math.ceil(totalCount / limit)
      }
    });
  } catch (error) {
    console.error('Error getting deleted messages:', error);
    return res.status(500).json({ error: 'Server error' });
  }
}

// Register chat routes
export function registerChatRoutes(app: any) {
  // Get recent messages
  app.get('/api/chat/messages', async (req: Request, res: Response) => {
    try {
      const messages = await getRecentMessages();
      res.json(messages);
    } catch (error) {
      console.error('Error getting messages:', error);
      res.status(500).json({ error: 'Server error' });
    }
  });
  
  // Get a specific message
  app.get('/api/chat/messages/:id', getMessageById);
  
  // Get media for a message
  app.get('/api/chat/messages/:id/media', getMediaByMessageId);
  
  // Upload media
  app.post('/api/chat/upload', uploadMedia);
  
  // Get deleted messages (root users only)
  app.get('/api/chat/moderation/deleted', getDeletedMessages);
}