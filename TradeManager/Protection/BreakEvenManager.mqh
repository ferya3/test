#ifndef TM_BREAKEVENMANAGER_MQH
#define TM_BREAKEVENMANAGER_MQH

#include "../Position/PositionState.mqh"
#include "../Execution/RequestBuilder.mqh"

struct SBreakEvenConfig
{
   bool   enabled;
   double triggerR;    // profit, in multiples of the initial risk, that arms break-even
   double offsetR;     // profit locked once armed, in multiples of the initial risk
};

// Once the trade is triggerR up, move the stop to entry +/- offsetR.
//   BUY, entry 2650, risk 2.5, trigger 1R, offset 0.1R -> arms at 2652.5, SL = 2650.25
class CBreakEvenManager
{
private:
   SBreakEvenConfig m_cfg;
   CRequestBuilder  m_builder;

public:
   CBreakEvenManager() { m_cfg.enabled = false; m_cfg.triggerR = 1.0; m_cfg.offsetR = 0.0; }

   void Configure(const SBreakEvenConfig &cfg) { m_cfg = cfg; }
   void SetEnabled(const bool on) { m_cfg.enabled = on; }
   bool Enabled() const { return m_cfg.enabled; }

   bool Propose(CManagedPosition *p, const SSymbolRules &rules,
                const double bid, const double ask, SExecRequest &req)
   {
      if(!m_cfg.enabled || p.HasFlag(TM_FLAG_BE) || !p.HasRisk())
         return false;

      if(p.ProfitDistance(bid, ask) < m_cfg.triggerR * p.initialRisk)
         return false;

      const double lock = m_cfg.offsetR * p.initialRisk;
      const double sl = rules.NormalizePrice(p.IsBuy() ? p.entry + lock : p.entry - lock);

      // The stop is already at or past break-even (moved by hand, or by trailing).
      if(p.sl > 0.0 && (p.IsBuy() ? p.sl >= sl : p.sl <= sl))
      {
         p.SetFlag(TM_FLAG_BE);
         return false;
      }
      if(!rules.IsValidSL(p.IsBuy(), sl, bid, ask))
         return false;

      m_builder.ModifySL(p.ticket, sl, TM_FLAG_BE, "break-even", req);
      return true;
   }
};

#endif
