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

   bool Validate(SExecRequest &req, string &why, ENUM_ERR_ACTION &action)
   {
      action = ERR_NO_RETRY;

      SPositionSnapshot pos;
      if(!m_broker.PositionByTicket(req.ticket, pos))
      {
         why = "position not found";
         action = ERR_REFRESH_STATE;
         return false;
      }

      SSymbolRules rules;
      SVolumeRules vol;
      if(!m_broker.LoadRules(pos.symbol, rules, vol))
      {
         why = "symbol rules unavailable";
         action = ERR_RETRY_LATER;
         return false;
      }

      double bid, ask;
      if(!m_broker.Tick(pos.symbol, bid, ask))
      {
         why = "no tick";
         action = ERR_RETRY_LATER;
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
               action = ERR_REFRESH_STATE;
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
               action = ERR_RETRY_LATER;
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
               action = ERR_RETRY_LATER;
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
               action = ERR_REFRESH_STATE;
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
