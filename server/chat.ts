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
          
          console.log(`WebSocket auth attempt - userId: ${userId}, isAdmin: ${isAdmin}`);
          
          // Check if userId is null, undefined or not a number
          // Note: We must allow userID 0 as a valid ID
          if (userId === null || userId === undefined || isNaN(Number(userId))) {
            console.log('Authentication failed: Invalid user ID');
            socket.send(JSON.stringify({
              type: 'error',
              error: 'Authentication failed: Invalid user ID'
            }));
            return;
          }
          
          try {
            // Verify user exists in database
            const [user] = await db
              .select()
              .from(users)
              .where(eq(users.id, userId));
            
            if (!user) {
              console.log(`Authentication failed: User ID ${userId} not found`);
              socket.send(JSON.stringify({
                type: 'error',
                error: 'Authentication failed: User not found'
              }));
              return;
            }
            
            // Debug successful user lookup
            console.log(`User found: ${user.username} (ID: ${userId}), isRoot: ${user.isRoot}, isEngineer: ${user.isEngineer}`);
            
            // Store client information with verified data
            const isUserAdmin = user.isRoot || user.isEngineer;
            clients.set(socket, { 
              socket, 
              userId, 
              isAdmin: isUserAdmin
            });
            
            // Send authentication confirmation
            socket.send(JSON.stringify({
              type: 'auth_success',
              user: {
                id: user.id,
                username: user.username,
                isAdmin: isUserAdmin
              }
            }));
            
            // Send recent messages to the new user
            // Only include deleted messages for admins
            const recentMessages = await getRecentMessages(50, isUserAdmin);
            socket.send(JSON.stringify({
              type: 'messages',
              messages: recentMessages
            }));
            
            console.log(`User ${user.username} (${userId}) authenticated with WebSocket${isUserAdmin ? ' (admin)' : ''}`);
          } catch (error) {
            console.error('Error during WebSocket authentication:', error);
            socket.send(JSON.stringify({
              type: 'error',
              error: 'Authentication error: Server error'
            }));
          }
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
          console.log(`Deleting message ${messageId} by moderator ${client.userId}`);
          try {
            // First update message in database
            const updatedMessage = await moderateMessage(messageId, client.userId);
            console.log(`Message ${messageId} marked as deleted in database`);
            
            // Get moderator's username for logging
            const moderator = await db
              .select({ username: users.username })
              .from(users)
              .where(eq(users.id, client.userId))
              .then(rows => rows[0]);
            
            console.log(`Moderator: ${moderator?.username || 'Unknown'} (${client.userId})`);
            
            // Broadcast deletion to all clients
            await broadcastModeration(messageId, 'delete');
            console.log(`Moderation broadcast completed for message ${messageId}`);
          } catch (error) {
            console.error(`Error processing delete for message ${messageId}:`, error);
            socket.send(JSON.stringify({
              type: 'error',
              error: 'Failed to delete message. Please try again.'
            }));
            return;
          }
          
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
          console.log(`Restoring message ${messageId} by moderator ${client.userId}`);
          try {
            // First update message in database
            const updatedMessage = await restoreMessage(messageId, client.userId);
            console.log(`Message ${messageId} restored in database`);
            
            // Broadcast restoration to all clients
            await broadcastModeration(messageId, 'restore');
            console.log(`Restoration broadcast completed for message ${messageId}`);
          } catch (error) {
            console.error(`Error restoring message ${messageId}:`, error);
            socket.send(JSON.stringify({
              type: 'error',
              error: 'Failed to restore message. Please try again.'
            }));
            return;
          }
          
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
// Get the message to be moderated, get the moderator user info, and broadcast to all clients
async function broadcastModeration(messageId: number, action: string) {
  try {
    const now = new Date().toISOString();
    
    // Get the message to retrieve the moderator info
    const [message] = await db
      .select()
      .from(messages)
      .where(eq(messages.id, messageId));
    
    if (!message) {
      console.error(`Cannot broadcast moderation: Message ${messageId} not found`);
      return;
    }
    
    // Get moderator info
    const moderatorId = message.deletedBy || 0;
    let moderatorName = '';
    
    if (moderatorId) {
      const [moderator] = await db
        .select({ username: users.username })
        .from(users)
        .where(eq(users.id, moderatorId));
      
      if (moderator) {
        moderatorName = moderator.username;
      }
    }
    
    // Create the moderation message
    const moderationMsg = JSON.stringify({
      type: 'moderation',
      action: action,
      messageId: messageId,
      timestamp: now,
      moderatorId: moderatorId,
      moderatorName: moderatorName
    });
    
    // Broadcast to all clients
    Array.from(clients.entries()).forEach(([socket, client]) => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(moderationMsg);
      }
    });
  } catch (error) {
    console.error('Error broadcasting moderation:', error);
  }
}

