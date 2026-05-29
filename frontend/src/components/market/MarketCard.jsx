import { motion } from 'framer-motion';
import { Heart, TrendingUp } from 'lucide-react';
import { Link } from 'react-router-dom';
import Badge from '../common/Badge';
import RewardsBadge from '../common/RewardsBadge';
import useFavorites from '../../hooks/useFavorites';
import useAuthStore from '../../store/authStore';
import { formatVolume } from '../../utils/format';

const CATEGORY_COLORS = {
  crypto:   { bg: '#f97316', text: '#fff' },
  sports:   { bg: '#22c55e', text: '#fff' },
  politics: { bg: '#3b82f6', text: '#fff' },
  finance:  { bg: '#a855f7', text: '#fff' },
  weather:  { bg: '#06b6d4', text: '#fff' },
  news:     { bg: '#ef4444', text: '#fff' },
};

const MarketIcon = ({ market }) => {
  const isUrl = market.image && (market.image.startsWith('http') || market.image.startsWith('/'));
  if (isUrl) {
    return (
      <img
        src={market.image}
        alt={market.title}
        className="w-10 h-10 rounded-xl object-cover"
        onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex'; }}
      />
    );
  }
  const { bg, text } = CATEGORY_COLORS[market.categorySlug] || { bg: '#6b7280', text: '#fff' };
  const initial = market.title?.charAt(0)?.toUpperCase() || '?';
  return (
    <div className="w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold flex-shrink-0" style={{ backgroundColor: bg, color: text }}>
      {initial}
    </div>
  );
};

const MarketCard = ({ market, className = '' }) => {
  const { toggleFavorite, isFavorited } = useFavorites();
  const { openAuthModal } = useAuthStore();
  if (!market) return null;

  const yes = market.outcomes?.[0];
  const no = market.outcomes?.[1];
  const favorited = isFavorited(market._id);

  const handleFav = (e) => {
    e.preventDefault();
    e.stopPropagation();
    toggleFavorite(market._id);
  };

  return (
    <motion.div
      whileHover={{ y: -2, boxShadow: '0 8px 30px rgba(212,175,55,0.1)' }}
      transition={{ duration: 0.2 }}
      className={`bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl overflow-hidden hover:border-[var(--color-gold)]/40 transition-colors group ${className}`}
    >
      <Link to={`/market/${market.slug}`} className="block p-4">
        <div className="flex items-start gap-3 mb-3">
          <div className="flex-shrink-0">
            <MarketIcon market={market} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start gap-2 mb-1">
              {market.isNewMarket && <Badge color="new" className="flex-shrink-0 mt-0.5">NEW</Badge>}
              <h3 className="text-sm font-medium text-[var(--color-text)] leading-tight line-clamp-2 group-hover:text-[var(--color-gold)] transition-colors">
                {market.title}
              </h3>
            </div>
            <div className="flex items-center gap-2 text-xs text-[var(--color-text-muted)]">
              <span className="capitalize">{market.categorySlug}</span>
              {market.endDate && (
                <>
                  <span>•</span>
                  <span>{new Date(market.endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                </>
              )}
            </div>
          </div>
          <button
            onClick={handleFav}
            className="flex-shrink-0 p-1.5 rounded-lg text-[var(--color-text-muted)] hover:text-red-400 hover:bg-red-500/10 transition-colors"
          >
            <Heart className={`w-4 h-4 ${favorited ? 'fill-red-400 text-red-400' : ''}`} />
          </button>
        </div>

        <div className="space-y-2 mb-3">
          <div className="flex gap-2">
            {yes && (
              <div className="flex-1 bg-green-500/10 border border-green-500/20 rounded-lg px-3 py-2 text-center">
                <div className="text-[var(--color-green)] font-bold text-sm">{yes.price}¢</div>
                <div className="text-[var(--color-text-muted)] text-xs">Yes</div>
              </div>
            )}
            {no && (
              <div className="flex-1 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 text-center">
                <div className="text-[var(--color-red)] font-bold text-sm">{no.price}¢</div>
                <div className="text-[var(--color-text-muted)] text-xs">No</div>
              </div>
            )}
          </div>

          <div className="w-full h-1.5 bg-[var(--color-surface2)] rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-[var(--color-green)] to-[var(--color-red)] rounded-full"
              style={{ width: `${yes?.probability || 50}%` }}
            />
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1 text-xs text-[var(--color-text-muted)]">
            <TrendingUp className="w-3 h-3" />
            <span>{formatVolume(market.volume)} Vol.</span>
          </div>
          {market.rewards > 0 && <RewardsBadge percent={market.rewards} size="xs" />}
        </div>

      </Link>

      {market.newsLinks?.length > 0 && (
        <div className="px-4 pb-3 pt-0 border-t border-[var(--color-border)]">
          {market.newsLinks.slice(0, 1).map((link, i) => (
            <a
              key={i}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-gold)] transition-colors pt-2"
            >
              <span className="truncate">{link.source}: {link.title}</span>
              <span className="text-[var(--color-text-muted)] flex-shrink-0">{link.timestamp}</span>
            </a>
          ))}
        </div>
      )}
    </motion.div>
  );
};

export default MarketCard;
