import Navigation from "@/landing/Navigation";
import HeroSection from "@/landing/HeroSection";
import DataFeed from "@/landing/DataFeed";
import FooterBanner from "@/landing/FooterBanner";

export default function Home() {
  return (
    <main className="landing-root">
      <Navigation />
      <div className="landing-body">
        <HeroSection />
        <DataFeed />
      </div>
      <FooterBanner />
    </main>
  );
}
