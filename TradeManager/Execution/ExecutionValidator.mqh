#ifndef TM_EXECUTIONVALIDATOR_MQH
#define TM_EXECUTIONVALIDATOR_MQH

#include "RequestBuilder.mqh"
#include "ErrorHandler.mqh"
#include "../Broker/BrokerAdapter.mqh"

// Last line of defence: nothing invalid is ever sent to MT5.
// It checks the request against the live position, prices and symbol rules,
// and normalizes prices and volumes in place.
class CExecutionValidator
{
private:
   CBrokerAdapter *m_broker;

public:
   CExecutionValidator() { m_broker = NULL; }

   void Attach(CBrokerAdapter *broker) { m_broker = broker; }

   // Checks a new order against lot rules, the market and the broker's stop distance.
   // Prices and volume are normalized in place. maxLot <= 0 means no cap.
   bool ValidateOrder(SOrderRequest &req, const double maxLot, string &why)
   {
      SSymbolRules rules;
      SVolumeRules vol;
      if(!m_broker.LoadRules(req.symbol, rules, vol))
      {
         why = "symbol rules unavailable";
         return false;
      }
      double bid, ask;
      if(!m_broker.Tick(req.symbol, bid, ask))
      {
         why = "no tick";
         return false;
      }

      const bool isBuy = (req.type == ORDER_TYPE_BUY || req.type == ORDER_TYPE_BUY_LIMIT || req.type == ORDER_TYPE_BUY_STOP);
      const bool pending = (req.type != ORDER_TYPE_BUY && req.type != ORDER_TYPE_SELL);
      const double minD = rules.MinStopDistance();
      const double tol = rules.point * 0.5;

      const double requested = req.volume;
      req.volume = vol.Normalize(requested);
      if(req.volume <= 0.0)
      {
         why = StringFormat("lot %.2f is below the minimum %.2f (step %.2f)", requested, vol.minVol, vol.step);
         return false;
      }
      if(maxLot > 0.0 && req.volume > maxLot + TM_EPS)
      {
         why = StringFormat("lot %.2f exceeds the order cap %.2f", req.volume, maxLot);
         return false;
      }
      if(req.sl < 0.0 || req.tp < 0.0 || req.price < 0.0)
      {
         why = "negative price";
         return false;
      }
      if(req.sl > 0.0) req.sl = rules.NormalizePrice(req.sl);
      if(req.tp > 0.0) req.tp = rules.NormalizePrice(req.tp);

      double ref;                         // the level SL and TP are measured from
      if(pending)
      {
         if(req.price <= 0.0)
         {
            why = "a pending order needs a price";
            return false;
         }
         req.price = rules.NormalizePrice(req.price);
         bool ok = false;
         switch(req.type)
         {
            case ORDER_TYPE_BUY_LIMIT:  ok = (ask - req.price >= minD - tol) && req.price < ask; break;
            case ORDER_TYPE_BUY_STOP:   ok = (req.price - ask >= minD - tol) && req.price > ask; break;
            case ORDER_TYPE_SELL_LIMIT: ok = (req.price - bid >= minD - tol) && req.price > bid; break;
            case ORDER_TYPE_SELL_STOP:  ok = (bid - req.price >= minD - tol) && req.price < bid; break;
         }
         if(!ok)
         {
            why = StringFormat("%s price %s is on the wrong side of the market or closer than %d points",
                               TM_OrderText(req.type), DoubleToString(req.price, rules.digits), (int)rules.stopsPoints);
            return false;
         }
         ref = req.price;
      }
      else
         ref = isBuy ? bid : ask;

      if(req.sl > 0.0)
      {
         const double d = isBuy ? ref - req.sl : req.sl - ref;
         if(d <= 0.0 || d < minD - tol)
         {
            why = StringFormat("SL %s is on the wrong side or closer than %d points", DoubleToString(req.sl, rules.digits), (int)rules.stopsPoints);
            return false;
         }
      }
      if(req.tp > 0.0)
      {
         const double d = isBuy ? req.tp - ref : ref - req.tp;
         if(d <= 0.0 || d < minD - tol)
         {
            why = StringFormat("TP %s is on the wrong side or closer than %d points", DoubleToString(req.tp, rules.digits), (int)rules.stopsPoints);
            return false;
         }
      }
      return true;
   }

