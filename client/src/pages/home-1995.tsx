import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Chat } from "@/components/chat/Chat";
import { ModerationLog } from "@/components/chat/ModerationLog";
import { MessageCircle, ShieldAlert } from "lucide-react";

export default function Home1995Page() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState("chat");
  
  // Only root users can access the moderation log
  const showModerationTab = user?.isRoot;
  
  return (
    <div className="min-h-screen flex flex-col bg-black">
      <Header />
      <main className="flex-1 container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          {user ? (
            <Tabs defaultValue="chat" value={activeTab} onValueChange={setActiveTab}>
              <div className="flex items-center justify-between mb-4">
                <h1 className="text-2xl font-bold">Scoot(1995)</h1>
                <TabsList className="bg-gray-900">
                  <TabsTrigger value="chat" className="flex items-center gap-1">
                    <MessageCircle className="h-4 w-4" />
                    <span>Chat</span>
                  </TabsTrigger>
                  {showModerationTab && (
                    <TabsTrigger value="moderation" className="flex items-center gap-1">
                      <ShieldAlert className="h-4 w-4" />
                      <span>Moderation</span>
                    </TabsTrigger>
                  )}
                </TabsList>
              </div>
              
              <TabsContent value="chat" className="mt-0">
                <Chat />
              </TabsContent>
              
              {showModerationTab && (
                <TabsContent value="moderation" className="mt-0">
                  <ModerationLog />
                </TabsContent>
              )}
            </Tabs>
          ) : (
            <div className="flex flex-col items-center justify-center py-16">
              <h1 className="text-3xl font-bold mb-6">Welcome to Scoot(1995)</h1>
              <p className="text-lg text-gray-400 mb-8">
                Please log in to join the conversation.
              </p>
              <Button 
                onClick={() => window.location.href = "/auth"}
                className="px-6 py-2"
              >
                Login
              </Button>
            </div>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}