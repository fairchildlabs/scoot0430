import { Request, Response } from "express";
import { db } from "./db";
import { eq, desc, and, sql } from "drizzle-orm";
import { 
  messages, 
  mediaAttachments, 
  moderationLogs, 
  users,
  insertMessageSchema,
  insertMediaAttachmentSchema,
  insertModerationLogSchema
} from "@shared/schema";
import path from "path";
import fs from "fs";
import { promisify } from "util";
import crypto from "crypto";
import { WebSocket, WebSocketServer } from "ws";
import fileUpload from "express-fileupload";

// Define Request with file upload type
interface FileUploadRequest extends Request {
  files?: fileUpload.FileArray;
}

// For file uploads
const mkdir = promisify(fs.mkdir);
const writeFile = promisify(fs.writeFile);
const UPLOAD_DIR = path.join(process.cwd(), 'uploads');

// Ensure upload directory exists
async function ensureUploadDirExists() {
  try {
    await mkdir(UPLOAD_DIR, { recursive: true });
  } catch (error) {
    console.error('Failed to create upload directory:', error);
  }
}

// Initialize upload directory
ensureUploadDirExists();

// Connected WebSocket clients
type Client = {
  socket: WebSocket;
  userId: number;
  isAdmin: boolean;
};

const clients: Client[] = [];

export function setupChatWebSocket(wss: WebSocketServer) {
  wss.on('connection', (ws, req) => {
    console.log('WebSocket connection established');
    
    // The user ID will be sent in the first message
    let clientInfo: Client | null = null;
    
    ws.on('message', async (message) => {
      try {
        // Parse incoming message
        const data = JSON.parse(message.toString());
        
        // Handle authentication message
        if (data.type === 'auth') {
          // In a production app, verify the token here
          const userId = parseInt(data.userId);
          const isAdmin = data.isAdmin === true;
          
          clientInfo = { socket: ws, userId, isAdmin };
          clients.push(clientInfo);
          
          console.log(`Client authenticated: userId=${userId}, isAdmin=${isAdmin}`);
          
          // Send recent messages to the newly connected client
          const recentMessages = await getRecentMessages();
          ws.send(JSON.stringify({
            type: 'recent_messages',
            messages: recentMessages
          }));
          
          return;
        }
        
        // Ensure client is authenticated for all other message types
        if (!clientInfo) {
          ws.send(JSON.stringify({ type: 'error', error: 'Not authenticated' }));
          return;
        }
        
        // Handle other message types
        switch (data.type) {
          case 'chat_message':
            // Process and broadcast chat message
            if (data.content || (data.hasMedia && data.mediaId)) {
              const newMessage = await createMessage({
                userId: clientInfo.userId,
                content: data.content,
                hasMedia: data.hasMedia || false,
                mediaId: data.mediaId
              });
              
              broadcastMessage(newMessage);
            }
            break;
            
          case 'moderate':
            if (!clientInfo.isAdmin) {
              ws.send(JSON.stringify({ type: 'error', error: 'Unauthorized' }));
              return;
            }
            
            if (data.action === 'delete' && data.messageId) {
              const result = await moderateMessage(data.messageId, clientInfo.userId, data.action, data.notes);
              if (result.success) {
                broadcastModeration(data.messageId, data.action);
              } else {
                ws.send(JSON.stringify({ type: 'error', error: result.error }));
              }
            }
            break;
            
          case 'restore':
            if (!isRootUser(clientInfo.userId)) {
              ws.send(JSON.stringify({ type: 'error', error: 'Unauthorized' }));
              return;
            }
            
            if (data.messageId) {
              const result = await restoreMessage(data.messageId, clientInfo.userId);
              if (result.success) {
                broadcastModeration(data.messageId, 'restore');
              } else {
                ws.send(JSON.stringify({ type: 'error', error: result.error }));
              }
            }
            break;
            
          default:
            ws.send(JSON.stringify({ type: 'error', error: 'Unknown message type' }));
        }
      } catch (error) {
        console.error('Error handling WebSocket message:', error);
        ws.send(JSON.stringify({ type: 'error', error: 'Invalid message format' }));
      }
    });
    
    ws.on('close', () => {
      if (clientInfo) {
        const index = clients.findIndex(c => c.socket === ws);
        if (index >= 0) {
          clients.splice(index, 1);
        }
      }
      console.log('WebSocket connection closed');
    });
  });
}

// Check if user is a root user
async function isRootUser(userId: number): Promise<boolean> {
  const [user] = await db.select({ isRoot: users.isRoot })
    .from(users)
    .where(eq(users.id, userId));
  
  return user?.isRoot === true;
}

// Broadcast a message to all connected clients
function broadcastMessage(message: any) {
  const payload = JSON.stringify({
    type: 'new_message',
    message
  });
  
  clients.forEach(client => {
    if (client.socket.readyState === WebSocket.OPEN) {
      client.socket.send(payload);
    }
  });
}

