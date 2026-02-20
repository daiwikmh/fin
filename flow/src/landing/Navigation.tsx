import { Target } from "lucide-react";

export default function Navigation() {
  return (
    <nav className="landing-nav">
      <div className="landing-nav-brand">
        <Target size={16} className="landing-nav-brand-icon" />
        <span className="landing-nav-brand-name">Tempo</span>
      </div>

      <div className="landing-nav-links">
        <a href="#" className="landing-nav-link">Learn</a>
        <a href="#" className="landing-nav-link landing-nav-link--active">Docs</a>
        <a href="#" className="landing-nav-link">Ecosystem</a>
        <a href="#" className="landing-nav-link">Blog</a>
      </div>
    </nav>
  );
}
