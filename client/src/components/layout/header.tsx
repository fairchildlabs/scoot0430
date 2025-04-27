import { ScootLogo } from "../logos/scoot-logo";
import { Button } from "../ui/button";
import { useAuth } from "@/hooks/use-auth";
import { useVersion } from "@/hooks/use-version";
import { Link, useLocation } from "wouter";
import { Badge } from "../ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronDown, Menu } from "lucide-react";

export function Header() {
  const { user, logoutMutation } = useAuth();
  const { version, setVersion } = useVersion();
  const [, setLocation] = useLocation();

  function getUserPermissions(user: any) {
    const permissions = [];
    if (user.isPlayer) permissions.push('Player');
    if (user.isBank) permissions.push('Bank');
    if (user.isBook) permissions.push('Book');
    if (user.isEngineer) permissions.push('Engineer');
    if (user.isRoot) permissions.push('Root');
    return permissions;
  }
  
  return (
    <header className="bg-black border-b border-border">
      <div className="container mx-auto px-4 h-16 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ScootLogo className="h-8 w-8 text-white" />
          <DropdownMenu>
            <DropdownMenuTrigger className="flex items-center gap-1 focus:outline-none">
              <span className="text-white font-bold text-xl">{version}</span>
              <ChevronDown className="h-4 w-4 text-white" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem 
                onSelect={() => {
                  setVersion("Scoot(34)");
                  setLocation("/");
                }}
              >
                Scoot(34)
              </DropdownMenuItem>
              <DropdownMenuItem 
                onSelect={() => {
                  setVersion("Scoot(1995)");
                  setLocation("/");
                }}
              >
                Scoot(1995)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {user ? (
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-white opacity-70">{user.username}</span>
              <div className="hidden md:flex gap-1">
                {getUserPermissions(user).map((permission) => (
                  <Badge key={permission} variant="outline" className="text-xs">
                    {permission}
                  </Badge>
                ))}
              </div>
            </div>
            
            {/* Navigation Dropdown Menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="flex items-center">
                  <Menu className="h-5 w-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem asChild>
                  <Link href="/">Home</Link>
                </DropdownMenuItem>
                
                {/* Show Players and Games options only in Scoot(34) for admins */}
                {(user.isEngineer || user.isRoot) && version !== "Scoot(1995)" && (
                  <>
                    <DropdownMenuItem asChild>
                      <Link href="/users">Players</Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link href="/games">Games</Link>
                    </DropdownMenuItem>
                  </>
                )}
                
                <DropdownMenuItem 
                  onSelect={() => logoutMutation.mutate()}
                  disabled={logoutMutation.isPending}
                >
                  Logout
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ) : (
          <Link href="/auth">
            <Button>Login</Button>
          </Link>
        )}
      </div>
    </header>
  );
}