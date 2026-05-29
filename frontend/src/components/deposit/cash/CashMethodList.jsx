import PaymentMethodTile from './PaymentMethodTile';
import { MOONPAY_METHODS } from '../../../lib/moonpay';

/**
 * Payment method list with "Most popular" and "Other options" sections
 * Matches Polymarket's Use Cash tab layout
 */
const CashMethodList = ({ onSelect }) => {
  const availableMethods = MOONPAY_METHODS.filter((m) => !m.upcoming);
  const upcomingMethods = MOONPAY_METHODS.filter((m) => m.upcoming);

  const popularMethod = availableMethods.find((m) => m.popular);
  const otherMethods = availableMethods.filter((m) => !m.popular);

  return (
    <div className="space-y-4">
      {/* Most Popular */}
      {popularMethod && (
        <div>
          <p className="text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wider mb-2 px-1">
            Most popular
          </p>
          <PaymentMethodTile
            method={popularMethod}
            onClick={() => onSelect(popularMethod.id)}
            popular
          />
        </div>
      )}

      {/* Other Options */}
      <div>
        {/* <p className="text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wider mb-2 px-1">
          Other options
        </p>
        <div className="space-y-2">
          {otherMethods.map((method) => (
            <PaymentMethodTile
              key={method.id}
              method={method}
              onClick={() => onSelect(method.id)}
            />
          ))}
          {upcomingMethods.map((method) => (
            <PaymentMethodTile
              key={method.id}
              method={method}
              onClick={() => {}}
            />
          ))}
        </div> */}
      </div>
    </div>
  );
};

export default CashMethodList;
