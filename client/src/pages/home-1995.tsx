import { useAuth } from "@/hooks/use-auth";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";

export default function Home1995Page() {
  const { user } = useAuth();

  return (
    <div className="min-h-screen flex flex-col bg-black">
      <Header />
      <main className="flex-1 container mx-auto px-4 py-8">
        {/* Blank black page as requested */}
      </main>
      <Footer />
    </div>
  );
}