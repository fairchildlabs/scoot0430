import { ScootLogo } from "../logos/scoot-logo";
import { Button } from "../ui/button";
import { useAuth } from "@/hooks/use-auth";
import { Link } from "wouter";
import { Badge } from "../ui/badge";

export function Header() {
  const { user, logoutMutation } = useAuth();

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
        <Link href="/" className="flex items-center gap-2">
          <ScootLogo className="h-8 w-8 text-white" />
          <span className="text-white font-bold text-xl">Scoot</span>
        </Link>

        {user ? (
          <div className="flex items-center gap-4">
            {(user.isEngineer || user.isRoot) && (
              <>
                <Link href="/users">
                  <Button variant="outline">Players</Button>
                </Link>
                <Link href="/games">
                  <Button variant="outline">Games</Button>
                </Link>
              </>
            )}
            <div className="flex items-center gap-2">
              <span className="text-white opacity-70">{user.username}</span>
              <div className="flex gap-1">
                {getUserPermissions(user).map((permission) => (
                  <Badge key={permission} variant="outline" className="text-xs">
                    {permission}
                  </Badge>
                ))}
              </div>
            </div>
            <Button 
              variant="outline" 
              onClick={() => logoutMutation.mutate()}
              disabled={logoutMutation.isPending}
            >
              Logout
            </Button>
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