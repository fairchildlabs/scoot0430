import { useState, useRef, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Maximize2, Volume2, VolumeX } from "lucide-react";

interface Media {
  id: number;
  mediaType: string;
  mediaPath: string;
  thumbnailPath: string | null;
}

interface MediaDisplayProps {
  media: Media;
}

export function MediaDisplay({ media }: MediaDisplayProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);
  
  // Close handler for escape key
  useEffect(() => {
    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };
    
    if (isOpen) {
      window.addEventListener('keydown', handleEsc);
    }
    
    return () => {
      window.removeEventListener('keydown', handleEsc);
    };
  }, [isOpen]);
  
  // Handle right-click to prevent download
  const preventContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    return false;
  };
  
  // Render different media types
  const renderMedia = () => {
    if (media.mediaType === 'image') {
      return (
        <img
          src={media.mediaPath}
          alt="Shared image"
          className="max-w-full max-h-96 rounded-md object-contain"
          onContextMenu={preventContextMenu}
          style={{ pointerEvents: 'none' }} // Prevent dragging
        />
      );
    } else if (media.mediaType === 'video') {
      return (
        <div className="relative">
          <video
            ref={videoRef}
            src={media.mediaPath}
            className="max-w-full max-h-96 rounded-md"
            controls={false} // Disable browser controls
            autoPlay={false}
            loop
            muted={isMuted}
            onContextMenu={preventContextMenu}
            style={{ pointerEvents: 'none' }} // Prevent dragging
          />
          <div className="absolute bottom-2 right-2 flex space-x-2">
            <Button
              size="icon"
              variant="secondary"
              className="h-8 w-8 bg-black bg-opacity-50 hover:bg-opacity-70"
              onClick={() => setIsMuted(!isMuted)}
            >
              {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      );
    }
    return <div>Unsupported media type</div>;
  };
  
  // Render thumbnail or smaller version for the chat
  const renderThumbnail = () => {
    if (media.mediaType === 'image') {
      return (
        <div className="relative group">
          <img
            src={media.mediaPath}
            alt="Shared image"
            className="max-w-full max-h-48 rounded-md object-contain group-hover:opacity-90"
            onContextMenu={preventContextMenu}
            style={{ pointerEvents: 'none' }} // Prevent dragging
          />
          <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button
              size="icon"
              variant="secondary"
              className="h-7 w-7 bg-black bg-opacity-50 hover:bg-opacity-70"
              onClick={() => setIsOpen(true)}
            >
              <Maximize2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      );
    } else if (media.mediaType === 'video') {
      return (
        <div className="relative group">
          <video
            src={media.mediaPath}
            className="max-w-full max-h-48 rounded-md"
            poster={media.thumbnailPath || undefined}
            onContextMenu={preventContextMenu}
            style={{ pointerEvents: 'none' }} // Prevent dragging
          />
          <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button
              size="icon"
              variant="secondary"
              className="h-7 w-7 bg-black bg-opacity-50 hover:bg-opacity-70"
              onClick={() => {
                setIsOpen(true);
                // Reset mute state when opening
                setIsMuted(true);
              }}
            >
              <Maximize2 className="h-4 w-4" />
            </Button>
          </div>
          <div className="absolute inset-0 bg-black bg-opacity-40 flex items-center justify-center group-hover:bg-opacity-20">
            <span className="text-4xl">▶️</span>
          </div>
        </div>
      );
    }
    return <div>Unsupported media type</div>;
  };
  
  // Play/pause when dialog opens/closes
  useEffect(() => {
    if (videoRef.current) {
      if (isOpen) {
        videoRef.current.play().catch(error => {
          console.error("Video play error:", error);
        });
      } else {
        videoRef.current.pause();
      }
    }
  }, [isOpen]);
  
  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <div className="cursor-pointer">
          {renderThumbnail()}
        </div>
      </DialogTrigger>
      <DialogContent className="max-w-screen-lg w-auto p-1 sm:p-2 bg-gray-900">
        <div className="flex justify-center items-center">
          {renderMedia()}
        </div>
      </DialogContent>
    </Dialog>
  );
}