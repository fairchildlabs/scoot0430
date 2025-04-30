import { useState, useRef, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogTrigger,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Maximize2, Volume2, VolumeX, Maximize, MinusCircle } from "lucide-react";

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
  const [isPlaying, setIsPlaying] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const videoContainerRef = useRef<HTMLDivElement>(null);
  
  // Close handler for escape key
  useEffect(() => {
    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (isFullscreen) {
          exitFullscreen();
        } else {
          setIsOpen(false);
        }
      }
    };
    
    window.addEventListener('keydown', handleEsc);
    
    return () => {
      window.removeEventListener('keydown', handleEsc);
    };
  }, [isOpen, isFullscreen]);
  
  // Handle right-click to prevent download
  const preventContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    return false;
  };

  // Toggle video play/pause
  const togglePlay = () => {
    if (!videoRef.current) return;
    
    if (videoRef.current.paused) {
      videoRef.current.play().then(() => {
        setIsPlaying(true);
      }).catch(error => {
        console.error("Video play error:", error);
      });
    } else {
      videoRef.current.pause();
      setIsPlaying(false);
    }
  };

  // Toggle fullscreen for video
  const toggleFullscreen = () => {
    if (!videoContainerRef.current) return;
    
    if (!isFullscreen) {
      if (videoContainerRef.current.requestFullscreen) {
        videoContainerRef.current.requestFullscreen();
      }
      setIsFullscreen(true);
    } else {
      exitFullscreen();
    }
  };

  // Exit fullscreen
  const exitFullscreen = () => {
    if (document.exitFullscreen) {
      document.exitFullscreen();
    }
    setIsFullscreen(false);
  };

  // Listen for fullscreen changes
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);
  
  // Render images
  const renderImage = () => {
    return (
      <img
        src={media.mediaPath}
        alt="Shared image"
        className="max-w-full max-h-96 rounded-md object-contain"
        onContextMenu={preventContextMenu}
        style={{ pointerEvents: 'none' }} // Prevent dragging
      />
    );
  };

  // Render videos directly in chat
  const renderVideo = (isInline = false) => {
    return (
      <div 
        ref={videoContainerRef}
        className={`relative ${isInline ? 'w-full max-w-[500px]' : 'max-w-full'}`}
      >
        <video
          ref={videoRef}
          src={media.mediaPath}
          className={`rounded-md ${isInline ? 'w-full max-h-[300px]' : 'max-w-full max-h-96'}`}
          controls={true} // Enable native controls for better handling of large videos
          controlsList="nodownload" // Prevent download button in controls
          autoPlay={false}
          loop={false}
          muted={isMuted}
          onContextMenu={preventContextMenu}
          poster={media.thumbnailPath || undefined}
          preload={isInline ? "metadata" : "auto"} // Only preload metadata for inline videos
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
        />
        {!isInline && (
          <div className="absolute top-2 right-2 flex space-x-2">
            <Button
              size="icon"
              variant="secondary"
              className="h-8 w-8 bg-black bg-opacity-50 hover:bg-opacity-70"
              onClick={(e) => {
                e.stopPropagation();
                toggleFullscreen();
              }}
              title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
            >
              {isFullscreen ? <MinusCircle className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
            </Button>
          </div>
        )}
      </div>
    );
  };
  
  // Render thumbnail for images
  const renderImageThumbnail = () => {
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
            title="Enlarge"
          >
            <Maximize2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  };
  
  // Based on media type, render the appropriate component
  const renderMedia = () => {
    if (media.mediaType === 'image') {
      return renderImage();
    } else if (media.mediaType === 'video') {
      return renderVideo();
    }
    return <div>Unsupported media type</div>;
  };
  
  // For images, show thumbnail; for videos, render inline
  const renderContent = () => {
    if (media.mediaType === 'image') {
      return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogTrigger asChild>
            <div className="cursor-pointer">
              {renderImageThumbnail()}
            </div>
          </DialogTrigger>
          <DialogContent className="max-w-screen-lg w-auto p-1 sm:p-2 bg-gray-900">
            <DialogTitle className="sr-only">Image Viewer</DialogTitle>
            <div className="flex justify-center items-center">
              {renderImage()}
            </div>
          </DialogContent>
        </Dialog>
      );
    } else if (media.mediaType === 'video') {
      // Videos render directly in the chat
      return renderVideo(true);
    }
    return <div>Unsupported media type</div>;
  };
  
  return renderContent();
}