// Get recent messages
export async function getRecentMessages(limit = 50, includeDeleted = false) {
  try {
    // Get messages
    let baseQuery;
    
    if (includeDeleted) {
      // If we want to include deleted messages, just filter by clubIndex
      baseQuery = db
        .select()
        .from(messages)
        .where(eq(messages.clubIndex, 1995));
    } else {
      // If we don't want deleted messages, filter by both clubIndex and isDeleted
      baseQuery = db
        .select()
        .from(messages)
        .where(and(
          eq(messages.clubIndex, 1995),
          eq(messages.isDeleted, false)
        ));
    }
    
    const rawMessages = await baseQuery
      .orderBy(asc(messages.createdAt))
      .limit(limit);
    
    console.log(`Retrieved ${rawMessages.length} messages${includeDeleted ? ' (including deleted)' : ' (excluding deleted)'}`);
    
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
  console.log("Upload request received");
  
  if (!req.isAuthenticated()) {
    console.log("Upload rejected: User not authenticated");
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  console.log("Upload request files:", req.files ? 
    `${Object.keys(req.files).length} files received` : 
    "No files received");
  
  if (!req.files || Object.keys(req.files).length === 0) {
    console.log("Upload rejected: No files in request");
    return res.status(400).json({ error: 'No files were uploaded' });
  }
  
  try {
    // Make sure uploads directory exists
    const uploadsDir = await ensureUploadDirExists();
    console.log("Upload directory confirmed:", uploadsDir);
    
    // Get the file
    const file = req.files.file as fileUpload.UploadedFile;
    console.log("Upload file details:", {
      name: file.name,
      size: `${(file.size / (1024 * 1024)).toFixed(2)} MB`,
      mimetype: file.mimetype,
      tempFilePath: file.tempFilePath,
      md5: file.md5
    });
    
    // Check file type
    const fileType = file.mimetype.split('/')[0];
    if (fileType !== 'image' && fileType !== 'video') {
      console.log(`Upload rejected: Unsupported file type: ${fileType}`);
      return res.status(400).json({ 
        error: 'Unsupported file type. Only images and videos are allowed.' 
      });
    }
    
    // Check file size (1GB limit)
    const fileSizeMB = file.size / (1024 * 1024);
    console.log(`File size: ${fileSizeMB.toFixed(2)} MB of 1024 MB limit`);
    
    if (file.size > 1024 * 1024 * 1024) {
      console.log(`Upload rejected: File size (${fileSizeMB.toFixed(2)} MB) exceeds 1GB limit`);
      return res.status(400).json({ 
        error: 'File size exceeds the limit (1GB)' 
      });
    }
    
    // Generate a unique filename
    const fileExt = path.extname(file.name);
    const uniqueFileName = `${uuidv4()}${fileExt}`;
    const filePath = path.join(uploadsDir, uniqueFileName);
    
    console.log(`Generated unique filename: ${uniqueFileName}`);
    console.log(`Target file path: ${filePath}`);
    
    try {
      // Move the file to the uploads directory
      console.log(`Moving temp file from ${file.tempFilePath} to ${filePath}`);
      await file.mv(filePath);
      console.log("File successfully moved to destination");
      
      // Verify the file was moved successfully
      try {
        const fileStats = await statAsync(filePath);
        console.log(`Destination file verified, size: ${(fileStats.size / (1024 * 1024)).toFixed(2)} MB`);
      } catch (error) {
        const statErr = error as Error;
        console.error(`Failed to verify destination file: ${statErr.message}`);
      }
      
      // Create a thumbnail for videos (use placeholder for now)
      let thumbnailPath = null;
      if (fileType === 'video') {
        thumbnailPath = '/video-placeholder.png';
        console.log("Added video placeholder thumbnail");
      }
      
      console.log("Creating message entry in database...");
      // First create a message with hasMedia flag
      const [message] = await db
        .insert(messages)
        .values({
          userId: req.user!.id,
          content: null,
          hasMedia: true,
          clubIndex: 1995, // Scoot(1995)
          createdAt: new Date()
        })
        .returning();
      console.log(`Message created with ID: ${message.id}`);
      
      console.log("Creating media attachment entry in database...");
      // Then save media information to database with the message ID
      const [media] = await db
        .insert(mediaAttachments)
        .values({
          userId: req.user!.id,
          messageId: message.id,
          mediaType: fileType,
          mediaPath: `/uploads/${uniqueFileName}`,
          thumbnailPath,
          createdAt: new Date()
        })
        .returning();
      console.log(`Media attachment created with ID: ${media.id}`);
      
      console.log(`Updating message ${message.id} with media ID ${media.id}`);
      // Update the message with the media ID
      await db
        .update(messages)
        .set({ mediaId: media.id })
        .where(eq(messages.id, message.id));
      
      console.log("Upload process completed successfully");
      // Return the media information
      res.json({ 
        mediaId: media.id,
        mediaType: media.mediaType,
        mediaPath: media.mediaPath,
        messageId: message.id
      });
    } catch (mvError) {
      console.error("Error during file handling:", mvError);
      // Try to provide more detailed error info
      const errorDetails = mvError instanceof Error ? 
        { message: mvError.message, stack: mvError.stack } : 
        { raw: String(mvError) };
      
      console.error("Error details:", JSON.stringify(errorDetails, null, 2));
      
      res.status(500).json({ 
        error: 'Failed to process uploaded file',
        details: mvError instanceof Error ? mvError.message : 'Unknown error'
      });
    }
  } catch (error) {
    console.error('Error uploading media:', error);
    // Try to provide more detailed error info
    const errorDetails = error instanceof Error ? 
      { message: error.message, stack: error.stack } : 
      { raw: String(error) };
    
    console.error("Error details:", JSON.stringify(errorDetails, null, 2));
    
    res.status(500).json({ 
      error: 'Failed to upload media',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
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