// Broadcast a moderation action to all connected clients
function broadcastModeration(messageId: number, action: string) {
  const payload = JSON.stringify({
    type: 'moderation',
    messageId,
    action
  });
  
  clients.forEach(client => {
    if (client.socket.readyState === WebSocket.OPEN) {
      client.socket.send(payload);
    }
  });
}

// API Routes

// Get recent messages
export async function getRecentMessages(limit = 50) {
  const messagesWithUsers = await db
    .select({
      id: messages.id,
      content: messages.content,
      userId: messages.userId,
      username: users.username,
      createdAt: messages.createdAt,
      hasMedia: messages.hasMedia,
      isDeleted: messages.isDeleted,
      deletedBy: messages.deletedBy,
      deletedAt: messages.deletedAt
    })
    .from(messages)
    .leftJoin(users, eq(messages.userId, users.id))
    .where(eq(messages.clubIndex, 1995))
    .orderBy(desc(messages.createdAt))
    .limit(limit);
  
  // For messages with media, fetch the media attachments
  const messagesWithMedia = await Promise.all(
    messagesWithUsers.map(async (message) => {
      if (message.hasMedia) {
        const media = await db
          .select()
          .from(mediaAttachments)
          .where(eq(mediaAttachments.messageId, message.id));
        
        return { ...message, media: media[0] || null };
      }
      return message;
    })
  );
  
  return messagesWithMedia;
}

// Create a new message
export async function createMessage({ userId, content, hasMedia = false, mediaId = null }: { userId: number; content: string | null; hasMedia?: boolean; mediaId?: number | null; }) {
  const [message] = await db
    .insert(messages)
    .values({
      userId,
      content,
      hasMedia,
      clubIndex: 1995
    })
    .returning();
  
  // If this message references a previously uploaded media, update it
  if (hasMedia && mediaId) {
    await db
      .update(mediaAttachments)
      .set({ messageId: message.id })
      .where(eq(mediaAttachments.id, mediaId));
  }
  
  // Get the username
  const [user] = await db
    .select({ username: users.username })
    .from(users)
    .where(eq(users.id, userId));
  
  return { ...message, username: user.username };
}

