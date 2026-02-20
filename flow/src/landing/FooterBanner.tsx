import { Circle } from "lucide-react";

export default function FooterBanner() {
  return (
    <footer className="landing-footer">
      <Circle size={6} className="landing-footer-dot" fill="currentColor" />
      <p className="landing-footer-text">
        Tempo&apos;s public testnet is now live.{" "}
        <a href="#" className="landing-footer-link">
          Explore features &amp; use cases
        </a>
      </p>
    </footer>
  );
}
