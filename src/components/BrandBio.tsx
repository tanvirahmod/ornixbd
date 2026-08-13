interface BrandBioProps {
  onNavigate: (page: string) => void;
}

export default function BrandBio({ onNavigate }: BrandBioProps) {
  return (
    <section className="bg-black text-white py-16 md:py-24 px-4 sm:px-6">
      <div className="max-w-4xl mx-auto text-center">
        {/* Eyebrow */}
        <p className="text-xs font-bold tracking-[0.4em] uppercase text-[#D90429] mb-5">
          Our Story
        </p>

        {/* Big heading */}
        <h2
          className="font-display text-white uppercase leading-none mb-8"
          style={{ fontSize: 'clamp(2.5rem, 7vw, 6rem)', letterSpacing: '0.04em' }}
        >
          WEAR THE CULTURE.
          <br />
          LIVE THE STREETS.
        </h2>

        {/* Divider */}
        <div className="flex items-center justify-center gap-4 mb-8">
          <span className="flex-1 max-w-24 h-px bg-white/20" />
          <span className="text-[#D90429] text-xl">✦</span>
          <span className="flex-1 max-w-24 h-px bg-white/20" />
        </div>

        {/* Brand story */}
        <p className="text-white/70 text-base sm:text-lg leading-relaxed max-w-2xl mx-auto mb-4 font-medium">
          LEON OUTFITS was born in the streets of Bangladesh — built for those who
          move with purpose and dress with intent. We craft every piece using
          premium fabrics that hold their shape, color, and structure wash after
          wash.
        </p>
        <p className="text-white/55 text-sm sm:text-base leading-relaxed max-w-xl mx-auto mb-12">
          From drop-shoulder tees to statement hoodies, our collections blend
          urban streetwear culture with Bangladeshi craftsmanship. Durable. Bold.
          Unapologetically you.
        </p>

        {/* CTA */}
        <button
          onClick={() => onNavigate('shop')}
          className="bg-white text-black font-bold uppercase tracking-[0.2em] text-sm px-12 py-4 hover:bg-[#D90429] hover:text-white transition-all duration-200"
        >
          SHOP NOW
        </button>

        {/* Stats row */}
        <div className="mt-16 grid grid-cols-3 gap-6 border-t border-white/10 pt-12">
          {[
            { value: '500+', label: 'Products Delivered' },
            { value: '100%', label: 'Quality Assured' },
            { value: 'BD', label: 'Made in Bangladesh' },
          ].map((stat) => (
            <div key={stat.label} className="text-center">
              <p
                className="font-display text-white uppercase"
                style={{ fontSize: 'clamp(1.8rem, 5vw, 3.5rem)' }}
              >
                {stat.value}
              </p>
              <p className="text-white/40 text-xs font-semibold tracking-[0.2em] uppercase mt-1">
                {stat.label}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