// Upload media file
export async function uploadMedia(req: FileUploadRequest, res: Response) {
  try {
    if (!req.files || Object.keys(req.files).length === 0) {
      return res.status(400).json({ error: 'No files were uploaded' });
    }
    
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const file = req.files.file as fileUpload.UploadedFile;
    const mediaType = file.mimetype.startsWith('image/') ? 'image' : 
                     file.mimetype.startsWith('video/') ? 'video' : 'unknown';
    
    if (mediaType === 'unknown') {
      return res.status(400).json({ error: 'Unsupported file type' });
    }
    
    // Generate a unique filename
    const fileExt = path.extname(file.name);
    const uniqueFilename = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${fileExt}`;
    const filePath = path.join(UPLOAD_DIR, uniqueFilename);
    
    // Move the file to the upload directory
    await file.mv(filePath);
    
    // Create a thumbnail for video files (simplified - in a real app, use ffmpeg)
    let thumbnailPath = null;
    if (mediaType === 'video') {
      // In a real implementation, generate a thumbnail using ffmpeg
      // For now, we'll just use a placeholder
      thumbnailPath = uniqueFilename.replace(fileExt, '-thumb.jpg');
    }
    
    // Create a media attachment record (initially without a message ID)
    const [media] = await db
      .insert(mediaAttachments)
      .values({
        messageId: 0, // Temporary value, will be updated when the message is created
        mediaType,
        mediaPath: `/uploads/${uniqueFilename}`,
        thumbnailPath: thumbnailPath ? `/uploads/${thumbnailPath}` : null
      })
      .returning();
    
    return res.status(200).json({
      id: media.id,
      mediaType,
      mediaPath: `/uploads/${uniqueFilename}`,
      thumbnailPath: thumbnailPath ? `/uploads/${thumbnailPath}` : null
    });
  } catch (error) {
    console.error('Error uploading media:', error);
    return res.status(500).json({ error: 'Failed to upload media' });
  }
}

// Get messages by ID (for retrieving a specific message)
export async function getMessageById(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const messageId = parseInt(id);
    
    const [message] = await db
      .select({
        id: messages.id,
        content: messages.content,
        userId: messages.userId,
        username: users.username,
        createdAt: messages.createdAt,
        hasMedia: messages.hasMedia,
        isDeleted: messages.isDeleted,
        deletedBy: messages.deletedBy,
        deletedAt: messages.deletedAt
      })
      .from(messages)
      .leftJoin(users, eq(messages.userId, users.id))
      .where(eq(messages.id, messageId));
    
    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }
    
    // If message has media, get the media details
    if (message.hasMedia) {
      const [media] = await db
        .select()
        .from(mediaAttachments)
        .where(eq(mediaAttachments.messageId, messageId));
      
      if (media) {
        return res.json({ ...message, media });
      }
    }
    
    return res.json(message);
  } catch (error) {
    console.error('Error getting message:', error);
    return res.status(500).json({ error: 'Server error' });
  }
}

// Get media by message ID
export async function getMediaByMessageId(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const messageId = parseInt(id);
    
    const [media] = await db
      .select()
      .from(mediaAttachments)
      .where(eq(mediaAttachments.messageId, messageId));
    
    if (!media) {
      return res.status(404).json({ error: 'Media not found' });
    }
    
    return res.json(media);
  } catch (error) {
    console.error('Error getting media:', error);
    return res.status(500).json({ error: 'Server error' });
  }
}

// Moderate a message (delete)
export async function moderateMessage(
  messageId: number, 
  userId: number, 
  action: string,
  notes?: string
): Promise<{ success: boolean, error?: string }> {
  try {
    // Check if user is an engineer or root
    const [user] = await db
      .select({
        isEngineer: users.isEngineer,
        isRoot: users.isRoot
      })
      .from(users)
      .where(eq(users.id, userId));
    
    if (!user || (!user.isEngineer && !user.isRoot)) {
      return { success: false, error: 'Unauthorized' };
    }
    
    // Check if the message exists
    const [message] = await db
      .select()
      .from(messages)
      .where(eq(messages.id, messageId));
    
    if (!message) {
      return { success: false, error: 'Message not found' };
    }
    
    // Soft delete the message
    if (action === 'delete') {
      await db
        .update(messages)
        .set({
          isDeleted: true,
          deletedBy: userId,
          deletedAt: new Date()
        })
        .where(eq(messages.id, messageId));
      
      // Log the moderation action
      await db
        .insert(moderationLogs)
        .values({
          messageId,
          userId,
          action,
          notes
        });
      
      return { success: true };
    }
    
    return { success: false, error: 'Invalid action' };
  } catch (error) {
    console.error('Error moderating message:', error);
    return { success: false, error: 'Server error' };
  }
}

// Restore a deleted message (root users only)
export async function restoreMessage(
  messageId: number,
  userId: number
): Promise<{ success: boolean, error?: string }> {
  try {
    // Check if user is a root user
    const [user] = await db
      .select({ isRoot: users.isRoot })
      .from(users)
      .where(eq(users.id, userId));
    
    if (!user || !user.isRoot) {
      return { success: false, error: 'Unauthorized - Root access required' };
    }
    
    // Check if the message exists and is deleted
    const [message] = await db
      .select()
      .from(messages)
      .where(and(
        eq(messages.id, messageId),
        eq(messages.isDeleted, true)
      ));
    
    if (!message) {
      return { success: false, error: 'Message not found or not deleted' };
    }
    
    // Restore the message
    await db
      .update(messages)
      .set({
        isDeleted: false,
        deletedBy: null,
        deletedAt: null
      })
      .where(eq(messages.id, messageId));
    
    // Log the restoration
    await db
      .insert(moderationLogs)
      .values({
        messageId,
        userId,
        action: 'restore'
      });
    
    return { success: true };
  } catch (error) {
    console.error('Error restoring message:', error);
    return { success: false, error: 'Server error' };
  }
}

// Get deleted messages (for root users only)
export async function getDeletedMessages(req: Request, res: Response) {
  try {
    // Check if user is a root user
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const [user] = await db
      .select({ isRoot: users.isRoot })
      .from(users)
      .where(eq(users.id, userId));
    
    if (!user || !user.isRoot) {
      return res.status(403).json({ error: 'Unauthorized - Root access required' });
    }
    
    const page = parseInt(req.query.page?.toString() || '1');
    const limit = parseInt(req.query.limit?.toString() || '50');
    const offset = (page - 1) * limit;
    
    // Get deleted messages with author and moderator info
    const deletedMessages = await db
      .select({
        id: messages.id,
        content: messages.content,
        createdAt: messages.createdAt,
        authorId: messages.userId,
        authorName: users.username,
        deletedBy: messages.deletedBy,
        deletedAt: messages.deletedAt,
        hasMedia: messages.hasMedia
      })
      .from(messages)
      .leftJoin(users, eq(messages.userId, users.id))
      .where(and(
        eq(messages.isDeleted, true),
        eq(messages.clubIndex, 1995)
      ))
      .orderBy(desc(messages.deletedAt))
      .limit(limit)
      .offset(offset);
    
    // For each deleted message, get the moderator name
    const messagesWithModeratorInfo = await Promise.all(
      deletedMessages.map(async (message) => {
        if (message.deletedBy) {
          const [moderator] = await db
            .select({ username: users.username })
            .from(users)
            .where(eq(users.id, message.deletedBy));
          
          return {
            ...message,
            moderatorName: moderator?.username
          };
        }
        return message;
      })
    );
    
    // Get total count for pagination
    const [count] = await db
      .select({ count: sql`count(*)` })
      .from(messages)
      .where(and(
        eq(messages.isDeleted, true),
        eq(messages.clubIndex, 1995)
      ));
    
    return res.json({
      messages: messagesWithModeratorInfo,
      pagination: {
        total: parseInt(count.count.toString()),
        page,
        limit,
        pages: Math.ceil(parseInt(count.count.toString()) / limit)
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