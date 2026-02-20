import Navigation from "@/landing/Navigation";
import HeroSection from "@/landing/HeroSection";
import DataFeed from "@/landing/DataFeed";
import FooterBanner from "@/landing/FooterBanner";

export default function LandingPage() {
  return (
    <main className="flex flex-col h-screen bg-[#0d0d0d] overflow-hidden">
      <Navigation />
      <div className="flex flex-1 overflow-hidden">
        <HeroSection />
        <DataFeed />
      </div>
      <FooterBanner />
    </main>
  );
}
