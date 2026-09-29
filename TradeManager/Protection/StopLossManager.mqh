#ifndef TM_STOPLOSSMANAGER_MQH
#define TM_STOPLOSSMANAGER_MQH

#include "../Position/PositionState.mqh"
#include "../Execution/RequestBuilder.mqh"

struct SStopLossConfig
{
   int defaultSLPoints;     // 0 = leave unprotected positions alone
};

// Owns the initial stop loss.
// Every SL that leaves this module has already passed the broker's stop rules.
class CStopLossManager
{
private:
   SStopLossConfig m_cfg;
   CRequestBuilder m_builder;

public:
   CStopLossManager() { m_cfg.defaultSLPoints = 0; }

   void Configure(const SStopLossConfig &cfg) { m_cfg = cfg; }

   // A position without any stop gets the configured default; that stop also defines its R.
   bool ProposeInitial(CManagedPosition *p, const SSymbolRules &rules,
                       const double bid, const double ask, SExecRequest &req)
   {
      if(m_cfg.defaultSLPoints <= 0 || p.sl > 0.0)
         return false;

      const double dist = m_cfg.defaultSLPoints * rules.point;
      const double sl = rules.NormalizePrice(p.IsBuy() ? p.entry - dist : p.entry + dist);
      if(!rules.IsValidSL(p.IsBuy(), sl, bid, ask))
         return false;

      m_builder.ModifySL(p.ticket, sl, 0, "initial SL", req);
      req.initial = true;
      return true;
   }
};

#endif
