import { ArrowRight } from "lucide-react";

export default function HeroSection() {
  return (
    <section className="landing-hero">
      <div className="landing-hero-content">
        <div className="landing-hero-copy">
          <h1 className="landing-hero-heading">
            The blockchain<br />for payments<br />at scale
          </h1>
          <p className="landing-hero-subtext">
            Tempo is a purpose-built, Layer 1 blockchain for payments, developed
            in partnership with leading fintechs and Fortune 500s. Tempo enables
            high-throughput, low-cost global transactions for any use case.
          </p>
        </div>

        <div className="landing-hero-actions">
          <a href="#" className="landing-btn-primary">
            Integrate testnet <ArrowRight size={14} />
          </a>
          <a href="#" className="landing-btn-secondary">
            Read announcement <ArrowRight size={14} />
          </a>
        </div>
      </div>
    </section>
  );
}