   bool Validate(SExecRequest &req, string &why, ENUM_ERR_ACTION &action)
   {
      action = EXA_NO_RETRY;

      SPositionSnapshot pos;
      if(!m_broker.PositionByTicket(req.ticket, pos))
      {
         why = "position not found";
         action = EXA_REFRESH_STATE;
         return false;
      }

      SSymbolRules rules;
      SVolumeRules vol;
      if(!m_broker.LoadRules(pos.symbol, rules, vol))
      {
         why = "symbol rules unavailable";
         action = EXA_RETRY_LATER;
         return false;
      }

      double bid, ask;
      if(!m_broker.Tick(pos.symbol, bid, ask))
      {
         why = "no tick";
         action = EXA_RETRY_LATER;
         return false;
      }

      const bool isBuy = (pos.type == POSITION_TYPE_BUY);

      switch(req.type)
      {
         case EXEC_MODIFY_SL:
         {
            req.sl = rules.NormalizePrice(req.sl);
            if(MathAbs(req.sl - pos.sl) < rules.point * 0.5)
            {
               why = "stop loss already at requested level";
               action = EXA_REFRESH_STATE;
               return false;
            }
            if(!rules.IsValidSL(isBuy, req.sl, bid, ask))
            {
               why = StringFormat("SL %s violates minimum stop distance", DoubleToString(req.sl, rules.digits));
               return false;
            }
            if(rules.IsFrozen(isBuy, pos.sl, pos.tp, bid, ask))
            {
               why = "position is inside the freeze level";
               action = EXA_RETRY_LATER;
               return false;
            }
            return true;
         }

         case EXEC_MODIFY_TP:
         {
            req.tp = rules.NormalizePrice(req.tp);
            if(!rules.IsValidTP(isBuy, req.tp, bid, ask))
            {
               why = StringFormat("TP %s violates minimum stop distance", DoubleToString(req.tp, rules.digits));
               return false;
            }
            if(rules.IsFrozen(isBuy, pos.sl, pos.tp, bid, ask))
            {
               why = "position is inside the freeze level";
               action = EXA_RETRY_LATER;
               return false;
            }
            return true;
         }

         case EXEC_MODIFY_LEVELS:
         {
            if(req.sl < 0.0 || req.tp < 0.0)
            {
               why = "negative price";
               return false;
            }
            if(req.sl > 0.0) req.sl = rules.NormalizePrice(req.sl);
            if(req.tp > 0.0) req.tp = rules.NormalizePrice(req.tp);

            const bool slChanged = MathAbs(req.sl - pos.sl) >= rules.point * 0.5;
            const bool tpChanged = MathAbs(req.tp - pos.tp) >= rules.point * 0.5;
            if(!slChanged && !tpChanged)
            {
               why = "levels already as requested";
               return false;
            }
            // Only levels that actually change are checked: an untouched one may already
            // sit inside the stop distance after the market moved.
            if(slChanged && req.sl > 0.0 && !rules.IsValidSL(isBuy, req.sl, bid, ask))
            {
               why = StringFormat("SL %s violates minimum stop distance", DoubleToString(req.sl, rules.digits));
               return false;
            }
            if(tpChanged && req.tp > 0.0 && !rules.IsValidTP(isBuy, req.tp, bid, ask))
            {
               why = StringFormat("TP %s violates minimum stop distance", DoubleToString(req.tp, rules.digits));
               return false;
            }
            if(rules.IsFrozen(isBuy, pos.sl, pos.tp, bid, ask))
            {
               why = "position is inside the freeze level";
               action = EXA_RETRY_LATER;
               return false;
            }
            return true;
         }

         case EXEC_PARTIAL_CLOSE:
         {
            req.volume = vol.Normalize(req.volume);
            if(req.volume <= 0.0)
            {
               why = "partial volume below minimum lot";
               return false;
            }
            if(req.volume >= pos.volume - TM_EPS)
            {
               why = "partial volume covers the whole position";
               action = EXA_REFRESH_STATE;
               return false;
            }
            if(pos.volume - req.volume < vol.minVol - TM_EPS)
            {
               why = "remaining volume would be below minimum lot";
               return false;
            }
            return true;
         }

         case EXEC_CLOSE:
            return true;
      }

      why = "unknown request type";
      return false;
   }
};

#endif
