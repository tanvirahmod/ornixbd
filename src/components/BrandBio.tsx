import { ArrowRight, MoveUpRight } from 'lucide-react';

interface BrandBioProps {
  onNavigate: (page: string) => void;
}

const STATS = [
  { value: '10K+', label: 'Pieces out in the world' },
  { value: '100%', label: 'Quality, no shortcuts' },
  { value: 'BD', label: 'Proudly made here' },
];

export default function BrandBio({ onNavigate }: BrandBioProps) {
  return (
    <section className="editorial-story" data-watermark="ORNIX">
      <div className="editorial-story__inner">
        <div className="editorial-story__intro">
          <p className="editorial-eyebrow"><span>04</span> / MORE THAN WHAT YOU WEAR</p>
          <h2>
            MADE HERE.
            <br />
            <span>WORN</span> EVERYWHERE.
          </h2>
          <button
            onClick={() => onNavigate('story')}
            className="editorial-round-link editorial-round-link--light mt-8 inline-flex items-center gap-3"
          >
            GET TO KNOW US <MoveUpRight aria-hidden="true" size={16} />
          </button>
        </div>

        <div className="editorial-story__manifesto">
          <span className="editorial-story__mark" aria-hidden="true">BD</span>
          <p className="editorial-story__lead">
            ORNIX was born in Bangladesh for people who move with purpose and
            dress with intent.
          </p>
          <p className="editorial-story__body">
            Thoughtful fits. Fabrics that last. Local craftsmanship with a
            point of view. We make everyday streetwear feel like your own.
          </p>
          <div className="editorial-story__signature">
            <span className="editorial-story__signature-line" />
            <span>BUILT FOR THE WAY YOU MOVE</span>
            <ArrowRight aria-hidden="true" size={15} />
          </div>
        </div>
      </div>

      <div className="editorial-story__stats">
        <div className="editorial-story__stats-inner">
          {STATS.map((stat, index) => (
            <div className="editorial-story__stat" key={stat.label}>
              <span className="editorial-story__stat-index">0{index + 1}</span>
              <strong>{stat.value}</strong>
              <span>{stat.label}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
